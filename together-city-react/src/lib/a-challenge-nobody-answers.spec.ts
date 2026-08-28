import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * ── A CHALLENGE NOBODY ANSWERS IS NOT A BUTTON THAT NEVER RETURNS ──
 *
 * `getTurnstileToken` resolves from Cloudflare's own callbacks. Three of them
 * exist and there are ordinary ways for none to fire: an interactive challenge
 * the visitor never notices in the corner, a script blocked after it was
 * appended, a tab backgrounded mid-verify. Without a clock the sign-in button
 * spins for as long as the visitor is willing to watch it, and nothing says why.
 *
 * Resolving undefined is not a bypass — the API refuses a missing token
 * whenever a secret is configured — so the visitor gets a sentence they can
 * act on instead of a spinner they cannot. (28 Aug.)
 *
 * Stubbed rather than run under jsdom: this suite is deliberately a node suite
 * (see vitest.config.ts), and the two DOM calls this module makes are a div and
 * a body to hang it on.
 */
type RenderOpts = { sitekey: string; action?: string; callback(t: string): void };

let lastOpts: RenderOpts | null = null;
let attached = 0;

function installDom() {
  attached = 0;
  const doc = {
    createElement: () => ({ style: {} as Record<string, string>, remove: () => { attached -= 1; } }),
    body: { appendChild: () => { attached += 1; } },
    head: { appendChild: () => {} },
  };
  (globalThis as Record<string, unknown>).document = doc;
  (globalThis as Record<string, unknown>).window = globalThis;
}

function installApi(behaviour: (o: RenderOpts) => void) {
  lastOpts = null;
  (globalThis as unknown as { turnstile: unknown }).turnstile = {
    render(_el: unknown, o: RenderOpts) { lastOpts = o; behaviour(o); return 'w1'; },
    reset() {}, remove() {},
  };
}

async function load() {
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '0x4AAAAAAEcylMxjooSOdcPv');
  vi.resetModules();
  return import('./turnstile');
}

describe('the token a widget never delivers', () => {
  beforeEach(() => { vi.useFakeTimers(); installDom(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  it('gives up rather than hanging when no callback ever fires', async () => {
    installApi(() => { /* silence, as an unnoticed challenge would be */ });
    const { getTurnstileToken } = await load();
    const pending = getTurnstileToken('login');
    let settled = false;
    void pending.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(14_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(pending).resolves.toBeUndefined();
    expect(attached).toBe(0);
  });

  it('returns the token when the widget answers, and asks for the door it was called for', async () => {
    installApi((o) => { setTimeout(() => o.callback('tok-1'), 50); });
    const { getTurnstileToken } = await load();
    const pending = getTurnstileToken('register');
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toBe('tok-1');
    expect(lastOpts?.action).toBe('register');
    expect(attached).toBe(0);
  });

  it('settles once — a late callback after the clock changes nothing', async () => {
    installApi((o) => { setTimeout(() => o.callback('tok-late'), 20_000); });
    const { getTurnstileToken } = await load();
    const pending = getTurnstileToken('login');
    await vi.advanceTimersByTimeAsync(25_000);
    await expect(pending).resolves.toBeUndefined();
  });
});
