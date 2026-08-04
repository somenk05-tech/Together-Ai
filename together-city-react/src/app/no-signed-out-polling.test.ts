import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * NOTHING POLLS AN API IT CANNOT AUTHENTICATE TO.
 *
 * Three queries feed badges in the header, so they mount on every page — chat
 * conversations every 15s, connections every 20s, unread notifications every
 * 60s. None of them asked whether anyone was signed in. A signed-out browser
 * left open on the home page therefore called GET /api/chat/conversations four
 * times a minute, for ever, and every call was a 401.
 *
 * Sixty of the 575 lines in one eight-minute production log were that request.
 * During the quiet stretch after a deploy they were ALL of it — which is how an
 * inbound email arriving became impossible to find in the log that recorded it.
 * A log you cannot read is a monitoring outage that looks like nothing at all.
 *
 * The requests also spend the rate limiter's budget, which since the Redis
 * change is a real shared number rather than a per-process one.
 */
describe('background polls are gated on being signed in', () => {
  /** file → the hook that owns a refetchInterval. */
  const POLLS: [string, string][] = [
    ['src/api/chat.api.ts', 'useConversations'],
    ['src/api/connections.api.ts', 'useConnections'],
    ['src/api/notifications.api.ts', 'useUnreadNotificationCount'],
  ];

  it.each(POLLS)('%s › %s is enabled only when authed', (file, hook) => {
    const src = strip(read(file));
    const start = src.indexOf(`export function ${hook}(`);
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf('\nexport ', start + 1) + 1 || undefined);
    expect(body).toMatch(/useAuthed\(\)/);
    expect(body).toMatch(/enabled:\s*authed/);
  });

  it('every polling query in the api layer is accounted for here', () => {
    // A new refetchInterval added without an auth gate is the bug returning, so
    // the list above has to keep up with the code rather than the other way
    // round. city.api is exempt by inspection: the weather header is public.
    const files = ['chat', 'connections', 'notifications', 'city'].map((n) => `src/api/${n}.api.ts`);
    const polling = files.filter((f) => /refetchInterval/.test(strip(read(f))));
    const gated = POLLS.map(([f]) => f);
    const ungated = polling.filter((f) => !gated.includes(f) && f !== 'src/api/city.api.ts');
    expect(ungated).toEqual([]);
  });

  it('useAuthed requires a user as well as a token', () => {
    // A token with no user is a half-restored session. Polling during it is
    // exactly what produces a 401 storm instead of one clean redirect.
    const src = strip(read('src/store/useAuthed.ts'));
    expect(src).toMatch(/tokens\?\.accessToken\s*&&\s*s\.user/);
  });
});
