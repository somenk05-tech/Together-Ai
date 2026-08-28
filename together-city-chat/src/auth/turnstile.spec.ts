import { TurnstileService } from './turnstile.service';

/**
 * Off without a secret; with one, fail-closed on a missing token, a refused
 * token, and an unreachable Cloudflare. And, since 28 Aug, on a token minted
 * somewhere we did not approve or at a door we did not ask about.
 */
function withEnv(secret: string, hosts: string, fetchImpl?: typeof fetch) {
  const priorSecret = process.env.TURNSTILE_SECRET;
  const priorHosts = process.env.TURNSTILE_HOSTNAMES;
  process.env.TURNSTILE_SECRET = secret;
  process.env.TURNSTILE_HOSTNAMES = hosts;
  const svc = new TurnstileService();
  process.env.TURNSTILE_SECRET = priorSecret;
  process.env.TURNSTILE_HOSTNAMES = priorHosts;
  if (fetchImpl) (global as unknown as { fetch: typeof fetch }).fetch = fetchImpl;
  return svc;
}

/** A siteverify reply, defaulting to the shape a good token produces. */
function replies(out: Record<string, unknown>) {
  return (async () => ({ json: async () => ({ success: true, hostname: 'togethercity.app', action: 'login', ...out }) })) as unknown as typeof fetch;
}

describe('Turnstile', () => {
  const realFetch = global.fetch;
  afterEach(() => { (global as unknown as { fetch: typeof fetch }).fetch = realFetch; });

  it('is a no-op when no secret is configured', async () => {
    const svc = withEnv('', '');
    expect(svc.enabled).toBe(false);
    await expect(svc.assert(undefined, 'login')).resolves.toBeUndefined();
  });

  it('refuses a missing token once a secret exists', async () => {
    const svc = withEnv('s', 'togethercity.app');
    await expect(svc.assert(undefined, 'login')).rejects.toThrow(/are you human/);
  });

  it('passes a token Cloudflare confirms and refuses one it does not', async () => {
    const ok = withEnv('s', 'togethercity.app', replies({}));
    await expect(ok.assert('t', 'login', '1.2.3.4')).resolves.toBeUndefined();
    const bad = withEnv('s', 'togethercity.app', replies({ success: false, 'error-codes': ['timeout-or-duplicate'] }));
    await expect(bad.assert('t', 'login')).rejects.toThrow(/did not pass/);
  });

  it('fails closed when Cloudflare cannot be reached', async () => {
    const svc = withEnv('s', 'togethercity.app', (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch);
    await expect(svc.assert('t', 'login')).rejects.toThrow(/Could not confirm/);
  });

  /**
   * The bypass this file exists for: a sitekey is public, so a widget that
   * lists localhost hands anyone a genuinely-confirmed production token.
   * `success` is true in every one of these — only the origin differs.
   */
  it('refuses a confirmed token minted on an unapproved hostname', async () => {
    const svc = withEnv('s', 'togethercity.app', replies({ hostname: 'localhost' }));
    await expect(svc.assert('t', 'login')).rejects.toThrow(/did not pass/);
  });

  it('refuses a confirmed token that reports no hostname at all', async () => {
    const svc = withEnv('s', 'togethercity.app', replies({ hostname: undefined }));
    await expect(svc.assert('t', 'login')).rejects.toThrow(/did not pass/);
  });

  it('reads the allowlist as a list, trimmed and case-insensitively', async () => {
    const svc = withEnv('s', ' TogetherCity.app , www.togethercity.app ', replies({ hostname: 'togethercity.app' }));
    await expect(svc.assert('t', 'login')).resolves.toBeUndefined();
  });

  it('refuses a token minted at a different door', async () => {
    const svc = withEnv('s', 'togethercity.app', replies({ action: 'login' }));
    await expect(svc.assert('t', 'register')).rejects.toThrow(/did not pass/);
  });

  it('refuses a token carrying no action', async () => {
    const svc = withEnv('s', 'togethercity.app', replies({ action: undefined }));
    await expect(svc.assert('t', 'login')).rejects.toThrow(/did not pass/);
  });

  /**
   * The failure that actually happened, 28 Aug: the site key was pasted into
   * TURNSTILE_SECRET. Both fields live in one box in the dashboard and both
   * open `0x4AAAAAAE`. The visitor is told to reload, which cannot help, so
   * the log has to name the field rather than repeat Cloudflare's code.
   */
  it('names the field when the secret is not a secret', async () => {
    const svc = withEnv('0x4AAAAAAEcylMxjooSOdcPv', 'togethercity.app',
      replies({ success: false, 'error-codes': ['invalid-input-secret'] }));
    const said: string[] = [];
    const log = (svc as unknown as { logger: { error(m: string): void } }).logger;
    const prior = log.error.bind(log);
    log.error = (m: string) => { said.push(m); };
    await expect(svc.assert('t', 'login')).rejects.toThrow(/did not pass/);
    log.error = prior;
    expect(said.join(' ')).toMatch(/Secret key/);
    expect(said.join(' ')).toMatch(/not the Site key/);
  });

  it('sends the secret trimmed, because a dashboard paste carries a newline', async () => {
    let sent = '';
    const spy = (async (_u: string, init: { body: URLSearchParams }) => {
      sent = init.body.get('secret') ?? '';
      return { json: async () => ({ success: true, hostname: 'togethercity.app', action: 'login' }) };
    }) as unknown as typeof fetch;
    const svc = withEnv('  s3cret\n', 'togethercity.app', spy);
    await expect(svc.assert('t', 'login')).resolves.toBeUndefined();
    expect(sent).toBe('s3cret');
  });

  /**
   * A secret with no allowlist cannot compare anything, so it refuses rather
   * than waving the comparison through. Production never gets here —
   * assertProductionConfig makes it fatal at boot.
   */
  it('refuses everything when a secret is set with no hostname allowlist', async () => {
    const svc = withEnv('s', '', replies({}));
    await expect(svc.assert('t', 'login')).rejects.toThrow(/misconfigured/);
  });
});
