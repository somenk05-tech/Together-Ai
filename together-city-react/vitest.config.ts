import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * The frontend had no test runner at all until the calls feature needed one.
 *
 * Node environment rather than jsdom on purpose: what is worth testing here is
 * logic that happens to run in a browser — WebRTC negotiation, state machines —
 * not the DOM. The pieces of the browser those need are faked explicitly
 * (see features/calls/fake-rtc.ts), which is both faster and honest about what
 * is actually being exercised. Add jsdom the day a component test needs it.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
