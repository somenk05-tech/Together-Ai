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
  // Named without its credential is not configured — the state the guard
  // missed until the re-audit, and the one render.yaml encodes.
  RESEND_API_KEY: 're_test',
  PHOTO_MODERATION: 'rekognition',
  // Push, added 29 Aug. Web push is the whole of push on this deployment and
  // it disables itself silently when these are unset, so "sound" now includes
  // them — see the case below that proves the guard notices when they go.
  VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv',
  // Attachment origins, added 3 Sep — see the case below that proves the guard
  // notices when it goes.
  MEDIA_PUBLIC_BASE_URL: 'https://media.togethercity.app',
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

  /**
   * A PLACEHOLDER IS A DEFAULT (4 Sep). `.env.local.bak` shipped
   * `change-me-access` / `change-me-refresh`; they passed the default check,
   * drew a warning, and STRICT_PROD_CONFIG was the only thing between an
   * operator who copied that file and a city with forgeable tokens. Short
   * and placeholder-shaped secrets refuse to start with no switch.
   */
  it('a change-me secret, a short secret, and two secrets that are the same', () => {
    withEnv({ JWT_ACCESS_SECRET: 'change-me-access-change-me-access-change-me' }, () => {
      expect(() => assertProductionConfig()).toThrow(/JWT_ACCESS_SECRET looks like a stand-in/);
    });
    withEnv({ JWT_REFRESH_SECRET: 'change-me-refresh' }, () => {
      expect(() => assertProductionConfig()).toThrow(/JWT_REFRESH_SECRET is 17 chars/);
    });
    withEnv({ JWT_REFRESH_SECRET: 'dev-' + 'r'.repeat(40) }, () => {
      expect(() => assertProductionConfig()).toThrow(/looks like a stand-in/);
    });
    withEnv({ JWT_REFRESH_SECRET: 'x'.repeat(40) }, () => {
      expect(() => assertProductionConfig()).toThrow(/are the same value/);
    });
    // STRICT off makes no difference: these were warnings, they are refusals.
    withEnv({ STRICT_PROD_CONFIG: 'false', JWT_ACCESS_SECRET: 'a'.repeat(31) }, () => {
      expect(() => assertProductionConfig()).toThrow(/31 chars/);
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
  /**
   * A BLANK PUBLIC BASE URL IS NOT A WEAKER CHECK, IT IS NO CHECK.
   * `assertAttachmentsAreYoursToSend` is written `if (base && ...)`, so an
   * empty base leaves only "the path contains /uploads/<senderId>/" — a segment
   * that is the sender's own id, public and theirs to type. Fatal because
   * nothing looks wrong in that state and render.yaml ships it `sync: false`.
   */
  it('an attachment origin check with no origin to check against', () => {
    withEnv({ MEDIA_PUBLIC_BASE_URL: '' }, () => {
      expect(() => assertProductionConfig()).toThrow(/MEDIA_PUBLIC_BASE_URL/);
    });
  });

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

  /**
   * Not fatal on its own — it goes onto the same list as everything else, so
   * STRICT_PROD_CONFIG decides. What matters is that it is SAID: web push is
   * the whole of push on this deployment, it turns itself off when these are
   * unset, and until 29 Aug nothing anywhere mentioned them. The shipped
   * render.yaml pushed to nobody and looked perfectly healthy doing it.
   */
  it('and a deployment with no push keys is told that it has no push', () => {
    const said = withEnv({ VAPID_PUBLIC_KEY: '' }, () => { assertProductionConfig(); });
    expect(said.join(' ')).toMatch(/NO push notification will be delivered/);
    const said2 = withEnv({ VAPID_PRIVATE_KEY: '  ' }, () => { assertProductionConfig(); });
    expect(said2.join(' ')).toMatch(/VAPID_PRIVATE_KEY/);
  });

  /**
   * `EMAIL_PROVIDER=resend` with an empty key passed every check here — the
   * provider is not 'stub', so nothing objected — and then the Resend client
   * throws the moment anything constructs it. render.yaml encodes exactly that
   * shape: the name is a literal, the key is a blank an operator fills.
   * (re-audit, 29 Aug)
   */
  it('and a named provider with no credential is not "configured"', () => {
    const said = withEnv({ RESEND_API_KEY: '' }, () => { assertProductionConfig(); });
    expect(said.join(' ')).toMatch(/RESEND_API_KEY is empty/);
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
