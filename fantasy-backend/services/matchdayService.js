// ============================================================
// MatchdayService — "Run Matchday" (Run Gameweek)
//
// Takes the user's 11-player starting lineup + captain, reads the real match
// stats (PlayerGameweekStat) for the corresponding gameweek, applies
// auto-substitution + vice-captain fallback (see below), scores each
// contributing player via scoringService.calculatePlayerMatchPoints, then
// writes the result to the DB:
//   - SquadPick.points   : points for EACH player (starters, bench, and the
//                          starter a bench player subbed out both included,
//                          each showing their OWN real contribution — 0 for
//                          a starter who didn't play and got subbed out)
//   - UserSquad.totalPoints : the total points actually counted for this
//                             gameweek (post auto-sub, captain multiplier
//                             applied to whichever of Captain/Vice-Captain
//                             actually played)
//   - UserSquad.isLocked = true : locks the squad, preventing "Run Matchday"
//                                 from being clicked twice / the squad being
//                                 edited after results already exist
//
// AUTO-SUBSTITUTION (feedback item A4): if a starter recorded 0 minutes
// played (or has no stat row at all for this gameweek — treated the same
// way, matching the existing EMPTY_STATS fallback), the first bench player
// (by SquadPick.benchOrder) who DID play is swapped in for THIS gameweek's
// scoring only — the goalkeeper only subs for the goalkeeper; an outfield
// starter can be replaced by any outfield reserve, but only if the
// resulting formation stays within the standard bounds (1 GK, 3-5 DEF, 2-5
// MID, 1-3 FWD). SquadPick.isStarting is NOT rewritten in the DB — this is
// a per-matchday scoring event, not a permanent lineup change (there's no
// "squad carries over start-of-gameweek" mechanic to carry it into yet).
//
// VICE-CAPTAIN FALLBACK (feedback item A6): if the Captain's pick recorded
// 0 minutes played, the Captaincy's x2 multiplier is applied to the
// Vice-Captain instead (if the Vice-Captain played), rather than being lost
// for the gameweek.
//
// Everything runs inside a single Prisma $transaction + row lock (same as
// Algorithm 1 in transferService.js) so two simultaneous "Run Matchday"
// requests from the same user don't score on top of each other.
// ============================================================
const { PrismaClient } = require('@prisma/client');
const { calculatePlayerMatchPoints } = require('./scoringService');

const prisma = new PrismaClient();

const DEFAULT_GAMEWEEK = 1;
const REQUIRED_STARTERS = 11;

const EMPTY_STATS = Object.freeze({
  minutesPlayed: 0,
  goals: 0,
  assists: 0,
  yellowCards: 0,
  redCards: 0,
  cleanSheet: false,
  saves: 0,
});

// Standard fantasy-football formation bounds (excluding the fixed 1 GK,
// checked separately) — an auto-substitution is only applied if the
// resulting starting XI still satisfies these.
const FORMATION_BOUNDS = {
  DEF: { min: 3, max: 5 },
  MID: { min: 2, max: 5 },
  FWD: { min: 1, max: 3 },
};

class NotFoundError extends Error {}
class SquadIncompleteError extends Error {}
class AlreadyLockedError extends Error {}

function didNotPlay(stat) {
  return !stat || Number(stat.minutesPlayed) === 0;
}

function formationCounts(picks) {
  return picks.reduce((counts, p) => {
    counts[p.player.position] = (counts[p.player.position] || 0) + 1;
    return counts;
  }, {});
}

function isValidFormation(counts) {
  if ((counts.GK || 0) !== 1) return false;
  return ['DEF', 'MID', 'FWD'].every((pos) => {
    const bounds = FORMATION_BOUNDS[pos];
    const count = counts[pos] || 0;
    return count >= bounds.min && count <= bounds.max;
  });
}

// Returns a NEW array describing who actually counts as "on the pitch" for
// scoring purposes this gameweek: { pick, effectivePlayerId, stat,
// wasSubbedIn, subbedOutPlayerId }. Starters who didn't play and couldn't be
// replaced still appear (with EMPTY_STATS), same as before this feature.
function applyAutoSubstitutions(picks, statByPlayerId) {
  const starters = picks.filter((p) => p.isStarting);
  const bench = [...picks.filter((p) => !p.isStarting)]
    .sort((a, b) => (a.benchOrder ?? 999) - (b.benchOrder ?? 999));

  const usedBenchIds = new Set();
  const counts = formationCounts(starters);
  const lineup = starters.map((pick) => ({ pick, stat: statByPlayerId.get(pick.playerId) }));

  for (const entry of lineup) {
    if (!didNotPlay(entry.stat)) continue; // played fine, no sub needed

    if (entry.pick.player.position === 'GK') {
      const reserveGk = bench.find(
        (b) => !usedBenchIds.has(b.id) && b.player.position === 'GK' && !didNotPlay(statByPlayerId.get(b.playerId))
      );
      if (reserveGk) {
        usedBenchIds.add(reserveGk.id);
        entry.subInPick = reserveGk;
        entry.stat = statByPlayerId.get(reserveGk.playerId);
      }
      continue;
    }

    // Outfield: try each unused bench outfield player (in benchOrder) who
    // actually played, accepting the first one that keeps the formation valid.
    for (const candidate of bench) {
      if (usedBenchIds.has(candidate.id)) continue;
      if (candidate.player.position === 'GK') continue;
      if (didNotPlay(statByPlayerId.get(candidate.playerId))) continue;

      const projectedCounts = { ...counts };
      projectedCounts[entry.pick.player.position] -= 1;
      projectedCounts[candidate.player.position] = (projectedCounts[candidate.player.position] || 0) + 1;

      if (!isValidFormation(projectedCounts)) continue; // would break the formation, try the next candidate

      usedBenchIds.add(candidate.id);
      counts[entry.pick.player.position] -= 1;
      counts[candidate.player.position] = (counts[candidate.player.position] || 0) + 1;
      entry.subInPick = candidate;
      entry.stat = statByPlayerId.get(candidate.playerId);
      break;
    }
  }

  return lineup; // 11 entries; each either the original starter or their auto-sub replacement
}

async function runMatchday({ userId, gameweek = DEFAULT_GAMEWEEK }) {
  return prisma.$transaction(async (tx) => {
    const squad = await tx.userSquad.findUnique({
      where: { userId_gameweek: { userId, gameweek } },
      include: { picks: { include: { player: true } } },
    });

    if (!squad) {
      throw new NotFoundError(`You don't have a squad for Gameweek ${gameweek} yet.`);
    }

    // Row lock: if the user clicks the button twice in a row (double-click /
    // duplicate request), the second request must wait for the first to
    // commit before re-reading isLocked — preventing double-scoring and
    // totalPoints being added twice.
    await tx.$queryRaw`SELECT id FROM "UserSquad" WHERE id = ${squad.id} FOR UPDATE`;
    const freshSquad = await tx.userSquad.findUnique({ where: { id: squad.id } });

    if (freshSquad.isLocked) {
      throw new AlreadyLockedError(`Gameweek ${gameweek} has already been scored and cannot be run again.`);
    }

    const starters = squad.picks.filter((p) => p.isStarting);
    if (starters.length !== REQUIRED_STARTERS) {
      throw new SquadIncompleteError(
        `Your starting lineup needs exactly ${REQUIRED_STARTERS} players (currently ${starters.length}).`
      );
    }
    if (!squad.captainId) {
      throw new SquadIncompleteError("You haven't picked a Captain for this squad.");
    }

    const playerIds = squad.picks.map((p) => p.playerId);
    const statRows = await tx.playerGameweekStat.findMany({
      where: { playerId: { in: playerIds }, gameweek },
    });
    const statByPlayerId = new Map(statRows.map((s) => [s.playerId, s]));

    const lineup = applyAutoSubstitutions(squad.picks, statByPlayerId);

    // Decide the effective Captain: the real Captain if THEY played, else
    // the Vice-Captain if THEY played, else nobody gets the x2 this week.
    // Deliberately reads each player's OWN original stat row here (not the
    // lineup entry's `.stat`, which applyAutoSubstitutions may have already
    // reassigned to a substitute's stat) — the Captain/Vice-Captain armband
    // never transfers to a bench auto-sub, only to the named Vice-Captain,
    // exactly like real fantasy-football rules.
    let effectiveCaptainPlayerId = null;
    if (!didNotPlay(statByPlayerId.get(squad.captainId))) {
      effectiveCaptainPlayerId = squad.captainId;
    } else if (squad.viceCaptainId && !didNotPlay(statByPlayerId.get(squad.viceCaptainId))) {
      effectiveCaptainPlayerId = squad.viceCaptainId;
    }

    const scoredPlayerIds = new Set(lineup.map((e) => (e.subInPick || e.pick).playerId));

    const breakdown = [];
    let totalPoints = 0;

    for (const pick of squad.picks) {
      const lineupEntry = lineup.find((e) => e.pick.playerId === pick.playerId || e.subInPick?.playerId === pick.playerId);
      const isCountedThisWeek = scoredPlayerIds.has(pick.playerId);
      const stat = isCountedThisWeek ? statByPlayerId.get(pick.playerId) : null;
      const isCaptain = pick.playerId === effectiveCaptainPlayerId;
      const wasAutoSubbedIn = !!(lineupEntry?.subInPick && lineupEntry.subInPick.playerId === pick.playerId);
      const wasAutoSubbedOut = !!(lineupEntry?.subInPick && lineupEntry.pick.playerId === pick.playerId);

      const points = isCountedThisWeek
        ? calculatePlayerMatchPoints(stat || EMPTY_STATS, pick.player.position, isCaptain)
        : 0; // benched and never subbed in -> doesn't score, same as before this feature

      breakdown.push({
        playerId: pick.playerId,
        name: pick.player.name,
        position: pick.player.position,
        isStarting: pick.isStarting,
        isCaptain,
        wasAutoSubbedIn,
        wasAutoSubbedOut,
        hasMatchData: !!stat,
        stats: stat
          ? {
              minutesPlayed: stat.minutesPlayed,
              goals: stat.goals,
              assists: stat.assists,
              yellowCards: stat.yellowCards,
              redCards: stat.redCards,
              cleanSheet: stat.cleanSheet,
              saves: stat.saves,
            }
          : null,
        points,
      });

      if (isCountedThisWeek) totalPoints += points;
    }

    // Write each player's points. There's no (squadId, playerId) index, so
    // updateMany is used with the key pair — safe since playerId is unique
    // within a single squad.
    await Promise.all(
      breakdown.map((b) =>
        tx.squadPick.updateMany({
          where: { squadId: squad.id, playerId: b.playerId },
          data: { points: b.points },
        })
      )
    );

    await tx.userSquad.update({
      where: { id: squad.id },
      data: { totalPoints, isLocked: true },
    });

    return { gameweek, totalPoints, breakdown, effectiveCaptainPlayerId };
  }, { maxWait: 10000, timeout: 20000 }); // widened from Prisma's 2000/5000ms defaults — DATABASE_URL is a hosted instance, not localhost, and this transaction does a full squad read + per-player writes in one round trip budget
}

module.exports = {
  runMatchday,
  applyAutoSubstitutions,
  isValidFormation,
  NotFoundError,
  SquadIncompleteError,
  AlreadyLockedError,
  DEFAULT_GAMEWEEK,
  REQUIRED_STARTERS,
  FORMATION_BOUNDS,
};
