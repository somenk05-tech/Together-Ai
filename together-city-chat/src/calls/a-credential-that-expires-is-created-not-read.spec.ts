/* eslint-disable @typescript-eslint/no-explicit-any */
import { CallsService } from './calls.service';

/**
 * ── A CREDENTIAL THAT EXPIRES IS CREATED, NOT READ (5 Sep, evening) ─────────
 * The metered.ca route minted through GET /turn/credentials?apiKey=…&expiryInSeconds=…
 * — and that endpoint ignores expiryInSeconds and returns the app's static
 * pair. Proved against the live app: the "minted" credential was the very
 * pair the change existed to retire, for every citizen, with a straight face.
 * The mint is a POST to /turn/credential?secretKey=… with the TTL in the body,
 * and the answer's `password` is the credential.
 */
function harness(reply: () => Promise<Response>) {
  const svc: any = Object.create(CallsService.prototype);
  svc.logger = { warn: () => undefined };
  svc.mintedFor = new Map();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => { calls.push({ url, init }); return reply(); }) as typeof fetch;
  return { svc, calls, restore: () => { globalThis.fetch = realFetch; } };
}

describe('minting at metered.ca', () => {
  const ok = () => Promise.resolve(new Response(JSON.stringify({ username: 'u-minted', password: 'p-minted', expiryInSeconds: 600, label: 'me' }), { status: 200 }));

  it('POSTs to /turn/credential with the secret key, the TTL in the body, and reads the password back', async () => {
    const h = harness(ok);
    try {
      const pair = await h.svc.meteredCredential('me', 'togethercity', 's3cret', 600);
      expect(pair).toEqual({ username: 'u-minted', credential: 'p-minted' });
      expect(h.calls).toHaveLength(1);
      const { url, init } = h.calls[0];
      expect(url).toBe('https://togethercity.metered.live/api/v1/turn/credential?secretKey=s3cret');
      expect(url).not.toMatch(/credentials\?apiKey/);
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ expiryInSeconds: 600, label: 'me' });
    } finally { h.restore(); }
  });

  it('keeps the pair for a third of its life, so ten opens of the calls screen are one request', async () => {
    const h = harness(ok);
    try {
      await h.svc.meteredCredential('me', 'togethercity', 's3cret', 600);
      await h.svc.meteredCredential('me', 'togethercity', 's3cret', 600);
      expect(h.calls).toHaveLength(1);
    } finally { h.restore(); }
  });

  it('a provider answer without a password is no credential — null, never the static pair', async () => {
    const h = harness(() => Promise.resolve(new Response(JSON.stringify([{ urls: 'turn:x', username: 'static', credential: 'static' }]), { status: 200 })));
    try {
      expect(await h.svc.meteredCredential('me', 'togethercity', 's3cret', 600)).toBeNull();
    } finally { h.restore(); }
  });

  it('a refused key is null too', async () => {
    const h = harness(() => Promise.resolve(new Response('nope', { status: 401 })));
    try {
      expect(await h.svc.meteredCredential('me', 'togethercity', 'bad', 600)).toBeNull();
    } finally { h.restore(); }
  });
});
