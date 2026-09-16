import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(web, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * THE SOCKET LIVES ABOVE THE ROUTER (16 Sep). AppShell is one route block of
 * nineteen; every hub's inner pages are its siblings. The four realtime hooks
 * mounted there reached none of them — no socket on a deep link, no heartbeat
 * once you left Home, no ring for an incoming call — and realtime worked at
 * all only because a dead cleanup in useSocket kept a socket open by accident.
 * Pinned: the hooks are called from Realtime, Realtime is mounted in App above
 * RouterProvider, no layout calls them, and the cleanup says what it means.
 */
describe('the socket lives above the router', () => {
  const realtime = strip(read('app/Realtime.tsx'));
  const app = strip(read('app/App.tsx'));

  it('Realtime calls the four hooks, once, and renders nothing', () => {
    for (const h of ['useSocket', 'useChatNotifications', 'useWebPush', 'useConnectionSync']) {
      expect(realtime).toMatch(new RegExp(`\\b${h}\\(\\)`));
    }
    expect(realtime).toMatch(/return null;/);
  });

  it('App mounts Realtime inside Providers and above the router', () => {
    const providers = app.indexOf('<Providers>');
    const realtimeAt = app.indexOf('<Realtime />');
    const router = app.indexOf('<RouterProvider');
    expect(providers).toBeGreaterThan(-1);
    expect(realtimeAt).toBeGreaterThan(providers);
    expect(router).toBeGreaterThan(realtimeAt);
  });

  it('no layout mounts them on its own — a layout is one block of many', () => {
    for (const f of ['layouts/AppShell.tsx', 'layouts/HubLayout.tsx', 'layouts/RootChrome.tsx']) {
      const src = strip(read(f));
      for (const h of ['useSocket', 'useChatNotifications', 'useWebPush', 'useConnectionSync']) {
        expect(src, `${f} calls ${h}`).not.toMatch(new RegExp(`\\b${h}\\(`));
      }
    }
  });

  it('useSocket disconnects on sign-out rather than in a cleanup that never fires', () => {
    const hook = strip(read('hooks/useSocket.ts'));
    expect(hook).toMatch(/if \(authed\) socketClient\.connect\(\);\s*else socketClient\.disconnect\(\);/);
    expect(hook).not.toMatch(/return \(\) => \{ if \(!authed\)/);
  });
});
