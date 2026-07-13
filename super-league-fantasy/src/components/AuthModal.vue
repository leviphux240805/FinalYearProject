<template>
  <div class="auth-overlay">
    <div class="auth-modal">
      <!-- Header -->
      <div class="modal-header">
        <div class="modal-logo">🏆</div>
        <h1>SUPER LEAGUE PRO</h1>
        <p class="modal-subtitle">Hệ thống Fantasy Enterprise - Mùa giải 2026</p>
      </div>

      <!-- Tab Switch -->
      <div class="tab-switcher">
        <button
          :class="['tab-btn', { active: activeTab === 'login' }]"
          @click="switchTab('login')"
        >Đăng Nhập</button>
        <button
          :class="['tab-btn', { active: activeTab === 'register' }]"
          @click="switchTab('register')"
        >Đăng Ký</button>
      </div>

      <!-- Form -->
      <form @submit.prevent="handleSubmit" class="auth-form">
        <!-- Error Banner -->
        <div v-if="errorMsg" class="error-banner">
          <span>⚠️</span> {{ errorMsg }}
        </div>

        <!-- Username -->
        <div class="field-group">
          <label>Tên đăng nhập</label>
          <input
            v-model="form.username"
            type="text"
            placeholder="Ví dụ: supercoach99"
            autocomplete="username"
            :disabled="isLoading"
            required
          />
          <span v-if="activeTab === 'register'" class="field-hint">3–30 ký tự, chỉ gồm chữ, số và dấu _</span>
        </div>

        <!-- Password -->
        <div class="field-group">
          <label>Mật khẩu</label>
          <div class="password-wrapper">
            <input
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Tối thiểu 8 ký tự"
              autocomplete="current-password"
              :disabled="isLoading"
              required
            />
            <button type="button" class="toggle-pw" @click="showPassword = !showPassword">
              {{ showPassword ? '🙈' : '👁️' }}
            </button>
          </div>
        </div>

        <!-- Confirm Password (Register only) -->
        <div v-if="activeTab === 'register'" class="field-group">
          <label>Xác nhận mật khẩu</label>
          <input
            v-model="form.confirmPassword"
            type="password"
            placeholder="Nhập lại mật khẩu"
            autocomplete="new-password"
            :disabled="isLoading"
            required
          />
          <span v-if="form.confirmPassword && form.password !== form.confirmPassword" class="field-error">
            Mật khẩu không khớp!
          </span>
        </div>

        <!-- Submit Button -->
        <button type="submit" class="submit-btn" :disabled="isLoading || isFormInvalid">
          <span v-if="isLoading" class="spinner"></span>
          <span v-else>{{ activeTab === 'login' ? 'Vào Sân' : '⚽ Tạo Tài Khoản' }}</span>
        </button>
      </form>

      <!-- Footer -->
      <p class="auth-footer">
        {{ activeTab === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?' }}
        <a href="#" @click.prevent="switchTab(activeTab === 'login' ? 'register' : 'login')">
          {{ activeTab === 'login' ? 'Đăng ký ngay' : 'Đăng nhập' }}
        </a>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { globalStore } from '../store';

const activeTab    = ref('login');
const isLoading    = ref(false);
const errorMsg     = ref('');
const showPassword = ref(false);

const form = ref({
  username: '',
  password: '',
  confirmPassword: ''
});

const isFormInvalid = computed(() => {
  if (!form.value.username || !form.value.password) return true;
  if (activeTab.value === 'register') {
    return form.value.password !== form.value.confirmPassword;
  }
  return false;
});

function switchTab(tab) {
  activeTab.value = tab;
  errorMsg.value  = '';
  form.value = { username: '', password: '', confirmPassword: '' };
}

async function handleSubmit() {
  errorMsg.value = '';
  isLoading.value = true;

  try {
    if (activeTab.value === 'login') {
      await globalStore.login(form.value.username, form.value.password);
    } else {
      await globalStore.register(form.value.username, form.value.password);
    }
  } catch (err) {
    errorMsg.value = err.message || 'Đã xảy ra lỗi. Vui lòng thử lại.';
  } finally {
    isLoading.value = false;
  }
}
</script>

<style scoped>
/* Overlay */
.auth-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 23, 0.95);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

/* Modal Card */
.auth-modal {
  background: #1a2232;
  border: 1px solid #2f3f55;
  border-radius: 16px;
  padding: 40px 36px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(15, 185, 177, 0.1);
}

/* Header */
.modal-header {
  text-align: center;
  margin-bottom: 28px;
}
.modal-logo {
  font-size: 48px;
  margin-bottom: 8px;
  filter: drop-shadow(0 0 12px rgba(247, 183, 49, 0.5));
}
.modal-header h1 {
  font-size: 22px;
  font-weight: 900;
  background: linear-gradient(to right, #0fb9b1, #f7b731);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: 1.5px;
}
.modal-subtitle {
  font-size: 12px;
  color: #6b7a8d;
  margin-top: 4px;
}

/* Tabs */
.tab-switcher {
  display: flex;
  background: #111827;
  border-radius: 10px;
  padding: 4px;
  margin-bottom: 24px;
  gap: 4px;
}
.tab-btn {
  flex: 1;
  padding: 10px;
  border: none;
  background: transparent;
  color: #6b7a8d;
  font-size: 14px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.tab-btn.active {
  background: #1e3a5f;
  color: #0fb9b1;
  box-shadow: 0 2px 8px rgba(15, 185, 177, 0.2);
}

/* Form */
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.error-banner {
  background: rgba(235, 77, 75, 0.12);
  border: 1px solid rgba(235, 77, 75, 0.4);
  color: #ff7979;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-group label {
  font-size: 12px;
  font-weight: 600;
  color: #8fa3bc;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.field-group input {
  background: #111827;
  border: 1px solid #2f3f55;
  border-radius: 8px;
  padding: 12px 14px;
  color: #e0e6ed;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  width: 100%;
}
.field-group input:focus {
  border-color: #0fb9b1;
  box-shadow: 0 0 0 3px rgba(15, 185, 177, 0.15);
}
.field-group input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.field-hint {
  font-size: 11px;
  color: #4a5568;
}
.field-error {
  font-size: 11px;
  color: #ff7979;
}
.password-wrapper {
  position: relative;
}
.password-wrapper input {
  padding-right: 44px;
}
.toggle-pw {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  opacity: 0.7;
}
.toggle-pw:hover {
  opacity: 1;
}

/* Submit */
.submit-btn {
  width: 100%;
  padding: 14px;
  margin-top: 4px;
  background: linear-gradient(135deg, #0fb9b1, #0a8d87);
  border: none;
  border-radius: 10px;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 50px;
}
.submit-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(15, 185, 177, 0.35);
}
.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* Spinner */
.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Footer */
.auth-footer {
  margin-top: 20px;
  text-align: center;
  font-size: 13px;
  color: #4a5568;
}
.auth-footer a {
  color: #0fb9b1;
  text-decoration: none;
  font-weight: 600;
  margin-left: 4px;
}
.auth-footer a:hover {
  text-decoration: underline;
}
</style>
