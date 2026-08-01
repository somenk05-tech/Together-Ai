import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
}

/** Resolve 'system' against the OS preference. */
const resolve = (mode: ThemeMode): 'light' | 'dark' =>
  mode === 'system'
    ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : mode;

/** Apply the theme to the document — tokens.css keys off [data-theme="dark"]. */
function apply(mode: ThemeMode): void {
  const t = resolve(mode);
  document.documentElement.dataset.theme = t;
  // Keep the browser chrome (address bar / status bar) in step.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#131313' : '#faf9f6');
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'system',
      setMode: (mode) => { set({ mode }); apply(mode); },
    }),
    { name: 'tc:theme' },
  ),
);

// Apply on boot (persist has already rehydrated synchronously from localStorage),
// and follow the OS when the citizen chose 'system'.
if (typeof window !== 'undefined') {
  apply(useThemeStore.getState().mode);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (useThemeStore.getState().mode === 'system') apply('system');
  });
}
