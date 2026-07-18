import type { Config } from 'tailwindcss';

/**
 * Design tokens ported 1:1 from the vanilla site's assets/css/tc.css `:root`.
 * Colors are exposed as CSS variables (see src/styles/tokens.css) so runtime
 * theming (per-hub accent, dark hubs) works exactly like the original.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        muted: 'var(--muted)',
        paper: 'var(--paper)',
        card: 'var(--card)',
        line: 'var(--line)',
        gold: 'var(--gold)',
        'gold-soft': 'var(--gold-soft)',
        green: 'var(--green)',
        'green-soft': 'var(--green-soft)',
        blue: 'var(--blue)',
        rose: 'var(--rose)',
        purple: 'var(--purple)',
        navy: 'var(--navy)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
      },
      fontFamily: {
        serif: 'var(--serif)',
        sans: 'var(--sans)',
        mono: 'var(--mono)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        card: 'var(--shadow)',
        deep: 'var(--shadow-deep)',
      },
      maxWidth: { shell: '1240px' },
    },
  },
  plugins: [],
};
export default config;
