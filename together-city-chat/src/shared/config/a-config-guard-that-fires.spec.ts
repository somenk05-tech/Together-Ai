import { assertProductionConfig } from './configuration';

/**
 * ── THE CONFIG GUARDS, PROVEN TO FIRE ──
 *
 * `assertProductionConfig` is the loudest thing in this codebase: it refuses to
 * start on a forgeable token or a public health bucket, and warns on half a
 * dozen more. Nothing tested any of it. A guard nobody has watched fail is a
 * guard nobody knows works — which is the finding this file keeps producing
 * about other people's code, so it applies here first.
 *
 * The addition being pinned (28 Aug): PHOTO_MODERATION unset is a WARNING, not
 * a refusal. Unset means `rekognition`, which is right, so nothing is unsafe —
 * what is missing is the record that anybody decided. Taking a city down over a
 * safe configuration is not proportionate; STRICT_PROD_CONFIG is the switch for
 * anyone who wants it to be.
 */
const SAFE: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: 'x'.repeat(40),
  JWT_REFRESH_SECRET: 'y'.repeat(40),
  CORS_ORIGIN: 'https://togethercity.app',
  S3_ENDPOINT: 'https://e', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's',
  MEDIA_BUCKET: 'public-bucket', MEDIA_PRIVATE_BUCKET: 'private-bucket',
  EMAIL_PROVIDER: 'resend',
  PHOTO_MODERATION: 'rekognition',
};

function withEnv(over: NodeJS.ProcessEnv, run: () => void): string[] {
  const prior = process.env;
  const warned: string[] = [];
  const spy = jest.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { warned.push(a.join(' ')); });
  const errSpy = jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { warned.push(a.join(' ')); });
  process.env = { ...SAFE, ...over } as NodeJS.ProcessEnv;
  try { run(); } finally { process.env = prior; spy.mockRestore(); errSpy.mockRestore(); }
  return warned;
}

describe('what refuses to start', () => {
  it('a default JWT secret', () => {
    withEnv({ JWT_ACCESS_SECRET: '' }, () => {
      expect(() => assertProductionConfig()).toThrow(/JWT_ACCESS_SECRET/);
    });
  });

  it('health documents in the public bucket', () => {
    withEnv({ MEDIA_PRIVATE_BUCKET: '' }, () => {
      expect(() => assertProductionConfig()).toThrow(/PUBLIC media bucket/);
    });
    withEnv({ MEDIA_PRIVATE_BUCKET: 'public-bucket' }, () => {
      expect(() => assertProductionConfig()).toThrow(/SEPARATE bucket/);
    });
  });

  /**
   * A bot check that accepts a token from anywhere is believed and does
   * nothing. The service refuses every request in this state anyway, so the
   * boot refusal is not the difference between running and not — it is the
   * difference between a loud deploy log and a silent locked door. (28 Aug.)
   */
  it('a Turnstile secret with no hostname allowlist', () => {
    withEnv({ TURNSTILE_SECRET: 'k' }, () => {
      expect(() => assertProductionConfig()).toThrow(/TURNSTILE_HOSTNAMES/);
    });
    withEnv({ TURNSTILE_SECRET: 'k', TURNSTILE_HOSTNAMES: '  ,  ' }, () => {
      expect(() => assertProductionConfig()).toThrow(/TURNSTILE_HOSTNAMES/);
    });
    withEnv({ TURNSTILE_SECRET: 'k', TURNSTILE_HOSTNAMES: 'togethercity.app' }, () => {
      expect(() => assertProductionConfig()).not.toThrow();
    });
  });

  it('nothing at all, when the configuration is sound', () => {
    const said = withEnv({}, () => { expect(() => assertProductionConfig()).not.toThrow(); });
    expect(said.join(' ')).not.toMatch(/INSECURE/);
  });

  it('nothing at all outside production — a laptop is not a deployment', () => {
    withEnv({ NODE_ENV: 'development', JWT_ACCESS_SECRET: '', MEDIA_PRIVATE_BUCKET: '' }, () => {
      expect(() => assertProductionConfig()).not.toThrow();
    });
  });
});

describe('what only warns', () => {
  it('an unstated photo-screening posture — safe, and unrecorded', () => {
    const said = withEnv({ PHOTO_MODERATION: '' }, () => {
      expect(() => assertProductionConfig()).not.toThrow();
    });
    expect(said.join(' ')).toMatch(/PHOTO_MODERATION is unset/);
    expect(said.join(' ')).toMatch(/screening is ON by default/);
  });

  it('and STRICT_PROD_CONFIG turns that warning into a refusal', () => {
    withEnv({ PHOTO_MODERATION: '', STRICT_PROD_CONFIG: 'true' }, () => {
      expect(() => assertProductionConfig()).toThrow(/STRICT_PROD_CONFIG/);
    });
  });

  it('a stub mailer, which is the one that silently swallows every verification code', () => {
    const said = withEnv({ EMAIL_PROVIDER: '' }, () => {
      expect(() => assertProductionConfig()).not.toThrow();
    });
    expect(said.join(' ')).toMatch(/EMAIL_PROVIDER is unset/);
  });
});
