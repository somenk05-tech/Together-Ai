import * as fs from 'fs';
import * as path from 'path';
import { RedisService } from './redis.service';

/**
 * ── THE FIRST THING SENTRY EVER SAID ──
 *
 * `SENTRY_DSN` went into Railway and four hours later the project had exactly
 * one issue in it: `Connection is closed.` — unhandled, from
 * `RedisService.removeSocket`, reached through the chat gateway's
 * `handleDisconnect`.
 *
 * The sequence is a redeploy. `onModuleDestroy` disconnects this client, and
 * THEN every socket hangs up, so `handleDisconnect` runs against a connection
 * that is already gone. `healthy` was still true, because only the `error`
 * event cleared it and a deliberate `disconnect()` emits `end`. Socket.IO does
 * not await `handleDisconnect`, so the rejection had nowhere to go but the
 * process.
 *
 * Worth fixing for itself, and worth fixing NOW for a second reason: every
 * redeploy produced a handful of these, and a launch morning spent scrolling
 * past known noise is how the one real alert gets skimmed. The instrument had
 * been on for four hours and its first reading was about itself.
 *
 * Two halves, and this file is both:
 *  · a deliberate close is not healthy — `end` and `close` say so;
 *  · a connection that goes between the health check and the command lands on
 *    the in-process mirror, which is the same answer the caller would have got
 *    had Redis been down when they asked. Not a fabricated value — the file's
 *    own header is explicit that a confident wrong answer is worse than a
 *    throw, and this changes neither what the mirror knows nor what it claims.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
function build(throwing: boolean) {
  const s: any = Object.create(RedisService.prototype);
  const warns: string[] = [];
  s.logger = { warn: (m: string) => warns.push(m) };
  s.healthy = true;
  s.localSockets = new Map<string, Set<string>>();
  s.localOpenConv = new Map<string, Map<string, string>>();
  const boom = () => { throw new Error('Connection is closed.'); };
  s.client = throwing
    ? { sadd: boom, srem: boom, scard: boom, del: boom, set: boom, expire: boom, exists: boom, hset: boom, hdel: boom, hvals: boom, hgetall: boom, smembers: boom }
    : {
      sadd: async () => 1, srem: async () => 1, scard: async () => 1, del: async () => 1,
      set: async () => 'OK', expire: async () => 1, exists: async () => 1,
      hset: async () => 1, hdel: async () => 1, hvals: async () => ['c1'],
      hgetall: async () => ({ sock1: 'c1' }), smembers: async () => ['sock1'],
    };
  return { s, warns };
}

describe('a connection that closed', () => {
  it('does not reject out of the disconnect path — it answers from the mirror', async () => {
    const { s } = build(true);
    await expect(s.removeSocket('u1', 'sock1')).resolves.toBe(0);
    await expect(s.addSocket('u1', 'sock1')).resolves.toBe(1);
    await expect(s.isOnline('u1')).resolves.toBe(true);
    await expect(s.heartbeat('u1')).resolves.toBeUndefined();
    await expect(s.setOpenConversation('u1', 'c1', 'sock1')).resolves.toBeUndefined();
    await expect(s.openConversationsOf('u1')).resolves.toEqual(['c1']);
  });

  it('demotes once, however many sockets hang up at the same moment', async () => {
    const { s, warns } = build(true);
    await s.removeSocket('u1', 'a');
    await s.removeSocket('u2', 'b');
    await s.removeSocket('u3', 'c');
    expect(s.healthy).toBe(false);
    expect(warns).toHaveLength(1);
    expect(warns[0]).toMatch(/Redis went away during removeSocket/);
  });

  /**
   * The mirror still does the bookkeeping it always did once it is the only
   * bookkeeping there is — this is the case the header calls "correct for
   * exactly the deployment that has no Redis".
   */
  it('keeps counting honestly once it is the only record', async () => {
    const { s } = build(true);
    expect(await s.addSocket('u1', 'a')).toBe(1);
    expect(await s.addSocket('u1', 'b')).toBe(2);
    expect(await s.removeSocket('u1', 'a')).toBe(1);
    expect(await s.removeSocket('u1', 'b')).toBe(0);
    expect(await s.isOnline('u1')).toBe(false);
  });

  it('still uses Redis, and does not touch the mirror, while it is up', async () => {
    const { s, warns } = build(false);
    expect(await s.addSocket('u1', 'a')).toBe(1);
    expect(s.healthy).toBe(true);
    expect(s.localSockets.size).toBe(0);
    expect(warns).toHaveLength(0);
  });

  /**
   * A FIELD OUTLIVES ITS SOCKET, AND IT USED TO GO ON SILENCING A THREAD.
   *
   * The open-conversation hash is only tidied by an explicit leave or by a
   * disconnect this process saw, so a killed instance leaves a field behind
   * pointing at a chat nobody has open. The one caller reads it to decide NOT
   * to push — so the conversation went silent, bell row included, for the whole
   * TTL, with nothing anywhere to say why. The socket set says which sockets
   * exist; a field whose socket is not in it is ignored and dropped.
   */
  it('ignores an open-conversation field whose socket is gone', async () => {
    const { s } = build(false);
    const dropped: unknown[] = [];
    s.client.hgetall = async () => ({ dead: 'c-ghost', alive: 'c-real' });
    s.client.smembers = async () => ['alive'];
    s.client.hdel = async (...a: unknown[]) => { dropped.push(a); return 1; };
    expect(await s.openConversationsOf('u1')).toEqual(['c-real']);
    expect(dropped).toEqual([['openconv:u1', 'dead']]);
  });

  it('gives the hash the same ninety seconds presence gets, not an hour', () => {
    const src = fs.readFileSync(path.join(__dirname, 'redis.service.ts'), 'utf8');
    expect(src).not.toMatch(/OPEN_CONV_KEY\(userId\), 3600/);
    expect(src).toMatch(/expire\(OPEN_CONV_KEY\(userId\), 90\)/);
  });

  it('treats a deliberate close as unhealthy, not just an error', () => {
    const src = fs.readFileSync(path.join(__dirname, 'redis.service.ts'), 'utf8');
    expect(src).toMatch(/this\.client\.on\('end', \(\) => \(this\.healthy = false\)\)/);
    expect(src).toMatch(/this\.client\.on\('close', \(\) => \(this\.healthy = false\)\)/);
  });
});
