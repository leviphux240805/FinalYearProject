<template>
  <div class="pitch-wrapper">
    <div class="pitch-header">
      <h2>Đội hình ra sân</h2>
      <span class="instruction">Click → Đội trưởng | Chuột phải → Phó ĐT | Kéo thả → Thay người</span>
      <div class="formation-badge">
        Sơ đồ chiến thuật: <strong>{{ store.currentFormation }}</strong>
      </div>
    </div>

    <!-- SÂN CỎ (ĐÁ CHÍNH) -->
    <div class="pitch">
      <div v-for="role in ['FWD', 'MID', 'DEF', 'GK']" :key="role" :class="['row', role.toLowerCase()]">
        <div
          v-for="player in getStarting(role)" :key="player.id"
          class="player-slot starting animate-appear"
          :class="{ 'is-captain': store.captainId === player.id, 'is-vice': store.viceCaptainId === player.id }"
          @click="store.setCaptain(player.id)"
          @contextmenu.prevent="store.setViceCaptain(player.id)"
          draggable="true"
          @dragstart="onDragStart($event, player.id)"
          @dragover.prevent
          @drop="onDrop($event, player.id)"
        >
          <div class="player-kit">
            <div class="shirt">{{ player.id }}</div>
            <div v-if="store.captainId === player.id" class="captain-armband">C</div>
            <div v-else-if="store.viceCaptainId === player.id" class="vice-armband">V</div>
          </div>
          <div class="name">{{ player.name }}</div>
          <div class="points" :class="{'points-glow': player.livePoints > 0}">{{ player.livePoints }} pts</div>
          <div v-if="player.liveEvent" class="live-badge">{{ player.liveEvent }}</div>
          <button class="sell-btn" @click.stop="store.sellPlayer(player.id)" title="Bán cầu thủ">✕</button>
        </div>
      </div>
    </div>

    <!-- BĂNG GHẾ DỰ BỊ -->
    <div class="bench-zone">
      <h3>Băng ghế dự bị</h3>
      <div class="bench-container">
        <div
          v-for="player in getBench()" :key="player.id"
          class="player-slot bench-player animate-appear"
          draggable="true"
          @dragstart="onDragStart($event, player.id)"
          @dragover.prevent
          @drop="onDrop($event, player.id)"
        >
          <div class="player-kit">
            <div class="shirt b-shirt">{{ player.id }}</div>
          </div>
          <div class="name b-name">{{ player.name }}</div>
          <button class="sell-btn" @click.stop="store.sellPlayer(player.id)" title="Bán cầu thủ">✕</button>
        </div>
        <div v-if="getBench().length === 0" class="bench-empty">Chưa có cầu thủ dự bị</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { globalStore } from '../store';
const store = globalStore;

const getStarting = (role) => store.squad.filter(p => p.position === role && p.isStarting);
const getBench = () => store.squad.filter(p => !p.isStarting);

let draggedId = null;

const onDragStart = (event, playerId) => {
  draggedId = playerId;
  event.dataTransfer.setData('playerId', playerId);
  event.target.closest('.player-slot').classList.add('dragging');
};

const onDrop = (event, targetId) => {
  const fromId = parseInt(event.dataTransfer.getData('playerId'));
  if (fromId && fromId !== targetId) {
    store.swapPlayers(fromId, targetId);
  }
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
};
</script>

<style scoped>
.pitch-wrapper { background: rgba(30, 39, 46, 0.8); padding: 20px; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); }
.pitch-header { text-align: center; color: white; margin-bottom: 15px; }
.pitch-header h2 { font-size: 22px; color: #0fb9b1; margin-bottom: 0; }
.instruction { font-size: 12px; color: #a4b0be; }
.formation-badge { margin-top: 8px; display: inline-block; background: rgba(255,255,255,0.1); padding: 4px 14px; border-radius: 20px; font-size: 13px; color: #dfe6e9; border: 1px solid rgba(255,255,255,0.15); }
.formation-badge strong { color: #f7b731; font-size: 15px; }

.pitch {
  background-color: #10ac84;
  background-image: repeating-linear-gradient(180deg, rgba(0,0,0,0.07) 0px, rgba(0,0,0,0.07) 40px, transparent 40px, transparent 80px);
  border: 2px solid rgba(255,255,255,0.6);
  border-radius: 12px;
  height: 520px;
  padding: 10px 0;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  position: relative;
  overflow: hidden;
  box-shadow: inset 0 0 50px rgba(0,0,0,0.5);
}
.pitch::before { content: ''; position: absolute; top: 50%; left: 0; right: 0; border-top: 2px solid rgba(255,255,255,0.3); }
.pitch::after { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80px; height: 80px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; }
.row { display: flex; justify-content: space-evenly; z-index: 10; align-items: center; min-height: 108px; }

.player-slot { text-align: center; color: white; width: 80px; cursor: grab; position: relative; transition: all 0.2s; }
.player-slot:active { cursor: grabbing; }
.player-slot:hover { transform: translateY(-5px) scale(1.05); }
.player-slot.dragging { opacity: 0.4; transform: scale(0.9); }
.player-kit { position: relative; width: 42px; height: 42px; margin: 0 auto; }
.shirt { width: 100%; height: 100%; border-radius: 50%; background: #ffffff; color: #2d3436; border: 2px solid #dfe6e9; line-height: 38px; font-weight: 900; font-size: 13px; box-shadow: 0 4px 10px rgba(0,0,0,0.4); }
.is-captain .shirt { border: 3px solid #f1c40f; box-shadow: 0 0 15px #f1c40f; }
.is-vice .shirt { border: 3px solid #74b9ff; box-shadow: 0 0 12px #74b9ff; }
.captain-armband { position: absolute; bottom: -5px; right: -5px; background: #f1c40f; color: black; font-weight: bold; font-size: 10px; width: 20px; height: 20px; line-height: 20px; border-radius: 50%; border: 2px solid white; }
.vice-armband { position: absolute; bottom: -5px; right: -5px; background: #74b9ff; color: #1e272e; font-weight: bold; font-size: 10px; width: 20px; height: 20px; line-height: 20px; border-radius: 50%; border: 2px solid white; }
.name { font-size: 11px; font-weight: 700; background: rgba(45, 52, 54, 0.9); padding: 3px 5px; border-radius: 6px; margin-top: 8px; border: 1px solid rgba(255,255,255,0.1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 78px; }
.points { font-size: 11px; margin-top: 4px; color: #b2bec3; }
.points-glow { color: #55efc4; font-weight: bold; text-shadow: 0 0 8px #55efc4; }

/* BĂNG GHẾ DỰ BỊ */
.bench-zone { margin-top: 16px; background: rgba(0,0,0,0.25); padding: 12px 16px; border-radius: 10px; border: 1px dashed #636e72; }
.bench-zone h3 { font-size: 13px; color: #f7b731; text-align: center; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px; }
.bench-container { display: flex; justify-content: center; gap: 20px; min-height: 70px; align-items: center; flex-wrap: wrap; }
.bench-player .b-shirt { background: #636e72; border-color: #2d3436; color: #dfe6e9; }
.bench-player .b-name { background: rgba(0,0,0,0.5); color: #b2bec3; }
.bench-empty { font-size: 12px; color: #7f8fa6; font-style: italic; }

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

.live-badge { position: absolute; top: -25px; left: 50%; transform: translateX(-50%); background: #ff4757; color: white; padding: 4px 8px; font-size: 11px; font-weight: bold; border-radius: 6px; white-space: nowrap; z-index: 100; box-shadow: 0 4px 10px rgba(255,71,87,0.5); animation: popUp 0.3s forwards; }
@keyframes popUp { 0% { top: 0; opacity: 0; } 100% { top: -25px; opacity: 1; } }
@keyframes animate-appear { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
.animate-appear { animation: animate-appear 0.3s ease; }
</style>