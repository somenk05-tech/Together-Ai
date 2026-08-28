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
  };
  policy: {
    editWindowSec: number;
    deleteEveryoneWindowSec: number;
    typingTimeoutMs: number;
    pageSize: number;
    maxUploadBytes: number;
  };
  media: {
    provider: 'r2' | 's3';
    bucket: string;
    privateBucket: string;
    publicBaseUrl: string;
    /** Where this API answers, as the public reaches it. Empty = dating photos
     *  keep the presigned-S3 path they had before the proxy route existed. */
    apiPublicBaseUrl: string;
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

/**
 * Surface insecure/incomplete production config LOUDLY at boot so it's never a
 * silent problem. This warns rather than throws: a hard crash here would take the
 * whole API down if an env var is missing, and we never want config hygiene to
 * cause an outage. Set STRICT_PROD_CONFIG=true to upgrade these warnings to a
 * hard boot failure once the env vars are in place.
 */
export function assertProductionConfig(): void {
  if ((process.env.NODE_ENV ?? 'development') !== 'production') return;
  // JWT secrets are ALWAYS fatal in production: booting with forgeable tokens is
  // strictly worse than downtime. (Everything else below warns unless strict.)
  const fatal: string[] = [];
  if (!process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET === DEV_ACCESS_SECRET) {
    fatal.push('JWT_ACCESS_SECRET is missing/default — set a strong unique value (≥32 random chars).');
  }
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET === DEV_REFRESH_SECRET) {
    fatal.push('JWT_REFRESH_SECRET is missing/default — set a strong unique value (≥32 random chars).');
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

  if (fatal.length) {
    throw new Error(`Refusing to start with insecure config:\n  - ${fatal.join('\n  - ')}`);
  }
  const problems: string[] = [];
  if ((process.env.JWT_ACCESS_SECRET ?? '').length < 32 || (process.env.JWT_REFRESH_SECRET ?? '').length < 32) {
    problems.push('JWT secrets are shorter than 32 chars — rotate to ≥32 random chars.');
  }
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
  if (emailProvider === 'stub' && process.env.ALLOW_STUB_MESSAGING !== 'true') {
    problems.push('EMAIL_PROVIDER is unset (stub) — verification & OTP emails will NOT send. Set EMAIL_PROVIDER=resend + RESEND_API_KEY (or ALLOW_STUB_MESSAGING=true to acknowledge).');
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
  },
  policy: {
    editWindowSec: int(process.env.MESSAGE_EDIT_WINDOW_SEC, 900),
    deleteEveryoneWindowSec: int(process.env.MESSAGE_DELETE_EVERYONE_WINDOW_SEC, 3600),
    typingTimeoutMs: int(process.env.TYPING_TIMEOUT_MS, 3000),
    pageSize: int(process.env.MESSAGES_PAGE_SIZE, 30),
    maxUploadBytes: int(process.env.MAX_UPLOAD_BYTES, 52428800),
  },
  media: {
    provider: (process.env.MEDIA_PROVIDER as 'r2' | 's3') ?? 'r2',
    bucket: process.env.MEDIA_BUCKET ?? '',
    privateBucket: process.env.MEDIA_PRIVATE_BUCKET ?? '',
    publicBaseUrl: process.env.MEDIA_PUBLIC_BASE_URL ?? '',
    apiPublicBaseUrl: (process.env.PUBLIC_API_URL ?? '').replace(/\/+$/, ''),
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
