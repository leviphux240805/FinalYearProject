<template>
  <div class="auth-overlay">
    <div class="auth-modal">
      <!-- Header -->
      <div class="modal-header">
        <div class="modal-logo">🏆</div>
        <h1>SUPER LEAGUE PRO</h1>
        <p class="modal-subtitle">Enterprise Fantasy System - 2026 Season</p>
      </div>

      <!-- Tab Switch -->
      <div class="tab-switcher">
        <button
          :class="['tab-btn', { active: activeTab === 'login' }]"
          @click="switchTab('login')"
        >Log In</button>
        <button
          :class="['tab-btn', { active: activeTab === 'register' }]"
          @click="switchTab('register')"
        >Sign Up</button>
      </div>

      <!-- Form -->
      <form @submit.prevent="handleSubmit" class="auth-form">
        <!-- Error Banner -->
        <div v-if="errorMsg" class="error-banner">
          <span>⚠️</span> {{ errorMsg }}
        </div>

        <!-- Username -->
        <div class="field-group">
          <label>Username</label>
          <input
            v-model="form.username"
            type="text"
            placeholder="e.g. supercoach99"
            autocomplete="username"
            :disabled="isLoading"
            required
          />
          <span v-if="activeTab === 'register'" class="field-hint">3–30 characters, letters, numbers and _ only</span>
        </div>

        <!-- Password -->
        <div class="field-group">
          <label>Password</label>
          <div class="password-wrapper">
            <input
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="At least 8 characters"
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
          <label>Confirm Password</label>
          <input
            v-model="form.confirmPassword"
            type="password"
            placeholder="Re-enter your password"
            autocomplete="new-password"
            :disabled="isLoading"
            required
          />
          <span v-if="form.confirmPassword && form.password !== form.confirmPassword" class="field-error">
            Passwords don't match!
          </span>
        </div>

        <!-- Submit Button -->
        <button type="submit" class="submit-btn" :disabled="isLoading || isFormInvalid">
          <span v-if="isLoading" class="spinner"></span>
          <span v-else>{{ activeTab === 'login' ? 'Enter the Pitch' : '⚽ Create Account' }}</span>
        </button>
      </form>

      <!-- Social Login -->
      <div class="divider"><span>or continue with</span></div>
      <div class="social-buttons">
        <a class="social-btn social-google" :href="`${API_BASE}/auth/google`" title="Continue with Google">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.28-1.7 3.76-5.5 3.76-3.31 0-6.02-2.74-6.02-6.12s2.7-6.12 6.02-6.12c1.89 0 3.16.8 3.88 1.5l2.64-2.55C16.94 2.98 14.7 2 12 2 6.98 2 2.9 6.06 2.9 11s4.08 9 9.1 9c5.25 0 8.73-3.69 8.73-8.89 0-.6-.07-1.05-.15-1.5H12z"/></svg>
          <span>Google</span>
        </a>
        <a class="social-btn social-facebook" :href="`${API_BASE}/auth/facebook`" title="Continue with Facebook">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#1877F2" d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.77-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94z"/></svg>
          <span>Facebook</span>
        </a>
        <a class="social-btn social-x" :href="`${API_BASE}/auth/twitter`" title="Continue with X">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M13.6 10.6 20.4 3h-1.6l-5.9 6.6L8.2 3H2.6l7.1 10.2L2.6 21h1.6l6.2-7 5 7h5.6l-7.4-10.4Zm-2.2 2.5-.7-1L4.9 4.1h2.4l4.6 6.5.7 1 6 8.4h-2.4l-4.8-6.9Z"/></svg>
          <span>X</span>
        </a>
      </div>
      <p class="social-note">You'll be redirected to sign in, then brought back here.</p>

      <!-- Footer -->
      <p class="auth-footer">
        {{ activeTab === 'login' ? "Don't have an account?" : 'Already have an account?' }}
        <a href="#" @click.prevent="switchTab(activeTab === 'login' ? 'register' : 'login')">
          {{ activeTab === 'login' ? 'Sign up now' : 'Log in' }}
        </a>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { globalStore, API_BASE } from '../store';

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
    errorMsg.value = err.message || 'Something went wrong. Please try again.';
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

/* Social Login */
.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0 14px;
  color: #4a5568;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
}
.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #2f3f55;
}
.social-buttons {
  display: flex;
  gap: 10px;
}
.social-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 11px;
  background: #111827;
  border: 1px solid #2f3f55;
  border-radius: 8px;
  color: #e0e6ed;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;
}
.social-btn:hover {
  border-color: #0fb9b1;
  background: #16202f;
  transform: translateY(-1px);
}
.social-note {
  margin-top: 10px;
  text-align: center;
  font-size: 11px;
  color: #4a5568;
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
