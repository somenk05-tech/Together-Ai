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
  // The bot check, added 6 Sep. An unset secret used to boot green with
  // Turnstile silently off; it now refuses, so "sound" includes it — and the
  // case below proves the guard notices when it goes.
  TURNSTILE_SECRET: 'ts_secret', TURNSTILE_HOSTNAMES: 'togethercity.app',
  // The hash gate, added 6 Sep. Unset it is a WARNING rather than a refusal,
  // and only because the gate itself already refuses every image — so a
  // "sound" configuration includes it, and the case below proves the warning
  // fires when it goes.
  CSAM_MATCH_URL: 'https://matcher.example/check',
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

  /**
   * THE BOT CHECK CANNOT TAKE THE CITY DOWN (8 Sep). Both Turnstile findings
   * used to refuse the boot; on 8 Sep the unset-secret refusal reached a
   * Railway service without the secret and the whole API was down for an
   * afternoon. A missing bot check is a degraded city, not a dangerous one:
   * it boots, and it says so at error level on every start.
   */
  it('a Turnstile secret missing or without a hostname allowlist — boots, and is named as a problem', () => {
    const unset = withEnv({ TURNSTILE_SECRET: '' }, () => {
      expect(() => assertProductionConfig()).not.toThrow();
    });
    expect(unset.join(' ')).toMatch(/TURNSTILE_SECRET is unset/);
    const noHosts = withEnv({ TURNSTILE_SECRET: 'k', TURNSTILE_HOSTNAMES: '' }, () => {
      expect(() => assertProductionConfig()).not.toThrow();
    });
    expect(noHosts.join(' ')).toMatch(/TURNSTILE_HOSTNAMES is empty/);
    const blankHosts = withEnv({ TURNSTILE_SECRET: 'k', TURNSTILE_HOSTNAMES: '  ,  ' }, () => {
      expect(() => assertProductionConfig()).not.toThrow();
    });
    expect(blankHosts.join(' ')).toMatch(/TURNSTILE_HOSTNAMES is empty/);
    const sound = withEnv({ TURNSTILE_SECRET: 'k', TURNSTILE_HOSTNAMES: 'togethercity.app' }, () => {
      expect(() => assertProductionConfig()).not.toThrow();
    });
    expect(sound.join(' ')).not.toMatch(/TURNSTILE/);
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
  /**
   * THE ONE CHECK REKOGNITION IS NOT. A missing hash matcher does not refuse
   * the boot, because the gate itself already refuses every photograph in the
   * city — taking the whole API down as well would stop the routes that have
   * nothing to do with images, and hide the reason. It goes on the list so the
   * reason is in the deploy log rather than only in the support queue.
   */
  it('no known-bad hash matcher — the gate fails closed and the log says why', () => {
    const warned = withEnv({ CSAM_MATCH_URL: '' }, () => {
      expect(() => assertProductionConfig()).not.toThrow();
    });
    expect(warned.join(' ')).toMatch(/CSAM_MATCH_URL is unset/);
    expect(warned.join(' ')).toMatch(/fails CLOSED/);
  });

  /**
   * THE HARDEST STATE TO SEE FROM A DASHBOARD. The URL is set, so neither
   * finding above fires and the board reads as a live gate — while the service
   * refuses every photograph because it has no credentials to present. This is
   * the line that turns that afternoon into a minute.
   */
  it('a dialect named without its credentials — listed, and named', () => {
    for (const half of [{ CSAM_MATCH_USER: 'u' }, { CSAM_MATCH_PASSWORD: 'p' }, {}]) {
      const warned = withEnv(
        { CSAM_MATCH_URL: 'https://shield.projectarachnid.com/v1/media/', CSAM_MATCH_KIND: 'arachnid', ...half },
        () => { expect(() => assertProductionConfig()).not.toThrow(); },
      );
      expect(warned.join(' ')).toMatch(/CSAM_MATCH_USER \/ CSAM_MATCH_PASSWORD/);
      expect(warned.join(' ')).toMatch(/fails CLOSED/);
    }
  });

  it('both credentials set — the gate is live and says nothing', () => {
    const warned = withEnv(
      {
        CSAM_MATCH_URL: 'https://shield.projectarachnid.com/v1/media/', CSAM_MATCH_KIND: 'arachnid',
        CSAM_MATCH_USER: 'u', CSAM_MATCH_PASSWORD: 'p',
      },
      () => { expect(() => assertProductionConfig()).not.toThrow(); },
    );
    expect(warned.join(' ')).not.toMatch(/CSAM_MATCH/);
  });

  it('the hash gate switched off on purpose — boots, and is listed as a problem', () => {
    const warned = withEnv({ CSAM_MATCH_URL: 'off' }, () => {
      expect(() => assertProductionConfig()).not.toThrow();
    });
    expect(warned.join(' ')).toMatch(/CSAM_MATCH_URL=off/);
    expect(warned.join(' ')).toMatch(/BYPASSED/);
  });

  it('an unstated photo-screening posture — safe, and unrecorded', () => {
    const said = withEnv({ PHOTO_MODERATION: '' }, () => {
      expect(() => assertProductionConfig()).not.toThrow();
    });
    expect(said.join(' ')).toMatch(/PHOTO_MODERATION is unset/);
    expect(said.join(' ')).toMatch(/screening is ON by default/);
  });

  /**
   * AND STRICT_PROD_CONFIG CAN NO LONGER TURN IT INTO A REFUSAL (8 Sep). It
   * did, once: set on a clear day, it promoted a warning that shipped later
   * into a container that would not start, and the city was down for an
   * afternoon. A variable must never be able to promote tomorrow's warning
   * into today's outage; the switch is honoured by naming itself, loudly.
   */
  it('and STRICT_PROD_CONFIG makes the warning louder, never a refusal', () => {
    const said = withEnv({ PHOTO_MODERATION: '', STRICT_PROD_CONFIG: 'true' }, () => {
      expect(() => assertProductionConfig()).not.toThrow();
    });
    expect(said.join(' ')).toMatch(/PHOTO_MODERATION is unset/);
    expect(said.join(' ')).toMatch(/STRICT_PROD_CONFIG is set/);
    expect(said.join(' ')).toMatch(/no longer refuses/);
  });

  it('nothing a variable can set promotes a warning into a refusal — every warning boots', () => {
    for (const over of [
      { CSAM_MATCH_URL: '' }, { CSAM_MATCH_URL: 'off' }, { TURNSTILE_SECRET: '' }, { CORS_ORIGIN: '*' },
      { VAPID_PUBLIC_KEY: '' }, { EMAIL_PROVIDER: '' }, { PHOTO_MODERATION: '' },
    ]) {
      withEnv({ ...over, STRICT_PROD_CONFIG: 'true' }, () => {
        expect(() => assertProductionConfig()).not.toThrow();
      });
    }
  });

  it('a stub mailer, which is the one that silently swallows every verification code', () => {
    const said = withEnv({ EMAIL_PROVIDER: '' }, () => {
      expect(() => assertProductionConfig()).not.toThrow();
    });
    expect(said.join(' ')).toMatch(/EMAIL_PROVIDER is unset/);
  });
});
