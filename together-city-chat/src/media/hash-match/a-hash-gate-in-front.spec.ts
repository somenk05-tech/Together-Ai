import { HashMatchService } from './hash-match.service';
import { NoHashMatchProvider, HttpHashMatchProvider, HashMatchUnavailable } from './hash-match.provider';
import { PostMediaGuard } from '../../social/post-media-guard';
import { ChatMediaGuard } from '../../messages/chat-media-guard';

/**
 * ── THE CHECK REKOGNITION IS NOT ────────────────────────────────────────────
 *
 * Until 6 September every image in Together City was screened by
 * `DetectModerationLabels` and nothing else. That is a taste-and-policy
 * classifier trained on adult content; it does not match against a known-bad
 * hash list, which is the only method that reliably identifies child sexual
 * abuse material. Grepping the tree for `ncmec|photodna|csam` returned nothing.
 *
 * This file pins the three properties that make the gate worth having, because
 * every one of them is the kind of thing a later refactor removes by accident:
 *
 *   1 · IT NEVER PASSES WHEN IT CANNOT ANSWER. Unconfigured, down, timed out,
 *       or answering nonsense — all of it is 'unavailable', and every surface
 *       reads 'unavailable' as no.
 *   2 · A MATCH PRESERVES THE FILE. Every other refusal in this codebase
 *       deletes what it refused. This one must not: it is evidence.
 *   3 · A MATCH STOPS THE ACCOUNT, in the same request, not in the next
 *       moderator shift.
 */

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(64).fill(0x20)]);

/**
 * A ConfigService double that answers every csamMatch key as the real one
 * does — a STRING for the four string settings, a number for the timeout.
 * It was an inline ternary that returned 8000 for anything it did not
 * recognise, which is fine until the service reads a fifth key and calls
 * .trim() on a number.
 */
function cfg(over: Partial<{ url: string; kind: string; token: string; user: string; password: string }> = {}) {
  const values: Record<string, string> = {
    'csamMatch.url': '', 'csamMatch.kind': '', 'csamMatch.token': '',
    'csamMatch.user': '', 'csamMatch.password': '',
    ...Object.fromEntries(Object.entries(over).map(([k, v]) => [`csamMatch.${k}`, v as string])),
  };
  return { get: (k: string) => (k in values ? values[k] : 8000) };
}

function svc(opts: { url?: string; fetchImpl?: typeof fetch } = {}) {
  const created: Record<string, unknown>[] = [];
  const suspended: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const prisma = {
    csamHit: { create: async (a: { data: Record<string, unknown> }) => { created.push(a.data); return {}; } },
    user: { update: async (a: { where: unknown; data: Record<string, unknown> }) => { suspended.push(a); return {}; } },
  };
  const config = cfg({ url: opts.url ?? '' });
  const s = new HashMatchService(prisma as never, config as never, undefined);
  // No Redis in these cases: the cache is a speed feature, and a cache that is
  // absent must not change a single verdict.
  return { s, created, suspended };
}

/** A matcher that answers exactly what the contract says, with no network. */
function answering(body: unknown, status = 200): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe('the hash gate, in front of the classifier', () => {
  it('answers "unavailable" and never "clear" when nothing is configured', async () => {
    const { s, created } = svc();
    expect(s.status).toEqual({ name: 'none', ready: false });
    await expect(new NoHashMatchProvider().check()).rejects.toBeInstanceOf(HashMatchUnavailable);
    expect(await s.check(JPEG, 'image/jpeg', { userId: 'u1', surface: 'post-media' })).toBe('unavailable');
    // Nothing recorded: nothing was found. "Could not look" is not "looked".
    expect(created).toHaveLength(0);
  });

  /**
   * THE WORD "off" (owner, 8 Sep). The gate shipped before any matcher was
   * signed and closed every photograph in the city. "off" is the operator
   * saying so in writing: clear without looking, loudly, and with no memory
   * — a bypass must never seed the thirty-day clear cache a real matcher
   * would then trust.
   */
  it('"off" waves images through, says so as a bypass, and remembers nothing', async () => {
    const remembered: string[] = [];
    const redis = { up: true, raw: { get: async () => null, set: async (k: string) => { remembered.push(k); return 'OK'; } } };
    const config = cfg({ url: 'OFF' });
    const s = new HashMatchService({} as never, config as never, redis as never);
    expect(s.status).toEqual({ name: 'bypass', ready: true });
    expect(await s.check(JPEG, 'image/jpeg', { userId: 'u1', surface: 'post-media' })).toBe('clear');
    expect(remembered).toEqual([]);
  });

  it('records the hit, suspends the citizen, and keeps the file', async () => {
    const { s, created, suspended } = svc({ url: 'https://matcher.test/check' });
    const original = globalThis.fetch;
    globalThis.fetch = answering({ match: true, source: 'test-list' });
    try {
      const out = await s.check(JPEG, 'image/jpeg', {
        userId: 'u9', surface: 'chat-snap', storageKey: 'snaps/u9/x.jpg', bucket: 'private',
      });
      expect(out).toBe('match');
    } finally {
      globalThis.fetch = original;
    }
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      userId: 'u9', surface: 'chat-snap', storageKey: 'snaps/u9/x.jpg', bucket: 'private', source: 'test-list',
    });
    // The digest of the exact bytes, so the report names what was found.
    expect(String(created[0].sha256)).toMatch(/^[0-9a-f]{64}$/);
    expect(suspended).toHaveLength(1);
    expect(suspended[0].data.suspendedAt).toBeInstanceOf(Date);
    // And nothing anywhere in this service deletes. The preservation property
    // is the absence of a call, so it is asserted as one.
    expect(HashMatchService.prototype.check.toString()).not.toMatch(/delete/i);
  });

  it('treats a matcher that answers the wrong shape as an outage, not a pass', async () => {
    const original = globalThis.fetch;
    try {
      for (const body of [{ ok: true }, { match: 'no' }, null]) {
        globalThis.fetch = answering(body);
        const { s } = svc({ url: 'https://matcher.test/check' });
        expect(await s.check(JPEG, 'image/jpeg', { userId: 'u1', surface: 'post-media' })).toBe('unavailable');
      }
      globalThis.fetch = answering({ match: false }, 503);
      const { s } = svc({ url: 'https://matcher.test/check' });
      expect(await s.check(JPEG, 'image/jpeg', { userId: 'u1', surface: 'post-media' })).toBe('unavailable');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('passes a genuine clear through', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = answering({ match: false });
    try {
      const { s, created } = svc({ url: 'https://matcher.test/check' });
      expect(await s.check(JPEG, 'image/jpeg', { userId: 'u1', surface: 'post-media' })).toBe('clear');
      expect(created).toHaveLength(0);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('sends the digest alongside the bytes, so an adapter need not decode', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const p = new HttpHashMatchProvider('https://matcher.test/check', 'tok', 1000);
    const original = globalThis.fetch;
    globalThis.fetch = (async (_u: string, init: { body: string; headers: Record<string, string> }) => {
      seen.push({ ...(JSON.parse(init.body) as Record<string, unknown>), auth: init.headers.Authorization });
      return { ok: true, status: 200, json: async () => ({ match: false }) };
    }) as unknown as typeof fetch;
    try {
      await p.check(JPEG, 'image/jpeg', 'a'.repeat(64));
    } finally {
      globalThis.fetch = original;
    }
    expect(seen[0]).toMatchObject({ sha256: 'a'.repeat(64), contentType: 'image/jpeg', auth: 'Bearer tok' });
    expect(String(seen[0].imageBase64)).toBe(JPEG.toString('base64'));
  });
});

describe('every surface reads the gate the same way', () => {
  const storage = {
    getPublicObjectPrefix: async () => JPEG,
    getPublicObjectBase64: async () => ({ base64: JPEG.toString('base64') }),
    getPostObjectPrefix: async () => JPEG,
    getPostObjectBase64: async () => ({ base64: JPEG.toString('base64') }),
    getSnapObjectPrefix: async () => JPEG,
    getSnapObjectBase64: async () => ({ base64: JPEG.toString('base64') }),
    deleteObject: async () => { throw new Error('a refusal on a hash match must not delete'); },
    deletePrivateObject: async () => { throw new Error('a refusal on a hash match must not delete'); },
  };
  const REKOG_ON = { get: () => 'us-east-1' };

  /**
   * BOTH GUARDS ARE BUILT WITH REKOGNITION CONFIGURED, and that is the point
   * of the arrangement rather than an accident of it.
   *
   * The gate runs after each guard's `if (!this.client)` check, because that
   * check comes before the bytes are read and the gate needs the bytes. With
   * the classifier unconfigured the surface already refuses every image
   * outright, so nothing unsafe is reached — but nothing is RECORDED either,
   * and a hash hit that is not recorded is a report nobody can file. Which is
   * one more reason to run with Rekognition configured, and the reason these
   * cases set the credentials rather than working around them.
   */
  const savedEnv = { ...process.env };
  beforeAll(() => {
    process.env.REKOGNITION_ACCESS_KEY_ID = 'test-id';
    process.env.REKOGNITION_SECRET_ACCESS_KEY = 'test-secret';
  });
  afterAll(() => { process.env = savedEnv; });

  function guards(answer: 'match' | 'unavailable') {
    const hashes = { check: async () => answer } as never;
    return {
      post: new PostMediaGuard(storage as never, REKOG_ON as never, hashes),
      chat: new ChatMediaGuard(storage as never, REKOG_ON as never, hashes),
    };
  }

  it('refuses the post, the chat image and the snap when the matcher cannot answer', async () => {
    const { post, chat } = guards('unavailable');
    const inline = await post.screenInlineImage('u1', `data:image/jpeg;base64,${JPEG.toString('base64')}`, 'so it was not posted');
    expect(inline).toMatchObject({ ok: false, retryable: true });
    const snap = await chat.screenSnap('snaps/u1/x.jpg', 'u1');
    expect(snap).toMatchObject({ ok: false, retryable: true });
  });

  /**
   * The storage double above THROWS on any delete, so a guard that took its
   * ordinary refusal path here — the one that takes the file with it — fails
   * this case rather than quietly destroying the evidence.
   */
  it('refuses on a match without deleting anything', async () => {
    const { post, chat } = guards('match');
    const inline = await post.screenInlineImage('u1', `data:image/jpeg;base64,${JPEG.toString('base64')}`, 'so it was not posted');
    expect(inline).toMatchObject({ ok: false, retryable: false });
    const snap = await chat.screenSnap('snaps/u1/x.jpg', 'u1');
    expect(snap).toMatchObject({ ok: false, retryable: false });
  });
});
