export interface Debouncer {
  schedule(fn: () => void): void;
  cancel(): void;
}

export function createDebouncer(ms: number): Debouncer {
  const delay = Number.isFinite(ms) ? Math.max(0, Math.trunc(ms)) : 0;
  let timer: number | null = null;

  return {
    schedule(fn) {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        fn();
      }, delay);
    },
    cancel() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    },
  };
}

