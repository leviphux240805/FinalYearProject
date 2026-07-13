<template>
  <div class="app-container">
    <!-- CỔNG XÁC THỰC - Hiển thị khi chưa đăng nhập -->
    <AuthModal v-if="!store.isAuthenticated" />

    <!-- NỘI DUNG CHÍNH - Hiển thị khi đã đăng nhập -->
    <template v-else>
      <header class="header">
        <div class="logo">🏆 SUPER LEAGUE PRO</div>

        <!-- ĐỒNG HỒ ĐẾM NGƯỢC GAMEWEEK -->
        <!-- <div class="deadline-timer">
          <span class="gw-label">Đóng cửa Gameweek 15 trong:</span>
          <span class="time-countdown">{{ formatTime(timeLeft) }}</span>
        </div> -->

        <!-- TỔNG ĐIỂM LIVE -->
        <div class="total-points-badge">
          <span class="pts-label">⚡ Tổng điểm GW</span>
          <span class="pts-value">{{ store.totalLivePoints }}</span>
        </div>

        <!-- THÔNG TIN NGƯỜI CHƠI + NÚT ĐĂNG XUẤT -->
        <div class="user-bar">
          <div class="user-info">
            <span class="user-avatar">👤</span>
            <div class="user-details">
              <span class="user-name">{{ store.currentUser.username }}</span>
              <span class="user-balance">${{ Number(store.budget).toFixed(1) }}M còn lại</span>
            </div>
          </div>
          <button class="logout-btn" @click="store.logout()" title="Đăng xuất">⏏</button>
        </div>

        <div class="status-bar">
          <span class="status-dot"></span> LIVE SERVER ACTIVE
        </div>
      </header>

      <!-- THANH ĐIỀU HƯỚNG TABS -->
      <nav class="main-nav">
        <button :class="['nav-btn', { active: activeTab === 'squad' }]" @click="activeTab = 'squad'">
          🏟️ Đội Hình & Thị Trường
        </button>
        <button :class="['nav-btn', { active: activeTab === 'compare' }]" @click="activeTab = 'compare'">
          ⚖️ So Sánh Cầu Thủ
        </button>
        <button :class="['nav-btn', { active: activeTab === 'gacha' }]" @click="activeTab = 'gacha'">
          🎁 Mở Thẻ Cầu Thủ
        </button>
      </nav>

      <main class="main-content">
        <!-- TAB: ĐỘI HÌNH -->
        <template v-if="activeTab === 'squad'">
          <div class="left-panel">
            <SquadPitch />

            <div class="event-feed">
              <h3>⚡ Live Event Feed</h3>
              <ul v-if="store.eventFeed.length > 0">
                <li v-for="event in store.eventFeed" :key="event.id">
                  <span class="time">[{{ event.time }}]</span> {{ event.text }}
                </li>
              </ul>
              <p v-else class="no-events">Chưa có sự kiện nào...</p>
            </div>
          </div>

          <div class="right-panel">
            <TransferMarket />
          </div>
        </template>

        <!-- TAB: SO SÁNH CẦU THỦ -->
        <div v-else-if="activeTab === 'compare'" class="full-view">
          <PlayerComparison />
        </div>

        <!-- TAB: GACHA MỞ THẺ -->
        <div v-else-if="activeTab === 'gacha'" class="full-view">
          <GachaPack />
        </div>
      </main>
    </template>

    <!-- HỆ THỐNG TOAST NOTIFICATION GÓC PHẢI DƯỚI -->
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
import TransferMarket from './components/TransferMarket.vue';
import AuthModal from './components/AuthModal.vue';
import PlayerComparison from './components/PlayerComparison.vue';
import GachaPack from './components/GachaPack.vue';
import { globalStore } from './store';
import { ref, onMounted, onUnmounted } from 'vue';

const store = globalStore;
const activeTab = ref('squad');

// LOGIC ĐỒNG HỒ ĐẾM NGƯỢC
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
/* CSS ĐỒNG HỒ ĐẾM NGƯỢC */
.deadline-timer { display: flex; flex-direction: column; align-items: center; background: rgba(235,77,75,0.1); border: 1px solid rgba(235,77,75,0.4); padding: 5px 15px; border-radius: 8px; }
.gw-label { font-size: 11px; color: #ff7979; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; }
.time-countdown { font-size: 22px; font-weight: 900; color: #ffeb3b; font-family: 'Courier New', Courier, monospace; text-shadow: 0 0 10px rgba(255,235,59,0.5); }

/* Tổng điểm live */
.total-points-badge { display: flex; flex-direction: column; align-items: center; background: rgba(85,239,196,0.1); border: 1px solid rgba(85,239,196,0.4); padding: 5px 18px; border-radius: 8px; }
.pts-label { font-size: 11px; color: #55efc4; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; }
.pts-value { font-size: 28px; font-weight: 900; color: #55efc4; line-height: 1; text-shadow: 0 0 14px rgba(85,239,196,0.6); }

/* User bar */
.user-bar { display: flex; align-items: center; gap: 10px; background: rgba(15, 185, 177, 0.08); border: 1px solid rgba(15, 185, 177, 0.2); padding: 6px 12px 6px 10px; border-radius: 10px; }
.user-info { display: flex; align-items: center; gap: 8px; }
.user-avatar { font-size: 20px; }
.user-details { display: flex; flex-direction: column; }
.user-name { font-size: 13px; font-weight: 700; color: #0fb9b1; line-height: 1.2; }
.user-balance { font-size: 11px; color: #6b7a8d; }
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

/* Header sang trọng */
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

/* Bố cục chính */
.main-content { 
  display: flex; 
  gap: 24px; 
  padding: 24px 32px; 
  max-width: 1500px; 
  margin: 0 auto; 
}
.left-panel { 
  flex: 1.45; 
  display: flex; 
  flex-direction: column; 
  gap: 16px;
  min-width: 760px;
}
.right-panel { 
  flex: 0.95;
  min-width: 380px;
  max-width: 520px;
}

/* Box hiển thị Lịch sử Live */
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

/* CSS MỚI: TOAST NOTIFICATIONS CHUYÊN NGHIỆP */
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

/* Hiệu ứng trượt ra trượt vào cho Toast */
.toast-anim-enter-active, .toast-anim-leave-active { transition: all 0.4s ease; }
.toast-anim-enter-from { opacity: 0; transform: translateX(100px); }
.toast-anim-leave-to { opacity: 0; transform: translateY(20px); }

/* Hiệu ứng chớp nháy của đèn Live */
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
  .left-panel {
    min-width: 680px;
    flex: 1.3;
  }
  .right-panel {
    min-width: 340px;
    max-width: 460px;
  }
}

@media (max-width: 1180px) {
  .main-content {
    flex-direction: column;
  }
  .left-panel,
  .right-panel {
    min-width: 0;
    max-width: none;
    width: 100%;
  }
}
</style>