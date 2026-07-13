<template>
  <div class="gacha-container">
    <div class="gacha-header">
      <h2>🎁 Cửa Hàng Thẻ Cầu Thủ</h2>
      <p class="subtitle">Thử vận may với gói Premium Pack</p>
      <div class="pack-price-badge">💰 $2.5M / Lượt</div>
    </div>

    <!-- KHU VỰC THẺ 3D -->
    <div :class="['card-scene', { disabled: isLoading || isResetting }]" @click="openPack">
      <div :class="['card-container', { 'is-flipped': isFlipped }]">

        <!-- MẶT TRƯỚC: VỎ GÓI THẺ CHƯA MỞ -->
        <div class="card-face card-front">
          <div class="pack-design">
            <div class="pack-glow"></div>
            <h3>PREMIUM PACK</h3>
            <p class="click-hint">{{ isLoading ? 'Đang mở gói...' : isResetting ? 'Đang reset...' : 'Click để mở' }}</p>
          </div>
        </div>

        <!-- MẶT SAU: KẾT QUẢ CẦU THỦ -->
        <div
          class="card-face card-back"
          :style="pulledPlayer ? {
            borderColor: pulledPlayer.rarity.color,
            boxShadow: `0 0 40px ${pulledPlayer.rarity.color}88`
          } : {}"
        >
          <div v-if="pulledPlayer" class="player-reveal">
            <div class="rarity-banner" :style="{ background: pulledPlayer.rarity.color }">
              {{ rarityLabel[pulledPlayer.rarity.tier] }}
            </div>
            <div class="player-pos-badge">{{ pulledPlayer.position }}</div>
            <h2 class="player-name">{{ pulledPlayer.name }}</h2>
            <div class="player-stats">
              <div class="stat-item">
                <span class="stat-label">Giá trị</span>
                <span class="stat-val">${{ pulledPlayer.price }}M</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">xG</span>
                <span class="stat-val">{{ pulledPlayer.stats?.xG ?? '—' }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">xA</span>
                <span class="stat-val">{{ pulledPlayer.stats?.xA ?? '—' }}</span>
              </div>
            </div>
            <div class="form-row">
              <span
                v-for="(result, i) in (pulledPlayer.form || [])"
                :key="i"
                :class="['form-badge', result === 'W' ? 'win' : result === 'D' ? 'draw' : 'loss']"
              >{{ result }}</span>
            </div>
            <div class="action-buttons">
              <button class="btn-claim" @click.stop="claimPlayer">⚽ Thu Thập</button>
              <button class="btn-retry" @click.stop="resetCard">🔄 Quay lại</button>
            </div>
          </div>
          <div v-else class="loading-spinner">
            <div class="spinner"></div>
          </div>
        </div>

      </div>
    </div>

    <!-- XÁC SUẤT HIỂN THỊ -->
    <div class="odds-table">
      <h4>📊 Tỷ lệ rơi</h4>
      <div class="odds-row" v-for="tier in rarityTiers" :key="tier.name">
        <span class="tier-dot" :style="{ background: tier.color }"></span>
        <span class="tier-name">{{ tier.name }}</span>
        <span class="tier-pct">{{ tier.pct }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { globalStore } from '../store';

const store = globalStore;

const isFlipped  = ref(false);
const isLoading  = ref(false);
const isResetting = ref(false);
const pulledPlayer = ref(null);
const activeRequestId = ref(0);

const PACK_COST = 2.5;
const REQUEST_TIMEOUT_MS = 8000;

const rarityLabel = {
  LEGENDARY: '🌟 LEGENDARY',
  EPIC:      '💜 EPIC',
  RARE:      '💙 RARE',
  COMMON:    '⬜ COMMON',
};

const rarityTiers = [
  { name: 'LEGENDARY (≥ $11M)', color: '#f1c40f', pct: '~5%'  },
  { name: 'EPIC  (≥ $8.5M)',    color: '#9b59b6', pct: '~15%' },
  { name: 'RARE  (≥ $6M)',      color: '#3498db', pct: '~30%' },
  { name: 'COMMON (< $6M)',     color: '#bdc3c7', pct: '~50%' },
];

const openPack = async () => {
  if (isFlipped.value || isLoading.value || isResetting.value) return;

  if (store.budget < PACK_COST) {
    store.addToast('Bạn không đủ tiền mua thẻ!', 'error');
    return;
  }

  isLoading.value = true;
  const requestId = ++activeRequestId.value;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch('http://localhost:3000/api/gacha/open', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body:    JSON.stringify({ userId: store.currentUser?.username ?? 'guest' }),
    });

    if (requestId !== activeRequestId.value) return;
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();

    // Trừ tiền chỉ khi API thành công
    store.budget = Math.round((store.budget - PACK_COST) * 10) / 10;

    pulledPlayer.value = data.player;
    isFlipped.value    = true;

    // Âm thanh theo độ hiếm
    try {
      const tier = data.player.rarity.tier;
      if (tier === 'LEGENDARY' || tier === 'EPIC') {
        new Audio('https://actions.google.com/sounds/v1/science_fiction/power_up.ogg').play();
      } else {
        new Audio('https://actions.google.com/sounds/v1/foley/paper_flap.ogg').play();
      }
    } catch (_) { /* Bỏ qua nếu browser chặn autoplay */ }

  } catch (error) {
    if (requestId !== activeRequestId.value) return;
    if (error?.name === 'AbortError') {
      store.addToast('Mở thẻ quá lâu, vui lòng thử lại.', 'error');
    } else {
      store.addToast('Lỗi máy chủ, không thể mở thẻ!', 'error');
    }
  } finally {
    clearTimeout(timeoutId);
    if (requestId === activeRequestId.value) isLoading.value = false;
  }
};

const claimPlayer = () => {
  if (!pulledPlayer.value) return;

  const added = store.addPlayerToSquad({ ...pulledPlayer.value });
  if (added) {
    store.addToast(`✅ Đã thêm ${pulledPlayer.value.name} vào đội hình!`, 'success');
    resetCard();
  }
  // Nếu false, store.addPlayerToSquad đã tự toast lỗi rồi
};

const resetCard = () => {
  activeRequestId.value += 1;
  isLoading.value = false;
  isResetting.value = true;
  isFlipped.value = false;
  pulledPlayer.value = null;
  setTimeout(() => { isResetting.value = false; }, 700);
};
</script>

<style scoped>
/* ===== LAYOUT ===== */
.gacha-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  gap: 32px;
  min-height: 100%;
}

.gacha-header { text-align: center; color: #fff; }
.gacha-header h2 { font-size: 28px; margin: 0 0 8px; }
.subtitle { color: #a4b0be; margin: 0 0 12px; font-size: 15px; }
.pack-price-badge {
  display: inline-block;
  background: linear-gradient(135deg, #f9ca24, #f0932b);
  color: #2d3436;
  font-weight: 800;
  padding: 6px 18px;
  border-radius: 999px;
  font-size: 14px;
  letter-spacing: 0.5px;
}

/* ===== CARD 3D ===== */
.card-scene {
  width: 300px;
  height: 450px;
  perspective: 1200px;
  cursor: pointer;
}

.card-scene.disabled {
  cursor: not-allowed;
  pointer-events: none;
}

.card-container {
  width: 100%;
  height: 100%;
  position: relative;
  transition: transform 0.85s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  transform-style: preserve-3d;
}
.card-container.is-flipped { transform: rotateY(180deg); }

.card-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  border-radius: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  border: 3px solid #2f3640;
  overflow: hidden;
}

/* MẶTTRƯỚC */
.card-front {
  background: radial-gradient(ellipse at top, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  color: #fff;
  transition: border-color 0.3s, box-shadow 0.3s;
}
.card-scene:hover .card-front:not(.is-flipped .card-front) {
  border-color: #f1c40f;
  box-shadow: 0 0 25px rgba(241, 196, 15, 0.4);
}

.pack-design {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.pack-glow {
  position: absolute;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(241,196,15,0.15) 0%, transparent 70%);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -55%);
}
.pack-icon {
  font-size: 72px;
  filter: drop-shadow(0 0 12px rgba(241,196,15,0.6));
}
.pack-design h3 {
  font-size: 18px;
  letter-spacing: 3px;
  color: #f1c40f;
  margin: 0;
}
.click-hint { font-size: 13px; color: #a4b0be; margin: 0; }

/* MẶT SAU */
.card-back {
  background: #1e272e;
  transform: rotateY(180deg);
  flex-direction: column;
  color: #fff;
  border-width: 3px;
  transition: border-color 0.3s, box-shadow 0.3s;
}

.player-reveal {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 20px 16px;
  width: 100%;
}

.rarity-banner {
  width: 100%;
  text-align: center;
  padding: 6px 0;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 2px;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0,0,0,0.5);
  border-radius: 6px;
}

.player-pos-badge {
  font-size: 36px;
  font-weight: 900;
  color: #636e72;
  line-height: 1;
}

.player-name {
  font-size: 24px;
  font-weight: 800;
  margin: 0;
  text-align: center;
  line-height: 1.2;
}

.player-stats {
  display: flex;
  gap: 16px;
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(255,255,255,0.07);
  border-radius: 8px;
  padding: 6px 12px;
}
.stat-label { font-size: 10px; color: #a4b0be; text-transform: uppercase; letter-spacing: 1px; }
.stat-val   { font-size: 16px; font-weight: 700; color: #fff; }

.form-row { display: flex; gap: 6px; }
.form-badge {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 13px;
}
.form-badge.win  { background: #00b894; color: #fff; }
.form-badge.draw { background: #636e72; color: #fff; }
.form-badge.loss { background: #d63031; color: #fff; }

.action-buttons { display: flex; gap: 10px; margin-top: 4px; }

.btn-claim {
  padding: 9px 18px;
  background: #0fb9b1;
  border: none;
  color: #fff;
  font-weight: 700;
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s, transform 0.1s;
}
.btn-claim:hover { background: #01a3a4; transform: translateY(-1px); }

.btn-retry {
  padding: 9px 18px;
  background: #2d3436;
  border: 1px solid #636e72;
  color: #a4b0be;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}
.btn-retry:hover { background: #3d4852; }

/* LOADING SPINNER */
.loading-spinner {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}
.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid rgba(255,255,255,0.1);
  border-top-color: #0fb9b1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* BẢNG XÁC SUẤT */
.odds-table {
  background: #1e272e;
  border: 1px solid #2f3640;
  border-radius: 14px;
  padding: 18px 24px;
  min-width: 260px;
}
.odds-table h4 { color: #a4b0be; margin: 0 0 14px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; }
.odds-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.odds-row:last-child { border-bottom: none; }
.tier-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.tier-name { color: #d1d8e0; font-size: 13px; flex: 1; }
.tier-pct  { color: #f1c40f; font-weight: 700; font-size: 14px; }

/* KEYFRAMES */
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(-18px); }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
