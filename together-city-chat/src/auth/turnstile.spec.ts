import { TurnstileService } from './turnstile.service';

/**
 * Off without a secret; with one, fail-closed on a missing token, a refused
 * token, and an unreachable Cloudflare.
 */
function withSecret(secret: string, fetchImpl?: typeof fetch) {
  const prior = process.env.TURNSTILE_SECRET;
  process.env.TURNSTILE_SECRET = secret;
  const svc = new TurnstileService();
  process.env.TURNSTILE_SECRET = prior;
  if (fetchImpl) (global as unknown as { fetch: typeof fetch }).fetch = fetchImpl;
  return svc;
}

describe('Turnstile', () => {
  const realFetch = global.fetch;
  afterEach(() => { (global as unknown as { fetch: typeof fetch }).fetch = realFetch; });

  it('is a no-op when no secret is configured', async () => {
    const svc = withSecret('');
    expect(svc.enabled).toBe(false);
    await expect(svc.assert(undefined)).resolves.toBeUndefined();
  });

  it('refuses a missing token once a secret exists', async () => {
    const svc = withSecret('s');
    await expect(svc.assert(undefined)).rejects.toThrow(/are you human/);
  });

  it('passes a token Cloudflare confirms and refuses one it does not', async () => {
    const ok = withSecret('s', (async () => ({ json: async () => ({ success: true }) })) as unknown as typeof fetch);
    await expect(ok.assert('t', '1.2.3.4')).resolves.toBeUndefined();
    const bad = withSecret('s', (async () => ({ json: async () => ({ success: false, 'error-codes': ['timeout-or-duplicate'] }) })) as unknown as typeof fetch);
    await expect(bad.assert('t')).rejects.toThrow(/did not pass/);
  });

  it('fails closed when Cloudflare cannot be reached', async () => {
    const svc = withSecret('s', (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch);
    await expect(svc.assert('t')).rejects.toThrow(/Could not confirm/);
  });
});
