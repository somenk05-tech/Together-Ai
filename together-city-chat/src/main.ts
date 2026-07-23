import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './shared/filters/all-exceptions.filter';
import { RedisIoAdapter } from './shared/redis/redis-io.adapter';

async function bootstrap(): Promise<void> {
  // bodyParser off so we can raise the JSON limit — photo/report uploads
  // (beauty analysis, blood-test ingest) send base64 images well past the
  // 100 kb Express default.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, bodyParser: false });
  const config = app.get(ConfigService);

  // Raised to fit a 75 MB video posted inline as base64 (~100 MB encoded) until
  // object storage (R2/S3) credentials are configured and direct-to-bucket
  // uploads take over. Photo/report base64 uploads sit comfortably under this.
  app.use(json({ limit: '120mb' }));
  app.use(urlencoded({ limit: '120mb', extended: true }));
  // 2-year HSTS with preload — HTTPS only, everywhere (TLS terminates at the
  // platform edge; HTTP never reaches the app).
  app.use(helmet({ hsts: { maxAge: 63072000, includeSubDomains: true, preload: true } }));
  // CORS. Auth is Bearer-token + localStorage (no ambient session cookie), so a
  // cross-origin site can't ride a logged-in user's credentials — which lets us
  // be resilient about origins without the classic CSRF risk. We allow: the
  // explicit CORS_ORIGIN allowlist, ANY of this app's own Vercel deployments
  // (production alias, branch aliases, and per-deploy preview URLs — a single
  // pinned alias otherwise CORS-blocks every other URL the app answers on), and
  // origin-less requests (curl / server-to-server / same-origin). "*" or an
  // empty allowlist reflects any origin. Trailing slashes are tolerated.
  const corsOrigin = config.get<string>('corsOrigin') ?? '';
  const allowlist = corsOrigin.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  // '*' is the dev sentinel only. In production an empty CORS_ORIGIN no longer
  // reflects every origin — the app's own domain + its Vercel deployments are
  // always allowed, so an empty allowlist is safe and strict by default.
  const allowAll = corsOrigin === '*';
  const isVercelApp = (o: string) => /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(o);
  // Our own custom domain (and subdomains) is always allowed — no env change needed.
  const isOwnDomain = (o: string) => /^https:\/\/([a-z0-9-]+\.)?togethercity\.app$/i.test(o);
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);                       // no Origin header (curl, same-origin, S2S)
      const o = origin.replace(/\/+$/, '');
      if (allowAll || allowlist.includes(o) || isVercelApp(o) || isOwnDomain(o)) return cb(null, true);
      return cb(null, false);                                   // disallowed → browser blocks (no server crash)
    },
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();

  // Real-time chat across multiple backend instances: fan Socket.IO events out
  // through Redis pub/sub. Degrades to single-instance if Redis is unavailable.
  const redisIoAdapter = new RedisIoAdapter(app, config.get<string>('redisUrl') ?? 'redis://localhost:6379');
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  const port = config.get<number>('port') ?? 4000;
  await app.listen(port);
  new Logger('Bootstrap').log(`Together City chat API on :${port} (WS + REST)`);
}
void bootstrap();
