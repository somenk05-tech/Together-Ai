import { ValidationPipe, Logger } from '@nestjs/common';
import { API_PREFIX } from './shared/api-prefix';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import compression from 'compression';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './shared/filters/all-exceptions.filter';
import { initSentry, report } from './shared/errors/sentry';
import { RedisIoAdapter } from './shared/redis/redis-io.adapter';
import { BootLogger, BOOT_LOG_LEVELS } from './shared/boot-logger';
import { originPolicy } from './shared/cors-policy';

async function bootstrap(): Promise<void> {
  // Before anything else can fail. No DSN, no-op — but say so, once, in the
  // words of what is lost: with reporting off, a 500 reaches a log stream and
  // nothing else. The /dev page keeps a local tally either way.
  if (!initSentry()) {
    new Logger('Sentry').warn('SENTRY_DSN is not set — server errors are logged and counted on /dev, and reported nowhere.');
  }
  process.on('unhandledRejection', (reason) => report(reason, { source: 'unhandledRejection' }));
  // bodyParser off so we can raise the JSON limit — photo/report uploads
  // (beauty analysis, blood-test ingest) send base64 images well past the
  // 100 kb Express default.
  // BootLogger drops RouterExplorer's ~600 route lines and keeps everything
  // else — see shared/boot-logger.ts. Without it the boot burst exceeds
  // Railway's 500 logs/sec and the platform drops whichever lines are in
  // flight, which on 28 Aug was 92 of them, at the one moment the log carries
  // every configuration warning this process knows how to give.
  const app = await NestFactory.create(AppModule, {
    bufferLogs: false,
    bodyParser: false,
    logger: new BootLogger('Nest', { logLevels: BOOT_LOG_LEVELS }),
  });
  const config = app.get(ConfigService);

  /**
   * TRUST THE PLATFORM PROXY, AND EXACTLY ONE HOP.
   *
   * TLS terminates at Render's edge and the request reaches this process over
   * the loopback, so without this `req.ip` is the proxy's address for EVERY
   * caller. Rate limiting keyed on that is not rate limiting: the whole city
   * shares one bucket, so one busy citizen throttles everybody and an attacker
   * is indistinguishable from the crowd they are hiding in.
   *
   * `1`, not `true`. `true` tells Express to believe the whole
   * X-Forwarded-For chain, which the client controls the left-hand end of — so
   * anyone could present a fresh "IP" per request and never be limited at all.
   * One hop means: take the address the proxy itself appended, and no further.
   */
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Raised to fit a 75 MB video posted inline as base64 (~100 MB encoded) until
  // object storage (R2/S3) credentials are configured and direct-to-bucket
  // uploads take over. Photo/report base64 uploads sit comfortably under this.
  /**
   * 120mb WAS FOUR TIMES WHAT ANYTHING SENDS (re-audit, 29 Aug).
   *
   * Express buffers the whole body before a route's Zod schema ever sees it,
   * so this number is the amount of memory an unauthenticated request can make
   * this process hold. The largest body any route actually accepts is the
   * Beauty analyzer's photo array — six slots at 4 MB of base64 — plus a
   * social post at ~15 MB; 32 MB clears both with room, and files that are
   * genuinely large do not come through here at all: they are presigned
   * straight to the bucket.
   */
  /**
   * COMPRESS THE RESPONSES. A feed page is JSON, and JSON is the most
   * compressible thing there is — the same forty keys repeated twenty times.
   * Measured on a real page this is roughly an 80% reduction, which at a
   * million citizens is 80% of the egress bill and 80% of the time a phone on
   * a train spends receiving it.
   *
   * `threshold` so a 200-byte `{ ok: true }` is not put through gzip to save
   * nothing; `filter` so anything already compressed — and anything a route
   * has explicitly opted out of — passes through untouched.
   *
   * Placed before the body parsers because it wraps the RESPONSE, and response
   * middleware has to be installed before whatever writes the response.
   */
  app.use(compression({
    threshold: 1024,
    filter: (req, res) => (res.getHeader('x-no-compression') ? false : compression.filter(req, res)),
  }));
  app.use(json({ limit: '32mb' }));
  app.use(urlencoded({ limit: '32mb', extended: true }));
  // 2-year HSTS with preload — HTTPS only, everywhere (TLS terminates at the
  // platform edge; HTTP never reaches the app).
  app.use(helmet({ hsts: { maxAge: 63072000, includeSubDomains: true, preload: true } }));
  // CORS. What is allowed, why it was narrowed on 26 Aug, and why the socket
  // gateway now reads the same function rather than its own stale copy of it:
  // all of it is in shared/cors-policy.ts, which is the only place the
  // matching happens. This file keeps the one decision it can make alone —
  // refusing the development wildcard in production, at boot, loudly.
  const corsOrigin = config.get<string>('corsOrigin') ?? '';
  const prod = process.env.NODE_ENV === 'production';
  if (corsOrigin === '*' && prod) throw new Error('CORS_ORIGIN=* is not allowed in production');
  const policy = originPolicy(corsOrigin, prod);
  app.enableCors({
    // Disallowed → `false`, so the browser blocks it and the server does not crash.
    origin: (origin, cb) => cb(null, policy.allows(origin)),
    credentials: true,
  });
  app.setGlobalPrefix(API_PREFIX);
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
