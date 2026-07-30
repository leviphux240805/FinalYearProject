# Run Matchday — Setup guide (read once, then delete this file if you like)

The "Run Matchday" feature is done: pick 11 starting players + a captain on
the web → click **▶ Run Matchday** → the backend computes points using the
`CalculatePlayerMatchPoints` algorithm → the score + each player's stats on
the lineup are updated, and the squad is locked for that gameweek.

## New/modified files

**Backend (`fantasy-backend/`)**
- `prisma/schema.prisma` — added the `PlayerGameweekStat` model, a `points`
  field on `SquadPick`, and `totalPoints` on `UserSquad`.
- `prisma/migrations/20260724130000_add_matchday_scoring/migration.sql` —
  hand-written following the same convention as the older migrations (the
  sandbox couldn't download the Prisma engine for Linux, so `prisma migrate dev`
  couldn't be run here).
- `services/scoringService.js` — the scoring algorithm (pure function).
- `services/matchdayService.js` — the "run matchday" logic (transaction + row lock).
- `services/transferService.js` — updated to **block buy/sell once the squad is locked**
  (previously `isLocked` was declared but nothing ever set it to `true`, so it
  was never actually enforced; now it's properly checked and throws `SquadLockedError`).
- `routes/matchday.js` — `POST /api/matchday/run` (requires JWT).
- `scripts/seedGameweekStats.js` — loads Gameweek 1 data for 65 curated
  players (real data for 6 Premier League clubs, placeholder for the other 4
  clubs — see the comment at the top of the file).
- `server.js` — mounts the new route.

**Frontend (`super-league-fantasy/`)**
- `src/store.js` — `runMatchday()`, `squadLocked` / `isRunningMatchday` state.
- `src/components/SquadPitch.vue` — "▶ Run Matchday" button + lock banner.
- `src/components/TransferMarket.vue` — disables "+ Buy" once locked.

## Needs to be run on your machine (this sandbox has no DB/network access to do it for you)

```bash
cd fantasy-backend

# 1. Apply the new migration to Postgres + regenerate the Prisma Client
npx prisma migrate dev

# If for some reason Prisma reports drift against the hand-written migration.sql,
# the safest fix is to delete the migrations/20260724130000_add_matchday_scoring
# folder and re-run the same command above — Prisma will regenerate the correct
# migration from schema.prisma.

# 2. Load Gameweek 1 data
node scripts/seedGameweekStats.js

# 3. Start the server as usual
node server.js
```

## Important notes

- Only the **11 starting players** score points; substitutes always score 0
  (the MVP doesn't have auto-substitution yet).
- A Captain must be picked before clicking the button, otherwise the backend rejects it.
- After running, `UserSquad.isLocked = true` — no more buying/selling players
  for that gameweek (enforced at both layers: the frontend button and
  `transferService` on the backend, following the project's "never trust the
  client" principle).
- Gameweek 1 data for PSG/Barcelona/Real Madrid/Bayern (4 clubs not playing
  Premier League fixtures on the same date) is currently a **neutral
  placeholder** (90 minutes, 0 events) — clearly noted in the comment in
  `seedGameweekStats.js`. Can be replaced later with real La Liga/Bundesliga/
  Ligue 1 GW1 data if needed, or integrated directly with Sportmonks (a stub
  `/api/players/:id/profile` already exists in `server.js`).
