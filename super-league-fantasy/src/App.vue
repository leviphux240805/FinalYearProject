<template>
  <div class="app-container">
    <!-- AUTH GATE - Shown when not logged in -->
    <AuthModal v-if="!store.isAuthenticated" />

    <!-- WELCOME WALKTHROUGH - shown once, right after register() -->
    <WelcomeModal v-if="store.isAuthenticated && store.showWelcomeModal" />

    <!-- MAIN CONTENT - Shown when logged in -->
    <template v-else>
      <header class="header">
        <div class="logo">🏆 SUPER LEAGUE PRO</div>

        <!-- GAMEWEEK COUNTDOWN TIMER -->
        <!-- <div class="deadline-timer">
          <span class="gw-label">Gameweek 15 locks in:</span>
          <span class="time-countdown">{{ formatTime(timeLeft) }}</span>
        </div> -->

        <!-- LIVE TOTAL POINTS -->
        <div class="total-points-badge">
          <span class="pts-label">⚡ GW Total Points</span>
          <span class="pts-value">{{ store.totalLivePoints }}</span>
        </div>

        <!-- PLAYER INFO + LOGOUT BUTTON -->
        <div class="user-bar">
          <div class="user-info">
            <span class="user-avatar">👤</span>
            <div class="user-details">
              <span class="user-name">{{ store.currentUser.username }}</span>
              <span class="user-balance" :class="{ 'balance-up': budgetFlash === 'up', 'balance-down': budgetFlash === 'down' }">${{ animatedBudget.toFixed(1) }}M left</span>
            </div>
          </div>
          <button class="logout-btn" @click="store.logout()" title="Log out">⏏</button>
        </div>

        <div class="status-bar">
          <span class="status-dot"></span> LIVE SERVER ACTIVE
        </div>
      </header>

      <!-- TAB NAVIGATION BAR -->
      <nav class="main-nav">
        <button :class="['nav-btn', { active: activeTab === 'squad' }]" @click="activeTab = 'squad'">
          🏟️ Squad & Market
        </button>
        <button :class="['nav-btn', { active: activeTab === 'transfer' }]" @click="activeTab = 'transfer'">
          🛒 Transfers
        </button>
        <button :class="['nav-btn', { active: activeTab === 'fixtures' }]" @click="activeTab = 'fixtures'">
          📅 Fixtures
        </button>
        <button :class="['nav-btn', { active: activeTab === 'compare' }]" @click="activeTab = 'compare'">
          ⚖️ Compare Players
        </button>
        <button :class="['nav-btn', { active: activeTab === 'gacha' }]" @click="activeTab = 'gacha'">
          🎁 Open Player Packs
        </button>
        <button :class="['nav-btn', { active: activeTab === 'guide' }]" @click="activeTab = 'guide'">
          📖 How to Play
        </button>
        <button :class="['nav-btn', { active: activeTab === 'leagues' }]" @click="activeTab = 'leagues'">
          🌍 Leagues & Clubs
        </button>
      </nav>

      <main class="main-content">
        <!-- TAB: SQUAD -->
        <div v-if="activeTab === 'squad'" class="squad-view">
          <SquadPitch />

          <div class="event-feed">
            <h3>⚡ Live Event Feed</h3>
            <ul v-if="store.eventFeed.length > 0">
              <li v-for="event in store.eventFeed" :key="event.id">
                <span class="time">[{{ event.time }}]</span> {{ event.text }}
              </li>
            </ul>
            <p v-else class="no-events">No events yet...</p>
          </div>
        </div>

        <!-- TAB: TRANSFERS -->
        <div v-else-if="activeTab === 'transfer'" class="market-view">
          <TransferMarket />
        </div>

        <!-- TAB: FIXTURES (feedback item A2 — moved out of Squad & Market,
             the fixtures card was too tall alongside the pitch+bench) -->
        <div v-else-if="activeTab === 'fixtures'" class="full-view">
          <GameweekFixtures />
        </div>

        <!-- TAB: COMPARE PLAYERS -->
        <div v-else-if="activeTab === 'compare'" class="full-view">
          <PlayerComparison />
        </div>

        <!-- TAB: GACHA PACKS -->
        <div v-else-if="activeTab === 'gacha'" class="full-view">
          <GachaPack />
        </div>

        <!-- TAB: BEGINNER'S GUIDE -->
        <div v-else-if="activeTab === 'guide'" class="full-view">
          <HowToPlay />
        </div>

        <!-- TAB: LEAGUES & CLUBS -->
        <div v-else-if="activeTab === 'leagues'" class="full-view">
          <LeaguesInfo />
        </div>
      </main>
    </template>

    <!-- BOTTOM-RIGHT TOAST NOTIFICATION SYSTEM -->
    <div class="toast-container">
      <transition-group name="toast-anim">
        <div v-for="toast in store.toasts" :key="toast.id" :class="['toast', toast.type]">
          <span class="toast-icon">{{ toast.type === 'error' ? '⚠️' : toast.type === 'info' ? 'ℹ️' : '✅' }}</span>
          {{ toast.message }}
        </div>
      </transition-group>
    </div>
  </div>
</template>

<script setup>
import SquadPitch from './components/SquadPitch.vue';
import GameweekFixtures from './components/GameweekFixtures.vue';
import TransferMarket from './components/TransferMarket.vue';
import AuthModal from './components/AuthModal.vue';
import WelcomeModal from './components/WelcomeModal.vue';
import PlayerComparison from './components/PlayerComparison.vue';
import GachaPack from './components/GachaPack.vue';
import HowToPlay from './components/HowToPlay.vue';
import LeaguesInfo from './components/LeaguesInfo.vue';
import { globalStore } from './store';
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useAnimatedNumber } from './composables/useAnimatedNumber';

const store = globalStore;
const activeTab = ref('squad');

// Balance eases up/down smoothly instead of jumping instantly after a
// buy/sell, plus a brief color "flash" to confirm the change just happened.
const animatedBudget = useAnimatedNumber(() => Number(store.budget));
const budgetFlash = ref(null);
let budgetFlashTimer = null;
watch(() => store.budget, (newVal, oldVal) => {
  if (typeof oldVal !== 'number' || newVal === oldVal) return;
  budgetFlash.value = newVal > oldVal ? 'up' : 'down';
  clearTimeout(budgetFlashTimer);
  budgetFlashTimer = setTimeout(() => { budgetFlash.value = null; }, 700);
});

// COUNTDOWN TIMER LOGIC
const timeLeft = ref(3600 * 24 + 5000);
let timerInterval;

onMounted(() => {
  timerInterval = setInterval(() => {
    if (timeLeft.value > 0) timeLeft.value--;
  }, 1000);
});

onUnmounted(() => {
  clearInterval(timerInterval);
});

const formatTime = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};
</script>

<style>
/* COUNTDOWN TIMER CSS */
.deadline-timer { display: flex; flex-direction: column; align-items: center; background: rgba(235,77,75,0.1); border: 1px solid rgba(235,77,75,0.4); padding: 5px 15px; border-radius: 8px; }
.gw-label { font-size: 11px; color: #ff7979; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; }
.time-countdown { font-size: 22px; font-weight: 900; color: #ffeb3b; font-family: 'Courier New', Courier, monospace; text-shadow: 0 0 10px rgba(255,235,59,0.5); }

/* Live total points */
.total-points-badge { display: flex; flex-direction: column; align-items: center; background: rgba(85,239,196,0.1); border: 1px solid rgba(85,239,196,0.4); padding: 5px 18px; border-radius: 8px; }
.pts-label { font-size: 11px; color: #55efc4; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; }
.pts-value { font-size: 28px; font-weight: 900; color: #55efc4; line-height: 1; text-shadow: 0 0 14px rgba(85,239,196,0.6); }

/* User bar */
.user-bar { display: flex; align-items: center; gap: 10px; background: rgba(15, 185, 177, 0.08); border: 1px solid rgba(15, 185, 177, 0.2); padding: 6px 12px 6px 10px; border-radius: 10px; }
.user-info { display: flex; align-items: center; gap: 8px; }
.user-avatar { font-size: 20px; }
.user-details { display: flex; flex-direction: column; }
.user-name { font-size: 13px; font-weight: 700; color: #0fb9b1; line-height: 1.2; }
.user-balance { font-size: 11px; color: #6b7a8d; transition: color 0.3s ease; }
.user-balance.balance-up { color: #55efc4; animation: balance-flash-up 0.7s ease; }
.user-balance.balance-down { color: #ff7979; animation: balance-flash-down 0.7s ease; }
@keyframes balance-flash-up {
  0% { color: #6b7a8d; }
  25% { color: #55efc4; text-shadow: 0 0 8px rgba(85,239,196,0.7); }
  100% { color: #6b7a8d; text-shadow: none; }
}
@keyframes balance-flash-down {
  0% { color: #6b7a8d; }
  25% { color: #ff7979; text-shadow: 0 0 8px rgba(255,121,121,0.7); }
  100% { color: #6b7a8d; text-shadow: none; }
}
@media (prefers-reduced-motion: reduce) {
  .user-balance.balance-up, .user-balance.balance-down { animation: none; }
}
.logout-btn { background: rgba(235, 77, 75, 0.1); border: 1px solid rgba(235, 77, 75, 0.3); color: #ff7979; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.logout-btn:hover { background: rgba(235, 77, 75, 0.25); }

/* Navigation Tabs */
.main-nav { display: flex; justify-content: center; gap: 16px; padding: 16px 0; background: #151a22; border-bottom: 1px solid #2f3640; }
.nav-btn { background: transparent; border: 2px solid #2f3640; color: #a4b0be; padding: 10px 28px; border-radius: 30px; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.25s; }
.nav-btn:hover { border-color: #0fb9b1; color: #fff; }
.nav-btn.active { background: #0fb9b1; border-color: #0fb9b1; color: #fff; box-shadow: 0 0 18px rgba(15, 185, 177, 0.4); }

/* Full-width view for comparison tab */
.full-view { width: 100%; max-width: 1000px; margin: 0 auto; animation: fadeIn 0.35s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

/* Reset & Dark Theme Base */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
body {
  background-color: #0f141e;
  color: #e0e6ed;
}
.app-container {
  min-height: 100vh;
}

/* Premium header */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #1e272e;
  padding: 20px 40px;
  border-bottom: 1px solid #2f3640;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
}
.logo {
  font-size: 24px;
  font-weight: 900;
  background: linear-gradient(to right, #0fb9b1, #f7b731);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: 1px;
}
.status-bar {
  font-size: 12px;
  font-weight: bold;
  color: #2bcbba;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(43, 203, 186, 0.1);
  padding: 6px 12px;
  border-radius: 20px;
}
.status-dot {
  width: 8px;
  height: 8px;
  background-color: #2bcbba;
  border-radius: 50%;
  box-shadow: 0 0 10px #2bcbba;
  animation: pulse 1.5s infinite;
}

/* Main layout */
.main-content {
  display: flex;
  gap: 24px;
  padding: 24px 32px;
  max-width: 1500px;
  margin: 0 auto;
}
.squad-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
  animation: fadeIn 0.35s ease;
}
.market-view {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  animation: fadeIn 0.35s ease;
}

/* Live Feed box */
.event-feed {
  background: #1e272e;
  padding: 15px 20px;
  border-radius: 12px;
  border: 1px solid #2f3640;
  height: 150px;
  overflow-y: auto;
}
.event-feed h3 {
  font-size: 14px;
  color: #f7b731;
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.event-feed ul {
  list-style: none;
}
.event-feed li {
  font-size: 13px;
  margin-bottom: 8px;
  color: #d1d8e0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  padding-bottom: 5px;
}
.time {
  color: #0fb9b1;
  font-family: monospace;
}
.no-events {
  font-size: 12px;
  color: #7f8fa6;
  font-style: italic;
}

/* Professional toast notifications */
.toast-container {
  position: fixed;
  bottom: 30px;
  right: 30px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 9999;
}
.toast {
  padding: 15px 25px;
  border-radius: 8px;
  color: white;
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.4);
  backdrop-filter: blur(5px);
}
.toast.success { background: rgba(16, 172, 132, 0.9); border-left: 4px solid #01a3a4; }
.toast.error { background: rgba(238, 82, 83, 0.9); border-left: 4px solid #ff9f43; }
.toast.info { background: rgba(52, 31, 151, 0.9); border-left: 4px solid #5f27cd; }

/* Toast slide-in/out animation */
.toast-anim-enter-active, .toast-anim-leave-active { transition: all 0.4s ease; }
.toast-anim-enter-from { opacity: 0; transform: translateX(100px); }
.toast-anim-leave-to { opacity: 0; transform: translateY(20px); }

/* Live indicator blink effect */
@keyframes pulse {
  0% { transform: scale(0.95); opacity: 0.5; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(0.95); opacity: 0.5; }
}

@media (max-width: 1380px) {
  .main-content {
    max-width: 100%;
    padding: 18px 16px;
  }
  .market-view {
    max-width: 100%;
  }
}

@media (max-width: 1180px) {
  .main-content {
    flex-direction: column;
  }
  .squad-view,
  .market-view {
    max-width: none;
    width: 100%;
  }
}
</style>
