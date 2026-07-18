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
    publicBaseUrl: string;
    region: string;
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
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

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: int(process.env.PORT, 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  databaseUrl: process.env.DATABASE_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh',
    accessTtl: int(process.env.JWT_ACCESS_TTL, 900),
    refreshTtl: int(process.env.JWT_REFRESH_TTL, 1209600),
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
    publicBaseUrl: process.env.MEDIA_PUBLIC_BASE_URL ?? '',
    region: process.env.S3_REGION ?? 'auto',
    endpoint: process.env.S3_ENDPOINT ?? '',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  },
  fcm: {
    enabled: process.env.FCM_ENABLED === 'true',
    projectId: process.env.FCM_PROJECT_ID ?? '',
    clientEmail: process.env.FCM_CLIENT_EMAIL ?? '',
    privateKey: (process.env.FCM_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  },
});
