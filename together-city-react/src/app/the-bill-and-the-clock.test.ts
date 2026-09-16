import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE BILL AND THE CLOCK (owner, 16 Sep): what the investor dashboard called
 * "not measured" is measured — time in the app, crash-free sessions, uptime
 * across deploys, AI cost, response time and failures. These hold the web's
 * half: what the app sends, when, and that it sends nothing else.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(resolve(HERE, '..', p), 'utf8');

const post = vi.fn(async (...args: [url: string, body: unknown]) => ({ sent: args.length }));
vi.mock('@/api/client', () => ({ http: { post: (url: string, body: unknown) => post(url, body) } }));

type Listener = (e: { error?: unknown }) => void;

describe('what the app sends', () => {
  let listeners: Record<string, Listener[]>;
  let visibility: 'visible' | 'hidden';

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    post.mockClear();
    listeners = {};
    visibility = 'visible';
    const on = (type: string, fn: Listener) => { (listeners[type] ??= []).push(fn); };
    const off = (type: string, fn: Listener) => { listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn); };
    vi.stubGlobal('window', { addEventListener: on, setInterval, clearInterval });
    vi.stubGlobal('document', {
      get visibilityState() { return visibility; },
      addEventListener: on, removeEventListener: off,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts a session once, with an id and a platform — nothing else', async () => {
    const { startSession } = await import('@/api/pulse');
    startSession();
    startSession();
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/insights/session');
    expect(Object.keys(body).sort()).toEqual(['id', 'platform']);
    expect(body.platform).toBe('web');
  });

  it('marks the session crashed once, and only for a thrown error', async () => {
    const { startSession, reportCrash } = await import('@/api/pulse');
    startSession();
    listeners.error.forEach((f) => f({}));            // an image that failed to load
    expect(post).toHaveBeenCalledTimes(1);
    listeners.error.forEach((f) => f({ error: new Error('Cannot read name of Asha') }));
    reportCrash('render');
    expect(post).toHaveBeenCalledTimes(2);
    const body = post.mock.calls[1][1] as Record<string, unknown>;
    expect(body).toMatchObject({ crash: 'uncaught' });
    expect(JSON.stringify(post.mock.calls)).not.toContain('Asha');
  });

  it('beats every half minute with the seconds the app was on screen, and stops', async () => {
    const { startHeartbeat } = await import('@/api/pulse');
    const stop = startHeartbeat();
    vi.advanceTimersByTime(30_000);
    expect(post).toHaveBeenLastCalledWith('/insights/beat', { s: 30 });
    // Hidden for twenty of the next thirty seconds: ten are counted.
    vi.advanceTimersByTime(10_000);
    visibility = 'hidden';
    listeners.visibilitychange.forEach((f) => f({}));
    vi.advanceTimersByTime(20_000);
    expect(post).toHaveBeenLastCalledWith('/insights/beat', { s: 10 });
    // Hidden the whole time: nothing is sent.
    vi.advanceTimersByTime(30_000);
    expect(post).toHaveBeenCalledTimes(2);
    stop();
    visibility = 'visible';
    vi.advanceTimersByTime(60_000);
    expect(post).toHaveBeenCalledTimes(2);
  });
});

describe('where it is wired', () => {
  it('starts the session for everyone and the heartbeat only when signed in', () => {
    const chrome = src('layouts/RootChrome.tsx');
    expect(chrome).toContain('useEffect(() => { startSession(); }, []);');
    expect(chrome).toContain('useEffect(() => (signedInId ? startHeartbeat() : undefined), [signedInId]);');
  });

  it('counts a screen that fell over, but not a stale page after a deploy', () => {
    const b = src('app/ChunkBoundary.tsx');
    expect(b).toContain("if (!isChunkLoadError(error)) reportCrash('render');");
    expect(b).toContain('const fatal = !chunk && !isRouteErrorResponse(err);');
  });

  it('shows the numbers that were "not measured"', () => {
    const s = src('features/insights/sections.tsx');
    for (const label of ['Crash-free sessions', 'Uptime', 'Deploys / starts', 'Failed AI calls', 'AI response (median / p95)', 'AI cost in window']) {
      expect(s).toContain(`label="${label}"`);
    }
    expect(s).toContain('<MetricCard label="AI cost" metric={s.aiCost}');
  });
});
