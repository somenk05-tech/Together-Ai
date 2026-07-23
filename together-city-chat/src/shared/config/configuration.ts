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
function assertProductionConfig(): void {
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
  if (fatal.length) {
    throw new Error(`Refusing to start with insecure JWT config:\n  - ${fatal.join('\n  - ')}`);
  }
  const problems: string[] = [];
  if ((process.env.JWT_ACCESS_SECRET ?? '').length < 32 || (process.env.JWT_REFRESH_SECRET ?? '').length < 32) {
    problems.push('JWT secrets are shorter than 32 chars — rotate to ≥32 random chars.');
  }
  const cors = process.env.CORS_ORIGIN ?? '';
  if (!cors || cors === '*') problems.push('CORS_ORIGIN is unset/"*" — set an explicit origin list.');
  const emailProvider = (process.env.EMAIL_PROVIDER ?? process.env.MESSAGING_PROVIDER ?? 'stub').toLowerCase();
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
    region: process.env.S3_REGION ?? 'auto',
    endpoint: process.env.S3_ENDPOINT ?? '',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    // Browser origins allowed to PUT directly to the bucket (presigned uploads).
    // Comma-separated; defaults cover the production site + Vercel URLs + dev.
    corsOrigins: process.env.MEDIA_CORS_ORIGINS ?? '',
  },
  fcm: {
    enabled: process.env.FCM_ENABLED === 'true',
    projectId: process.env.FCM_PROJECT_ID ?? '',
    clientEmail: process.env.FCM_CLIENT_EMAIL ?? '',
    privateKey: (process.env.FCM_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  },
  };
};
