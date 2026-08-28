import { StorageProvider } from './storage.provider';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ── A WARNING THAT FIRED EVERY BOOT AND MEANT NOTHING ───────────────────────
 *
 * `onModuleInit` attempted `PutBucketCors` and warned when it failed. It failed
 * every single time — the R2 token has no bucket-configuration rights — while
 * both buckets carried a correct policy, set by hand. So a WARN naming two
 * buckets printed on every boot, for a state that was fine.
 *
 * An earlier pass fixed the WORDING, so it no longer claimed the policy was
 * missing. That was honest and insufficient: a warning nobody can act on is
 * still a warning nobody acts on, and it sat in the boot log beside the ones
 * that matter — `Photo review is not configured`, `MIRA_LOG_SALT is not set` —
 * teaching whoever read it that yellow at boot is normal here. On the same day
 * the boot log was found to be dropping 92 lines at Railway's rate limit, two
 * buckets' worth of false yellow is not a small thing.
 *
 * `corsStatus()` had always known how to answer properly: a REAL preflight,
 * needing no token rights, which is exactly what the browser sends. The check
 * existed; boot just never used it.
 *
 * These tests pin the three outcomes, and the middle one is the point — the
 * warning must still fire, loudly, when a browser really would be refused.
 */
describe('a warning somebody can act on', () => {
  function providerWith(preflight: { status?: number; allowOrigin?: string | null; throws?: string }) {
    const svc: any = Object.create(StorageProvider.prototype);
    const lines: Array<{ level: 'log' | 'warn'; text: string }> = [];
    svc.logger = {
      log: (t: string) => lines.push({ level: 'log', text: t }),
      warn: (t: string) => lines.push({ level: 'warn', text: t }),
    };
    svc.corsOrigins = ['https://togethercity.app'];
    svc.endpoint = 'https://example.r2.cloudflarestorage.com';
    svc.bucket = 'togethercity-media';
    svc.healthBucket = 'togethercity-media';
    // The token never has bucket-configuration rights — the real production case.
    svc.s3 = { send: async () => { throw new Error('Access Denied'); } };
    (globalThis as any).fetch = async () => {
      if (preflight.throws) throw new Error(preflight.throws);
      return { headers: { get: (h: string) => (h === 'access-control-allow-origin' ? preflight.allowOrigin ?? null : null) } };
    };
    return { svc, lines };
  }

  it('says nothing alarming when a browser would be allowed', async () => {
    const { svc, lines } = providerWith({ allowOrigin: 'https://togethercity.app' });
    await svc.onModuleInit();
    expect(lines.filter((l) => l.level === 'warn')).toEqual([]);
    expect(lines.some((l) => l.level === 'log' && /uploads allowed/.test(l.text))).toBe(true);
  });

  it('WARNS when a browser really would be refused, and says what to set', async () => {
    // The half that must not be lost. A quieter boot is only an improvement if
    // the real failure still shouts.
    const { svc, lines } = providerWith({ allowOrigin: null });
    await svc.onModuleInit();
    const warn = lines.find((l) => l.level === 'warn');
    expect(warn).toBeDefined();
    expect(warn!.text).toMatch(/REFUSED/);
    expect(warn!.text).toMatch(/AllowedOrigins/);
    expect(warn!.text).toMatch(/togethercity-media/);
  });

  it('does not warn when the probe itself could not run', async () => {
    // Not knowing is not the same as being broken. A network blip at boot is
    // not an operator's problem, and calling it one is how the log gets
    // ignored.
    const { svc, lines } = providerWith({ throws: 'ECONNRESET' });
    await svc.onModuleInit();
    expect(lines.filter((l) => l.level === 'warn')).toEqual([]);
    expect(lines.some((l) => /could not check \(ECONNRESET\)/.test(l.text))).toBe(true);
  });

  it('never warns merely because the policy write was denied', async () => {
    // The original defect, stated directly: PutBucketCors fails in every case
    // above, and only the refused one produces a warning.
    for (const p of [{ allowOrigin: 'https://togethercity.app' }, { throws: 'ECONNRESET' }]) {
      const { svc, lines } = providerWith(p);
      await svc.onModuleInit();
      expect({ p, warns: lines.filter((l) => l.level === 'warn').length }).toEqual({ p, warns: 0 });
    }
  });
});
