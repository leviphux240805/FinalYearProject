<template>
  <div class="welcome-overlay">
    <div class="welcome-modal">
      <button class="skip-btn" @click="close">Skip ✕</button>

      <transition name="step-fade" mode="out-in">
        <div class="step-content" :key="stepIndex">
          <div class="step-icon">{{ steps[stepIndex].icon }}</div>
          <h2>{{ steps[stepIndex].title }}</h2>
          <p>{{ steps[stepIndex].body }}</p>
        </div>
      </transition>

      <div class="step-dots">
        <span
          v-for="(s, i) in steps"
          :key="i"
          :class="['dot', { active: i === stepIndex }]"
          @click="stepIndex = i"
        ></span>
      </div>

      <div class="step-actions">
        <button v-if="stepIndex > 0" class="btn-back" @click="stepIndex--">Back</button>
        <div class="spacer"></div>
        <button v-if="stepIndex < steps.length - 1" class="btn-next" @click="stepIndex++">Next →</button>
        <button v-else class="btn-start" @click="close">Let's Play! ⚽</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { globalStore } from '../store';

const stepIndex = ref(0);

// Short, non-blocking summary of the 4 core gameplay loops — shown once
// right after registration (store.js's register()), never forced: the
// player can Skip at any point or click through at their own pace, matching
// the "welcome modal, no mandatory actions" scope (unlike a full spotlight
// tutorial that would block real UI interaction).
const steps = [
  {
    icon: '🏟️',
    title: 'Build Your Squad',
    body: 'Pick 15 real players from the top 5 European leagues within your $100M budget — a valid starting XI needs 1 GK, 3-5 DEF, 2-5 MID, 1-3 FWD, plus a 4-player bench.',
  },
  {
    icon: '🛒',
    title: 'Trade in the Transfer Market',
    body: 'Buy and sell players any time. Short on cash? Overdraft up to $2.0M (BNPL) for a -4 point penalty. Max 3 players from the same club.',
  },
  {
    icon: '👑',
    title: 'Set Captain & Vice-Captain',
    body: 'Your Captain scores double points. If they don\'t play a gameweek, your Vice-Captain automatically takes over the armband — always set both.',
  },
  {
    icon: '▶️',
    title: 'Run Matchday',
    body: 'Once your starting XI and Captain are locked in, hit "Run Matchday" to score real points from real match statistics — then check the live leaderboard!',
  },
];

function close() {
  globalStore.dismissWelcomeModal();
}
</script>

<style scoped>
.welcome-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 23, 0.92);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: overlay-in 0.25s ease;
}
@keyframes overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.welcome-modal {
  position: relative;
  background: #1a2232;
  border: 1px solid #2f3f55;
  border-radius: 18px;
  padding: 44px 40px 32px;
  width: 100%;
  max-width: 440px;
  text-align: center;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(15, 185, 177, 0.12);
  animation: modal-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes modal-pop {
  from { opacity: 0; transform: scale(0.92) translateY(12px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.skip-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  color: #6b7a8d;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
  transition: color 0.15s;
}
.skip-btn:hover { color: #e0e6ed; }

.step-content { min-height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.step-icon {
  font-size: 52px;
  margin-bottom: 16px;
  filter: drop-shadow(0 0 16px rgba(15, 185, 177, 0.35));
  animation: icon-bounce 0.5s ease;
}
@keyframes icon-bounce {
  0% { transform: scale(0.5); opacity: 0; }
  60% { transform: scale(1.12); opacity: 1; }
  100% { transform: scale(1); }
}
.step-content h2 {
  font-size: 19px;
  font-weight: 800;
  color: #fff;
  margin-bottom: 12px;
  letter-spacing: 0.2px;
}
.step-content p {
  font-size: 13.5px;
  line-height: 1.6;
  color: #a4b0be;
  max-width: 340px;
}

.step-fade-enter-active, .step-fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.step-fade-enter-from { opacity: 0; transform: translateX(16px); }
.step-fade-leave-to { opacity: 0; transform: translateX(-16px); }

.step-dots { display: flex; justify-content: center; gap: 8px; margin: 24px 0 20px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #2f3f55; cursor: pointer; transition: all 0.2s; }
.dot.active { background: #0fb9b1; width: 22px; border-radius: 4px; }

.step-actions { display: flex; align-items: center; gap: 10px; }
.spacer { flex: 1; }
.btn-back {
  background: none;
  border: 1px solid #2f3f55;
  color: #a4b0be;
  padding: 10px 18px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-back:hover { border-color: #4a5568; color: #e0e6ed; }
.btn-next, .btn-start {
  background: linear-gradient(135deg, #0fb9b1, #0a8d87);
  border: none;
  color: #fff;
  padding: 11px 22px;
  border-radius: 9px;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 0.2px;
}
.btn-next:hover, .btn-start:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(15, 185, 177, 0.35);
}
</style>
