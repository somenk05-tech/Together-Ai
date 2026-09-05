import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const socket = strip(readFileSync(join(web, 'api', 'socket.ts'), 'utf8'));
const shell = readFileSync(join(web, 'layouts', 'AppShell.tsx'), 'utf8');
const banner = readFileSync(join(web, 'features', 'auth', 'VerifyEmailBanner.tsx'), 'utf8');

/**
 * THE SOCKET COMES BACK, AND SAYS WHEN IT IS AWAY (launch gate, third
 * reading, 4 Sep). Access tokens live fifteen minutes; the server closes a
 * socket whose token has expired; Socket.IO never reconnects after a
 * server-side close; and nothing here listened. Real-time died at the first
 * expiry after a page load, silently. Pinned: the three handlers, the
 * refresh before connect, the backoff, and the strip in the shell.
 */
describe('the socket comes back', () => {
  it('listens for the three ways a socket goes away', () => {
    expect(socket).toMatch(/s\.on\('disconnect'/);
    expect(socket).toMatch(/s\.on\('connect_error'/);
    expect(socket).toMatch(/s\.on\('connect'/);
  });

  it('refreshes a stale token before connecting, and after a server-side close', () => {
    expect(socket).toMatch(/isTokenExpired\(st\.tokens\.accessToken\)\) await st\.refresh\(\)/);
    expect(socket).toMatch(/reason === 'io server disconnect'\) recover\(s\)/);
  });

  it('backs off and cannot loop, and leaves its own disconnects alone', () => {
    expect(socket).toMatch(/Math\.min\(backoffMs \* 2, 30_000\)/);
    expect(socket).toMatch(/if \(recovering\) return;/);
    expect(socket).toMatch(/reason === 'io client disconnect'\) \{ setState\('off'\); return; \}/);
  });

  it('the shell shows a strip while it is away — on chat too', () => {
    expect(shell).toMatch(/<ReconnectStrip \/>/);
    // Not gated on !isChat: chat is where the silence was worst.
    expect(shell).not.toMatch(/\{!isChat && <ReconnectStrip \/>\}/);
    // And the two strips wear one hoisted style, not two inline ones.
    expect(banner).toMatch(/style=\{bannerStyle\}/);
  });
});

/**
 * A FAILED SEND IS NOT SENT LATER (5 Sep). socket.io buffers an emit made
 * while the socket is down and flushes it on reconnect — so a message
 * already reported as failed, and retyped, went out twice. The timer that
 * reports the failure now drops that frame from the buffer.
 */
describe('a failed send is not sent later', () => {
  const chat = strip(readFileSync(join(web, 'api', 'chat.api.ts'), 'utf8'));
  it('the client can drop one buffered frame by predicate', () => {
    expect(socket).toMatch(/forget\(event: WsEvent, match: \(payload: unknown\) => boolean\)/);
    expect(socket).toMatch(/s\.sendBuffer = s\.sendBuffer\.filter/);
  });
  it('the ten-second failure drops its own frame before rejecting', () => {
    const timer = chat.slice(chat.indexOf('window.setTimeout(() => {'), chat.indexOf('}, 10_000);'));
    expect(timer).toMatch(/socketClient\.forget\(WS\.SEND_MESSAGE/);
    expect(timer.indexOf('forget(')).toBeLessThan(timer.indexOf('reject('));
  });
});
