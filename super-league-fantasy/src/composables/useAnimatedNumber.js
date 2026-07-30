import { ref, watch } from 'vue';

/**
 * Tweens a *displayed* number from its old value to a new one whenever the
 * source changes (e.g. store.budget right after a purchase), instead of the
 * value snapping instantly. Purely presentational: the underlying store
 * value stays server-authoritative (Section 4.7 of the report — the client
 * never computes its own balance), this only smooths how the change is
 * *shown*.
 *
 * @param {() => number} getValue - reactive getter for the source number
 * @param {{ duration?: number }} options
 * @returns {import('vue').Ref<number>} the eased, animated display value
 */
export function useAnimatedNumber(getValue, { duration = 550 } = {}) {
  const display = ref(getValue());
  let rafId = null;

  const prefersReducedMotion = () =>
    typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  watch(getValue, (newValue, oldValue) => {
    const from = typeof oldValue === 'number' ? oldValue : display.value;
    const to = newValue;

    if (to === from || Number.isNaN(to)) {
      display.value = to;
      return;
    }

    if (prefersReducedMotion()) {
      display.value = to;
      return;
    }

    cancelAnimationFrame(rafId);
    const start = performance.now();

    const tick = (now) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic — fast start, gentle settle
      display.value = from + (to - from) * eased;
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        display.value = to;
      }
    };
    rafId = requestAnimationFrame(tick);
  });

  return display;
}
