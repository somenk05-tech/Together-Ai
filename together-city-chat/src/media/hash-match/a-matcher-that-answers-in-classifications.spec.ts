import { HashMatchService } from './hash-match.service';
import { ArachnidHashMatchProvider, HashMatchUnavailable } from './hash-match.provider';

/**
 * ── THE FREE MATCHER, AND THE FOUR RULES THAT MAKE IT SAFE ──────────────────
 *
 * `CSAM_MATCH_URL=off` was the owner's written bypass, taken because the gate
 * shipped before a vendor was signed and a city where nobody can post a
 * photograph is not a safer city. This dialect is what retires it: Arachnid
 * Shield, run by the Canadian Centre for Child Protection, free to electronic
 * service providers, and the only known-bad-hash service reachable without a
 * signed contract or an approved application.
 *
 * It does not speak the contract in hash-match.provider.ts — raw bytes rather
 * than JSON, Basic rather than Bearer, and an answer in CLASSIFICATIONS rather
 * than a boolean. That last difference is where a gate gets quietly broken, so
 * every rule about reading it is pinned here.
 */

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(64).fill(0x20)]);

function cfg(over: Record<string, string>) {
  const values: Record<string, string> = {
    'csamMatch.url': '', 'csamMatch.kind': '', 'csamMatch.token': '',
    'csamMatch.user': '', 'csamMatch.password': '', ...over,
  };
  return { get: (k: string) => (k in values ? values[k] : 8000) };
}

const ARACHNID = {
  'csamMatch.url': 'https://shield.projectarachnid.com/v1/media/',
  'csamMatch.kind': 'arachnid',
  'csamMatch.user': 'esp-user',
  'csamMatch.password': 'esp-pass',
};

function answering(body: unknown, status = 200): typeof fetch {
  return (async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })) as unknown as typeof fetch;
}

/** Runs `fn` with a stubbed global fetch, and hands back what the stub was called with. */
async function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = original; }
}

describe('a matcher that answers in classifications', () => {
  it('is chosen by CSAM_MATCH_KIND, and sends the bytes with Basic auth', async () => {
    const seen: Array<{ url: unknown; init: RequestInit }> = [];
    const s = new HashMatchService({} as never, cfg(ARACHNID) as never, undefined);
    expect(s.status).toEqual({ name: 'arachnid', ready: true });

    const spy = (async (url: unknown, init: RequestInit) => {
      seen.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ classification: 'no-known-match', match_type: null }) };
    }) as unknown as typeof fetch;

    expect(await withFetch(spy, () => s.check(JPEG, 'image/jpeg', { userId: 'u1', surface: 'post-media' })))
      .toBe('clear');

    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('https://shield.projectarachnid.com/v1/media/');
    const headers = seen[0].init.headers as Record<string, string>;
    // The image's own mime type, because the body IS the image — not JSON with
    // the image inside it, which is what the other dialect sends.
    expect(headers['Content-Type']).toBe('image/jpeg');
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('esp-user:esp-pass').toString('base64')}`);
    expect(seen[0].init.body).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(seen[0].init.body as Uint8Array).equals(JPEG)).toBe(true);
  });

  /**
   * THE ASYMMETRY THAT DECIDES THIS RULE. The Centre says more categories may
   * be added. Reading an unknown one as a pass waves through exactly what the
   * gate exists to stop; reading it as a hit refuses one image loudly and puts
   * a row in front of a person. Only `no-known-match` is a pass.
   */
  it.each([
    ['csam', 'exact'],
    ['harmful-abusive-material', 'near'],
    ['some-category-added-next-year', null],
  ])('treats %s as a match', async (classification, matchType) => {
    const created: Record<string, unknown>[] = [];
    const prisma = {
      csamHit: { create: async (a: { data: Record<string, unknown> }) => { created.push(a.data); return {}; } },
      user: { update: async () => ({}) },
    };
    const s = new HashMatchService(prisma as never, cfg(ARACHNID) as never, undefined);
    const out = await withFetch(
      answering({ classification, match_type: matchType }),
      () => s.check(JPEG, 'image/jpeg', { userId: 'u9', surface: 'chat-snap', storageKey: 'k', bucket: 'private' }),
    );
    expect(out).toBe('match');
    // The row names what matched, so the person filing the report can read it.
    expect(String(created[0].source)).toContain(classification);
  });

  it('reads no-known-match, and only that, as clear', async () => {
    const s = new HashMatchService({} as never, cfg(ARACHNID) as never, undefined);
    const out = await withFetch(
      answering({ classification: 'no-known-match', match_type: null }),
      () => s.check(JPEG, 'image/jpeg', { userId: 'u1', surface: 'post-media' }),
    );
    expect(out).toBe('clear');
  });

  /**
   * A 200 IN THE WRONG SHAPE IS AN OUTAGE, NOT A PASS — the same rule the
   * contract dialect applies to a missing boolean. A body without a
   * classification means somebody pointed this at the wrong endpoint, and the
   * one answer that must never be invented is "clear".
   */
  it.each([
    ['a body with no classification', { ok: true }],
    ['a classification that is not a string', { classification: 7 }],
    ['an empty classification', { classification: '   ' }],
  ])('treats %s as unavailable', async (_name, body) => {
    const s = new HashMatchService({} as never, cfg(ARACHNID) as never, undefined);
    const out = await withFetch(
      answering(body),
      () => s.check(JPEG, 'image/jpeg', { userId: 'u1', surface: 'post-media' }),
    );
    expect(out).toBe('unavailable');
  });

  it('treats a 401 as unavailable, never as clear', async () => {
    const p = new ArachnidHashMatchProvider('https://shield.test/v1/media/', 'u', 'p', 8000);
    await withFetch(answering({ detail: 'nope' }, 401), async () => {
      await expect(p.check(JPEG, 'image/jpeg', 'ab'.repeat(32))).rejects.toBeInstanceOf(HashMatchUnavailable);
    });
  });

  /**
   * HALF-CONFIGURED IS UNCONFIGURED. A dialect named without its credentials
   * must NOT fall through to the generic contract — Basic credentials sent as
   * a Bearer token is a 401 on every photograph in the city wearing the badge
   * of a configured matcher.
   */
  it('refuses to fall back to the other dialect when the credentials are missing', async () => {
    for (const missing of [{ 'csamMatch.user': '' }, { 'csamMatch.password': '' }]) {
      const s = new HashMatchService({} as never, cfg({ ...ARACHNID, ...missing }) as never, undefined);
      expect(s.status).toEqual({ name: 'none', ready: false });
      expect(await s.check(JPEG, 'image/jpeg', { userId: 'u1', surface: 'post-media' })).toBe('unavailable');
    }
  });

  it('leaves the contract dialect alone when no kind is named', () => {
    const s = new HashMatchService({} as never, cfg({ 'csamMatch.url': 'https://matcher.example/check' }) as never, undefined);
    expect(s.status).toEqual({ name: 'http', ready: true });
  });
});
