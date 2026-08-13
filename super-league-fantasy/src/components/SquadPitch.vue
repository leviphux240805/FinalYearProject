<template>
  <div class="pitch-wrapper">
    <div class="pitch-header">
      <h2>Starting Lineup</h2>
      <span class="instruction">Click → Captain | Right-click → Vice-Captain | Drag & drop → Substitute (starter ↔ bench) or reorder bench priority (bench ↔ bench)</span>
      <div class="formation-badge">
        Formation: <strong>{{ store.currentFormation }}</strong>
      </div>

      <div v-if="store.squadLocked" class="locked-banner">
        🔒 Squad locked — This gameweek has already been scored ({{ store.totalLivePoints }} points)
      </div>
      <button
        v-else
        class="run-matchday-btn"
        :disabled="!canRunMatchday || store.isRunningMatchday"
        :title="runButtonTitle"
        @click="store.runMatchday()"
      >
        {{ store.isRunningMatchday ? '⏳ Running...' : '▶ Run Matchday' }}
      </button>
    </div>

    <!-- PITCH (STARTING XI) -->
    <div class="pitch">
      <div v-for="role in ['FWD', 'MID', 'DEF', 'GK']" :key="role" :class="['row', role.toLowerCase()]">
        <div
          v-for="player in getStarting(role)" :key="player.id"
          class="player-slot starting animate-appear"
          :class="[
            'pos-' + player.position,
            { 'is-captain': store.captainId === player.id, 'is-vice': store.viceCaptainId === player.id },
            dropZoneClass(player.id),
            { 'invalid-shake': invalidDropId === player.id },
          ]"
          @click="store.setCaptain(player.id)"
          @contextmenu.prevent="store.setViceCaptain(player.id)"
          :draggable="!store.squadLocked"
          @dragstart="onDragStart($event, player.id)"
          @dragover.prevent="onDragOver(player.id)"
          @dragleave="onDragLeave(player.id)"
          @drop="onDrop($event, player.id)"
        >
          <div class="player-kit">
            <div class="shirt" :style="!hasPhoto(player) ? clubShirtStyle(player) : null" :title="player.teamName || ''">
              <img v-if="hasPhoto(player)" :src="player.photoUrl" class="shirt-photo" alt="" @error="onPhotoError(player.id)" />
              <template v-else>{{ squadNumber(player.id) }}</template>
            </div>
            <div v-if="store.captainId === player.id" class="captain-armband">C</div>
            <div v-else-if="store.viceCaptainId === player.id" class="vice-armband">V</div>
          </div>
          <div class="name">{{ player.name }}</div>
          <div class="points" :class="{'points-glow': player.livePoints > 0}">{{ player.livePoints }} pts</div>
          <div v-if="player.liveEvent" class="live-badge">{{ player.liveEvent }}</div>
          <button v-if="!store.squadLocked" class="sell-btn" @click.stop="store.sellPlayer(player.id)" title="Sell player">✕</button>
        </div>
      </div>
    </div>

    <!-- BENCH -->
    <div class="bench-zone">
      <h3>Bench</h3>
      <div class="bench-container">
        <div
          v-for="(player, index) in getBench()" :key="player.id"
          class="player-slot bench-player animate-appear"
          :class="['pos-' + player.position, dropZoneClass(player.id), { 'invalid-shake': invalidDropId === player.id }]"
          :draggable="!store.squadLocked"
          @dragstart="onDragStart($event, player.id)"
          @dragover.prevent="onDragOver(player.id)"
          @dragleave="onDragLeave(player.id)"
          @drop="onDrop($event, player.id)"
        >
          <div class="player-kit">
            <div class="shirt b-shirt" :style="!hasPhoto(player) ? clubShirtStyle(player) : null" :title="player.teamName || ''">
              <img v-if="hasPhoto(player)" :src="player.photoUrl" class="shirt-photo" alt="" @error="onPhotoError(player.id)" />
              <template v-else>{{ squadNumber(player.id) }}</template>
            </div>
          </div>
          <div class="bench-priority" :title="'Substitute priority ' + (index + 1)">{{ index + 1 }}</div>
          <div class="name b-name">{{ player.name }}</div>
          <button v-if="!store.squadLocked" class="sell-btn" @click.stop="store.sellPlayer(player.id)" title="Sell player">✕</button>
        </div>
        <div v-if="getBench().length === 0" class="bench-empty">No bench players yet</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { globalStore } from '../store';
import { getClubColor, isLightColor } from '../clubColors';
const store = globalStore;

// Shirt fill color = the player's real club color (feedback item A3 —
// "phải hiện được màu áo đúng của từng cầu thủ"); the thin border color
// stays position-based (pos-FWD/MID/DEF/GK below) so both signals — "what
// club" and "what position" — are visible on the same shirt at a glance.
// Only applied when there's no real photo (hasPhoto already falls back to
// the shirt-number circle in that case).
const clubShirtStyle = (player) => {
  const color = getClubColor(player.teamName);
  return {
    backgroundColor: color,
    color: isLightColor(color) ? '#1e272e' : '#ffffff',
  };
};

// Real player photos (media.api-sports.io) only exist for real-dataset
// players — the 65 curated players and any photo that 404s both fall back
// to the shirt number as before.
const brokenPhotoIds = reactive(new Set());
const onPhotoError = (id) => brokenPhotoIds.add(id);
const hasPhoto = (player) => !!player.photoUrl && !brokenPhotoIds.has(player.id);

const getStarting = (role) => store.squad.filter(p => p.position === role && p.isStarting);
// Sorted by benchOrder (feedback item A4 — substitute priority): 1st sub,
// 2nd sub... first, unordered bench players (benchOrder null, e.g. never
// dragged into an order yet) fall to the end.
const getBench = () => [...store.squad.filter(p => !p.isStarting)]
  .sort((a, b) => (a.benchOrder ?? 999) - (b.benchOrder ?? 999));

// Shirt number shown on the pitch: does NOT use player.id directly as the
// shirt number — with the real player dataset (297 players loaded from
// API-Football, see report Section 5.5), id is a large primary key (e.g.
// 358628), and cramming 6 digits into a 46px circle both breaks the text and
// looks cluttered. Instead, numbers 1-11 are assigned to the starting XI (in
// display order FWD → MID → DEF → GK) and 12+ to the bench, matching the
// familiar shirt-numbering convention of other fantasy apps.
const orderedSquadIds = computed(() => [
  ...getStarting('FWD'), ...getStarting('MID'), ...getStarting('DEF'), ...getStarting('GK'),
  ...getBench(),
].map(p => p.id));
const squadNumber = (playerId) => orderedSquadIds.value.indexOf(playerId) + 1;

const canRunMatchday = computed(() =>
  store.squad.filter(p => p.isStarting).length === 11 && !!store.captainId
);
const runButtonTitle = computed(() => {
  if (store.squad.filter(p => p.isStarting).length !== 11) return 'You need exactly 11 starting players';
  if (!store.captainId) return 'You need to pick a Captain first';
  return 'Score the starting lineup for this gameweek';
});

let draggedId = null;
const dragOverId = ref(null);
const invalidDropId = ref(null);

const onDragStart = (event, playerId) => {
  if (store.squadLocked) { event.preventDefault(); return; }
  draggedId = playerId;
  event.dataTransfer.setData('playerId', playerId);
  event.target.closest('.player-slot').classList.add('dragging');
};

// Re-runs the exact rules from store.swapPlayers() (1 starter <-> 1 bench
// player, and can't bring in a second starting Goalkeeper) purely to
// highlight valid/invalid drop targets while dragging — doesn't change real
// state, doesn't change business logic, just reads store.squad to predict
// the outcome in advance.
const wouldBeValidDrop = (targetId) => {
  if (draggedId == null || targetId === draggedId) return false;
  const draggedPlayer = store.squad.find(p => p.id === draggedId);
  const targetPlayer = store.squad.find(p => p.id === targetId);
  if (!draggedPlayer || !targetPlayer) return false;
  if (targetPlayer.isStarting === draggedPlayer.isStarting) return false;

  const incomingStarter = draggedPlayer.isStarting ? targetPlayer : draggedPlayer;
  const outgoingStarter = draggedPlayer.isStarting ? draggedPlayer : targetPlayer;
  if (incomingStarter.position === 'GK') {
    const hasOtherStartingGK = store.squad.some(
      p => p.id !== outgoingStarter.id && p.isStarting && p.position === 'GK'
    );
    if (hasOtherStartingGK) return false;
  }
  return true;
};

const dropZoneClass = (targetId) => {
  if (dragOverId.value !== targetId) return '';
  return wouldBeValidDrop(targetId) ? 'drop-valid' : 'drop-invalid';
};

const onDragOver = (targetId) => {
  if (dragOverId.value !== targetId) dragOverId.value = targetId;
};

const onDragLeave = (targetId) => {
  if (dragOverId.value === targetId) dragOverId.value = null;
};

const onDrop = (event, targetId) => {
  const fromId = parseInt(event.dataTransfer.getData('playerId'));
  const wasValid = wouldBeValidDrop(targetId);

  if (fromId && fromId !== targetId) {
    store.swapPlayers(fromId, targetId);
  }

  if (!wasValid) {
    invalidDropId.value = targetId;
    setTimeout(() => { invalidDropId.value = null; }, 400);
  }

  dragOverId.value = null;
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
};
</script>

<style scoped>
.pitch-wrapper { background: linear-gradient(165deg, rgba(34, 44, 51, 0.85), rgba(26, 34, 40, 0.85)); padding: 22px; border-radius: 16px; box-shadow: 0 10px 34px rgba(0,0,0,0.32); border: 1px solid rgba(255,255,255,0.1); border-top: 2px solid #0fb9b1; }
.pitch-header { text-align: center; color: white; margin-bottom: 18px; }
.pitch-header h2 { font-size: 22px; color: #0fb9b1; margin-bottom: 6px; letter-spacing: 0.2px; }
.instruction { font-size: 12px; color: #a4b0be; display: block; margin-bottom: 10px; }
.formation-badge { margin-top: 4px; display: inline-block; background: rgba(255,255,255,0.08); padding: 5px 16px; border-radius: 20px; font-size: 13px; color: #dfe6e9; border: 1px solid rgba(255,255,255,0.15); }
.formation-badge strong { color: #f7b731; font-size: 15px; }

.run-matchday-btn {
  display: block;
  margin: 12px auto 0;
  background: linear-gradient(to right, #0fb9b1, #10ac84);
  color: white;
  border: none;
  padding: 10px 26px;
  border-radius: 24px;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.5px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(15, 185, 177, 0.4);
  transition: all 0.2s;
}
.run-matchday-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(15, 185, 177, 0.55); }
.run-matchday-btn:disabled { background: #3a4552; color: #7f8fa6; cursor: not-allowed; box-shadow: none; }

.locked-banner {
  margin-top: 12px;
  background: rgba(241, 196, 15, 0.12);
  border: 1px solid rgba(241, 196, 15, 0.4);
  color: #f7b731;
  font-size: 13px;
  font-weight: 700;
  padding: 8px 16px;
  border-radius: 20px;
  display: inline-block;
}

.pitch {
  background-color: #10ac84;
  background-image: repeating-linear-gradient(180deg, rgba(0,0,0,0.07) 0px, rgba(0,0,0,0.07) 40px, transparent 40px, transparent 80px);
  border: 2px solid rgba(255,255,255,0.6);
  border-radius: 12px;
  height: 520px;
  /* Extra top padding + overflow: visible (was 10px + overflow: hidden) —
     the live-badge above a player's shirt can now be up to 2 lines tall
     (see .live-badge below), and the FWD row renders first/topmost, so
     without this the badge for a top-row player (e.g. the Captain's
     "x2 Captain" tag) was clipped clean off by the pitch's own boundary.
     The background stripes + halfway-line/center-circle pseudo-elements
     still clip to the rounded corners on their own (background-clip is
     border-radius-aware even without overflow: hidden), so this only
     stops CHILD content (the badges) from being cut off, not the pitch
     art itself. */
  padding: 58px 0 10px 0;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  position: relative;
  overflow: visible;
  box-shadow: inset 0 0 50px rgba(0,0,0,0.5);
}
.pitch::before { content: ''; position: absolute; top: 50%; left: 0; right: 0; border-top: 2px solid rgba(255,255,255,0.3); }
.pitch::after { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80px; height: 80px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; }
.row { display: flex; justify-content: space-evenly; z-index: 10; align-items: center; min-height: 118px; }

.player-slot { text-align: center; color: white; width: 92px; cursor: grab; position: relative; transition: all 0.2s; }
.player-slot:active { cursor: grabbing; }
.player-slot:hover { transform: translateY(-5px) scale(1.05); }
.player-slot.dragging { opacity: 0.4; transform: scale(0.9); }
.player-kit { position: relative; width: 46px; height: 46px; margin: 0 auto; }
.shirt { width: 100%; height: 100%; border-radius: 50%; background: #ffffff; color: #2d3436; border: 2px solid #dfe6e9; line-height: 42px; font-weight: 900; font-size: 13px; box-shadow: 0 4px 10px rgba(0,0,0,0.4); transition: box-shadow 0.2s, border-color 0.2s; overflow: hidden; }
.shirt-photo { width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block; }

/* Shirt border color by position — matches the pos-badge color scheme in
   the Transfer Market (FWD red, MID orange, DEF blue, GK purple) so both
   screens share a single color language. Only the thin border (2px) changes
   color, NO extra outer glow — the glow ring is reserved for the
   Captain/Vice-Captain below, to avoid every player "glowing" and looking
   cluttered. */
.pos-FWD .shirt { border-color: #e57368; }
.pos-MID .shirt { border-color: #e6a15c; }
.pos-DEF .shirt { border-color: #5d9bc7; }
.pos-GK  .shirt { border-color: #b087c2; }

.is-captain .shirt { border: 3px solid #f1c40f; box-shadow: 0 0 16px #f1c40f; }
.is-vice .shirt { border: 3px solid #74b9ff; box-shadow: 0 0 13px #74b9ff; }
.captain-armband { position: absolute; bottom: -5px; right: -5px; background: #f1c40f; color: black; font-weight: bold; font-size: 10px; width: 20px; height: 20px; line-height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
.vice-armband { position: absolute; bottom: -5px; right: -5px; background: #74b9ff; color: #1e272e; font-weight: bold; font-size: 10px; width: 20px; height: 20px; line-height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
.name {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.2px;
  background: linear-gradient(165deg, rgba(52,60,64,0.95), rgba(38,45,49,0.95));
  padding: 5px 10px;
  border-radius: 8px;
  margin-top: 10px;
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 3px 8px rgba(0,0,0,0.3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 92px;
}
.points { font-size: 11px; margin-top: 6px; color: #b2bec3; font-weight: 600; background: rgba(255,255,255,0.06); padding: 2px 9px; border-radius: 10px; display: inline-block; }
.points-glow { color: #0f141e; font-weight: 800; background: #55efc4; text-shadow: none; box-shadow: 0 0 10px rgba(85,239,196,0.7); }

/* BENCH */
.bench-zone { margin-top: 18px; background: linear-gradient(165deg, rgba(0,0,0,0.28), rgba(0,0,0,0.18)); padding: 16px 18px; border-radius: 12px; border: 1px dashed #4a5560; }
.bench-zone h3 { font-size: 13px; color: #f7b731; text-align: center; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1.5px; }
.bench-container { display: flex; justify-content: center; gap: 24px; min-height: 74px; align-items: center; flex-wrap: wrap; }
.bench-player .b-shirt { border-color: #2d3436; }
.bench-player .b-name { background: rgba(0,0,0,0.45); color: #b2bec3; }
.bench-empty { font-size: 12px; color: #7f8fa6; font-style: italic; }
.bench-priority {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #f7b731;
  color: #1e272e;
  font-size: 10px;
  font-weight: 900;
  line-height: 18px;
  text-align: center;
  box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  border: 2px solid #1e272e;
}

.sell-btn {
  position: absolute;
  top: -6px;
  left: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ff4757;
  color: white;
  border: none;
  font-size: 10px;
  line-height: 18px;
  text-align: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  padding: 0;
  font-weight: bold;
  z-index: 20;
}
.player-slot:hover .sell-btn { opacity: 1; }

/* Anchored to the BOTTOM of the badge (bottom: 100% of the player-kit,
   i.e. flush against its top edge) rather than a fixed "top: -25px" —
   with multiple stat segments now joined by "  •  " (goal + assist +
   clean sheet + captain can all apply to the same player at once), the
   badge can wrap onto a second line. Anchoring from the bottom means it
   always sits flush above the shirt and grows UPWARD as it wraps, instead
   of a fixed top offset that assumed a single line and let taller content
   spill past the intended position. */
.live-badge {
  position: absolute;
  bottom: 100%;
  margin-bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  background: #ff4757;
  color: white;
  padding: 4px 9px;
  font-size: 10.5px;
  line-height: 1.4;
  font-weight: bold;
  border-radius: 6px;
  white-space: normal;
  max-width: 168px;
  text-align: center;
  z-index: 100;
  box-shadow: 0 4px 10px rgba(255,71,87,0.5);
  animation: popUp 0.3s forwards;
}
@keyframes popUp { 0% { margin-bottom: -6px; opacity: 0; } 100% { margin-bottom: 8px; opacity: 1; } }

/* "Bounce into place" when a player appears in a new slot (starter <->
   bench) — slight overshoot then settle, more of a snap-into-place feel
   than a plain fade. */
@keyframes animate-appear {
  0%   { opacity: 0; transform: scale(0.7); }
  60%  { opacity: 1; transform: scale(1.08); }
  100% { opacity: 1; transform: scale(1); }
}
.animate-appear { animation: animate-appear 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }

/* ===== DRAG-AND-DROP FEEDBACK ===== */
/* Highlight the target slot while dragging: green = valid, red = invalid
   (following the exact rules from swapPlayers() in store.js — see
   wouldBeValidDrop() in the script). */
.player-slot.drop-valid .shirt,
.player-slot.drop-valid .b-shirt {
  box-shadow: 0 0 0 3px #55efc4, 0 0 18px #55efc4;
  transition: box-shadow 0.15s ease;
}
.player-slot.drop-invalid .shirt,
.player-slot.drop-invalid .b-shirt {
  box-shadow: 0 0 0 3px #ff4757, 0 0 18px #ff4757;
  transition: box-shadow 0.15s ease;
}

/* Shake + bounce back when dropped on an invalid slot */
@keyframes invalid-shake {
  0%, 100% { transform: translateX(0) rotate(0); }
  20% { transform: translateX(-6px) rotate(-3deg); }
  40% { transform: translateX(5px) rotate(3deg); }
  60% { transform: translateX(-4px) rotate(-2deg); }
  80% { transform: translateX(3px) rotate(1deg); }
}
.player-slot.invalid-shake { animation: invalid-shake 0.4s ease-in-out; }

@media (prefers-reduced-motion: reduce) {
  .animate-appear { animation: none; }
  .player-slot.invalid-shake { animation: none; }
}
</style>
