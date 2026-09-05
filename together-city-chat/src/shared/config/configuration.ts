import { purposeSecret } from '../secrets/derived-secret';
import { publicBasesFrom } from '../../media/public-bases';
/** Central typed configuration loaded from environment variables. */
export interface AppConfig {
  env: string;
  port: number;
  corsOrigin: string;
  databaseUrl: string;
  redisUrl: string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: number;
    refreshTtl: number;
    refreshAbsoluteTtl: number;
  };
  policy: {
    editWindowSec: number;
    deleteEveryoneWindowSec: number;
    typingTimeoutMs: number;
    pageSize: number;
    maxUploadBytes: number;
  };
  media: {
    bucket: string;
    privateBucket: string;
    publicBaseUrl: string;
    /** Every base a stored public URL may still carry: the current one first,
     *  then MEDIA_LEGACY_PUBLIC_BASES (comma-separated) — the r2.dev address a
     *  row was written under before a custom domain was cut over. Read by
     *  everything that turns a stored URL back into a key. See public-bases.ts. */
    publicBases: string[];
    /** Where `workers/media-edge` answers. Empty = post media keeps the
     *  presigned R2 links it had before the edge Worker existed. */
    cdnBaseUrl: string;
    /** Where this API answers, as the public reaches it. Empty = dating photos
     *  keep the presigned-S3 path they had before the proxy route existed. */
    apiPublicBaseUrl: string;
    /** What signs media links — the value the edge Worker holds as
     *  LINK_SECRET. Never the JWT secret itself: see shared/secrets. */
    linkSecret: string;
    region: string;
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    corsOrigins: string;
  };
  fcm: {
    enabled: boolean;
    projectId: string;
    clientEmail: string;
    privateKey: string;
  };
  photoModeration: {
    mode: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    holdAt: number;
    rejectAt: number;
  };
}

const int = (v: string | undefined, d: number): number =>
  v === undefined ? d : Number.parseInt(v, 10);

const DEV_ACCESS_SECRET = 'dev-access';
const DEV_REFRESH_SECRET = 'dev-refresh';
/** The shapes a secret takes when somebody meant to come back and set it. */
export const STAND_IN_SECRET = /change[-_ ]?me|^dev-|^secret$|^password$|^to-?fill/i;

/**
 * Surface insecure/incomplete production config LOUDLY at boot so it's never a
 * silent problem. This warns rather than throws: a hard crash here would take the
 * whole API down if an env var is missing, and we never want config hygiene to
 * cause an outage. Set STRICT_PROD_CONFIG=true to upgrade these warnings to a
 * hard boot failure once the env vars are in place.
 */
/** Comma-separated hostname allowlist, trimmed and lowercased; empty entries dropped. */
function hostList(raw: string | undefined): Set<string> {
  return new Set((raw ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
}

export function assertProductionConfig(): void {
  if ((process.env.NODE_ENV ?? 'development') !== 'production') return;
  // JWT secrets are ALWAYS fatal in production: booting with forgeable tokens is
  // strictly worse than downtime. (Everything else below warns unless strict.)
  const fatal: string[] = [];
  // A PLACEHOLDER IS A DEFAULT (launch gate, third reading, 4 Sep). Only the
  // two dev strings were refused; `.env.local.bak` shipped `change-me-access`
  // / `change-me-refresh` (16 chars), which passed this check and drew a
  // warning below that STRICT mode alone could turn into a refusal. An
  // operator who seeded Railway from that file booted green with forgeable
  // tokens. Short, `change-me`, `dev-`, `secret`, `to-fill` — fatal, always, no
  // switch.
  for (const [name, dflt] of [['JWT_ACCESS_SECRET', DEV_ACCESS_SECRET], ['JWT_REFRESH_SECRET', DEV_REFRESH_SECRET]] as const) {
    const v = process.env[name] ?? '';
    if (!v || v === dflt) fatal.push(`${name} is missing/default — set a strong unique value (≥32 random chars).`);
    else if (v.length < 32) fatal.push(`${name} is ${v.length} chars — set a strong unique value (≥32 random chars).`);
    else if (STAND_IN_SECRET.test(v)) fatal.push(`${name} looks like a stand-in — set a strong unique value (≥32 random chars).`);
  }
  if (process.env.JWT_ACCESS_SECRET && process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
    fatal.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are the same value — a refresh token must not verify as an access token.');
  }

  /**
   * THE PRIVATE VAULT IS FATAL FOR THE SAME REASON THE SECRETS ARE.
   *
   * StorageProvider reads MEDIA_PRIVATE_BUCKET and, when it is empty, falls
   * back to the PUBLIC bucket: `this.healthBucket = privateBucket || bucket`.
   * Three things are written to that bucket — blood tests and prescriptions
   * (`health/`), every Drive file (`drive/`), and every dating photo
   * (`dating/`) — and all three are served through short-lived signed GETs, a
   * discipline the code keeps carefully and which becomes irrelevant the moment
   * the object itself sits somewhere anyone can fetch without a signature.
   *
   * The keys are UUIDs, so this is not enumerable from outside. It is still a
   * permanent unauthenticated URL for anything that ever leaks one, under a
   * MEDIA_PUBLIC_BASE_URL that exists to be read by the public. Health data and
   * dating photos in a public bucket is worse than downtime, which is this
   * file's own standing test for what may be fatal.
   *
   * It is only fatal when object storage is actually CONFIGURED. With no
   * endpoint or keys nothing is uploaded anywhere, so there is nothing to
   * expose and a refusal would only be config pedantry — that case warns below.
   */
  const storageOn = Boolean(process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID
    && process.env.S3_SECRET_ACCESS_KEY && process.env.MEDIA_BUCKET);
  if (storageOn) {
    const priv = (process.env.MEDIA_PRIVATE_BUCKET ?? '').trim();
    if (!priv) {
      fatal.push('MEDIA_PRIVATE_BUCKET is unset — health documents, Drive files and dating photos '
        + 'would be written to the PUBLIC media bucket. Create a private bucket and set it.');
    } else if (priv === (process.env.MEDIA_BUCKET ?? '').trim()) {
      fatal.push('MEDIA_PRIVATE_BUCKET is the same bucket as MEDIA_BUCKET — the private vault must be '
        + 'a SEPARATE bucket with no public access, or signed links protect nothing.');
    }
  }

  /**
   * A BLANK PUBLIC BASE URL DOES NOT WEAKEN THE ATTACHMENT CHECK. IT REMOVES IT.
   *
   * `assertAttachmentsAreYoursToSend` compares an attachment's origin against
   * `media.publicBaseUrl` — and the comparison is written `if (base && ...)`,
   * so an empty base skips it entirely and the only surviving rule is that the
   * path contains `/uploads/<senderId>/`. That segment is the sender's own id:
   * public knowledge, and theirs to type. With this unset,
   * `https://tracker.example/uploads/<senderId>/pixel.gif` is a valid
   * attachment, and every recipient's client fetches an arbitrary host the
   * moment the thread renders — a tracking pixel in any conversation, dating
   * ones included.
   *
   * Fatal for the same reason the private bucket is: nothing looks wrong in
   * this state. The check still appears to run, the deploy is green, and
   * render.yaml ships the variable `sync: false` — a blank an operator fills
   * in, or does not.
   */
  if (!(process.env.MEDIA_PUBLIC_BASE_URL ?? '').trim()) {
    fatal.push('MEDIA_PUBLIC_BASE_URL is unset — the attachment origin check is skipped entirely, so a message '
      + 'can carry an image from ANY host. Set it to the public origin media is served from.');
  }

  /**
   * A BOT CHECK WITH AN OPEN SIDE DOOR IS WORSE THAN NO BOT CHECK, BECAUSE
   * IT IS BELIEVED. (28 Aug.)
   *
   * TurnstileService compares siteverify's `hostname` against
   * TURNSTILE_HOSTNAMES. A sitekey is public and valid on every domain its
   * widget lists, so with no list to compare against a token minted on any
   * of them — a laptop running localhost, if the widget was created with
   * localhost on it — spends here exactly like one minted on togethercity.app.
   *
   * Fatal rather than a warning: the service already refuses every request in
   * this state, so the choice is not between running safely and not running.
   * It is between a boot that fails loudly in the deploy log and a city where
   * nobody can sign in and nothing says why.
   */
  if ((process.env.TURNSTILE_SECRET ?? '').trim() && hostList(process.env.TURNSTILE_HOSTNAMES).size === 0) {
    fatal.push('TURNSTILE_SECRET is set but TURNSTILE_HOSTNAMES is empty — a token minted on any domain the '
      + 'widget lists would be accepted. Set TURNSTILE_HOSTNAMES=togethercity.app (never localhost in production).');
  }

  if (fatal.length) {
    throw new Error(`Refusing to start with insecure config:\n  - ${fatal.join('\n  - ')}`);
  }
  const problems: string[] = [];
  const cors = process.env.CORS_ORIGIN ?? '';
  if (!cors || cors === '*') problems.push('CORS_ORIGIN is unset/"*" — set an explicit origin list.');
  if (!storageOn) {
    problems.push('Object storage is not configured (S3_ENDPOINT / S3 keys / MEDIA_BUCKET) — every upload '
      + 'returns an unsigned placeholder URL and no file is actually stored.');
  }
  /**
   * THE SCREENING POSTURE HAS TO BE A DECISION, NOT AN INHERITANCE.
   *
   * `PHOTO_MODERATION` unset means `rekognition`, which is the right mode — so
   * nothing is wrong today, and that is exactly what makes it worth a line. The
   * variable that decides whether strangers' photographs are looked at before
   * other strangers see them is the last one that should be answered by a
   * default nobody chose, and an operator reading the panel cannot tell
   * screening is on by looking: there is no row.
   *
   * A warning rather than a fatal, deliberately, and the difference matters.
   * The three checks above refuse an UNSAFE state — a public bucket, a
   * forgeable token, `PHOTO_MODERATION=off`. This one refuses an UNSTATED one,
   * and taking a city down over a safe configuration is not proportionate.
   * `STRICT_PROD_CONFIG=true` upgrades it, along with everything else here,
   * which is what that switch is for.
   */
  if (!(process.env.PHOTO_MODERATION ?? '').trim()) {
    problems.push('PHOTO_MODERATION is unset — dating photo screening is ON by default, which is right, '
      + 'but nothing records that anybody decided it. Set PHOTO_MODERATION=rekognition.');
  }
  // `??` treats an EMPTY string as a value, so EMAIL_PROVIDER="" — which is what
  // a variable cleared in a dashboard leaves behind, and what a trailing newline
  // amounts to — walked past this check and took the "somebody chose a provider"
  // branch. Every reader elsewhere trims to unset; so does this now. Found by
  // writing the first test this function has ever had.
  const emailProvider = ((process.env.EMAIL_PROVIDER ?? '').trim()
    || (process.env.MESSAGING_PROVIDER ?? '').trim()
    || 'stub').toLowerCase();
  /* PUSH IS OFF UNLESS SOMEBODY SET THESE, and it was off in the shipped
     deploy config — VAPID appeared nowhere in render.yaml, .env.example or
     this function until 29 Aug. Web push is the whole of push on this
     deployment (the FCM list is always empty), so the failure is total and
     completely silent: WebPushProvider logs one line at boot, every send()
     returns early, and the browser is handed an empty key and stops asking. */
  /* Read here rather than imported from web-push.provider.ts: this file is a
     leaf on purpose — it has no imports at all, because it runs at
     ConfigModule load, before the injector exists. */
  if (!(process.env.VAPID_PUBLIC_KEY ?? '').trim() || !(process.env.VAPID_PRIVATE_KEY ?? '').trim()) {
    problems.push('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are unset — NO push notification will be delivered to anybody. Generate a pair with `npx web-push generate-vapid-keys`.');
  }
  if (emailProvider === 'stub' && process.env.ALLOW_STUB_MESSAGING !== 'true') {
    problems.push('EMAIL_PROVIDER is unset (stub) — verification & OTP emails will NOT send. Set EMAIL_PROVIDER=resend + RESEND_API_KEY (or ALLOW_STUB_MESSAGING=true to acknowledge).');
  }
  /* NAMED BUT UNUSABLE IS THE STATE THIS FILE MISSED (re-audit, 29 Aug).
     `EMAIL_PROVIDER=resend` with an empty `RESEND_API_KEY` passed every check
     here — the provider is not 'stub', so nothing objected — and then the
     Resend client throws the moment anything constructs it. The render
     blueprint encodes exactly that shape: the provider name is a literal and
     the key is a blank the operator fills. Named without its credential is not
     configured, and saying so at boot is cheaper than finding out from a
     citizen who never got their code. */
  if (emailProvider === 'resend' && !(process.env.RESEND_API_KEY ?? '').trim()) {
    problems.push('EMAIL_PROVIDER=resend but RESEND_API_KEY is empty — the client cannot be constructed, so no email sends at all.');
  }
  if (!problems.length) return;
  const banner = `\n${'='.repeat(66)}\n INSECURE / INCOMPLETE PRODUCTION CONFIG:\n  - ${problems.join('\n  - ')}\n${'='.repeat(66)}`;
  if (process.env.STRICT_PROD_CONFIG === 'true') {
    throw new Error(`Refusing to start (STRICT_PROD_CONFIG):${banner}`);
  }
  // eslint-disable-next-line no-console
  console.error(banner);
}

export default (): AppConfig => {
  assertProductionConfig();
  const isProd = (process.env.NODE_ENV ?? 'development') === 'production';
  return {
  env: process.env.NODE_ENV ?? 'development',
  port: int(process.env.PORT, 4000),
  // Dev reflects the request origin ('*' sentinel → handled in main.ts); prod is an explicit list.
  corsOrigin: process.env.CORS_ORIGIN ?? (isProd ? '' : '*'),
  databaseUrl: process.env.DATABASE_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? DEV_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? DEV_REFRESH_SECRET,
    accessTtl: int(process.env.JWT_ACCESS_TTL, 900),
    // 60 days — long-lived refresh so "stay signed in until I log out" holds
    // across browser restarts. Rotated single-use on every silent refresh.
    refreshTtl: int(process.env.JWT_REFRESH_TTL, 5184000),
    // The ceiling a session can slide to, measured from sign-in (5 Sep):
    // each refresh extends by refreshTtl, this is the day it stops extending.
    refreshAbsoluteTtl: int(process.env.JWT_REFRESH_ABSOLUTE_TTL, 90 * 86400),
  },
  policy: {
    editWindowSec: int(process.env.MESSAGE_EDIT_WINDOW_SEC, 900),
    deleteEveryoneWindowSec: int(process.env.MESSAGE_DELETE_EVERYONE_WINDOW_SEC, 3600),
    typingTimeoutMs: int(process.env.TYPING_TIMEOUT_MS, 3000),
    pageSize: int(process.env.MESSAGES_PAGE_SIZE, 30),
    maxUploadBytes: int(process.env.MAX_UPLOAD_BYTES, 52428800),
  },
  media: {
    bucket: process.env.MEDIA_BUCKET ?? '',
    privateBucket: process.env.MEDIA_PRIVATE_BUCKET ?? '',
    publicBaseUrl: process.env.MEDIA_PUBLIC_BASE_URL ?? '',
    publicBases: publicBasesFrom(process.env.MEDIA_PUBLIC_BASE_URL, process.env.MEDIA_LEGACY_PUBLIC_BASES),
    cdnBaseUrl: (process.env.MEDIA_CDN_BASE ?? '').replace(/\/+$/, ''),
    apiPublicBaseUrl: (process.env.PUBLIC_API_URL ?? '').replace(/\/+$/, ''),
    linkSecret: purposeSecret(process.env.MEDIA_LINK_SECRET, process.env.JWT_ACCESS_SECRET ?? DEV_ACCESS_SECRET, 'media-link'),
    region: process.env.S3_REGION ?? 'auto',
    endpoint: process.env.S3_ENDPOINT ?? '',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    // Browser origins allowed to PUT directly to the bucket (presigned uploads).
    // Comma-separated; defaults cover the production site + Vercel URLs + dev.
    corsOrigins: process.env.MEDIA_CORS_ORIGINS ?? '',
  },
  photoModeration: {
    // 'rekognition' | 'off'. Off is a DEVELOPMENT setting: every dating photo
    // is approved unread. In production the service refuses 'off' at boot.
    mode: process.env.PHOTO_MODERATION ?? 'rekognition',
    region: process.env.REKOGNITION_REGION ?? '',
    accessKeyId: process.env.REKOGNITION_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.REKOGNITION_SECRET_ACCESS_KEY ?? '',
    // A label at or above this confidence holds the photo for a person to
    // look at; at or above `rejectAt` it is refused outright.
    holdAt: int(process.env.PHOTO_MODERATION_HOLD_AT, 60),
    rejectAt: int(process.env.PHOTO_MODERATION_REJECT_AT, 90),
  },
  fcm: {
    enabled: process.env.FCM_ENABLED === 'true',
    projectId: process.env.FCM_PROJECT_ID ?? '',
    clientEmail: process.env.FCM_CLIENT_EMAIL ?? '',
    privateKey: (process.env.FCM_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  },
  };
};
