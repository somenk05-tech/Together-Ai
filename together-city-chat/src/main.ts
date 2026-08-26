import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './shared/filters/all-exceptions.filter';
import { initSentry, report } from './shared/errors/sentry';
import { RedisIoAdapter } from './shared/redis/redis-io.adapter';

async function bootstrap(): Promise<void> {
  // Before anything else can fail. No DSN, no-op.
  initSentry();
  process.on('unhandledRejection', (reason) => report(reason, { source: 'unhandledRejection' }));
  // bodyParser off so we can raise the JSON limit — photo/report uploads
  // (beauty analysis, blood-test ingest) send base64 images well past the
  // 100 kb Express default.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, bodyParser: false });
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
  app.use(json({ limit: '120mb' }));
  app.use(urlencoded({ limit: '120mb', extended: true }));
  // 2-year HSTS with preload — HTTPS only, everywhere (TLS terminates at the
  // platform edge; HTTP never reaches the app).
  app.use(helmet({ hsts: { maxAge: 63072000, includeSubDomains: true, preload: true } }));
  // CORS.
  //
  // THE PREMISE THE OLD COMMENT RESTED ON WAS FALSE. It said auth was
  // "Bearer-token + localStorage (no ambient session cookie)" and on that basis
  // reflected ANY *.vercel.app origin with credentials. But auth.controller.ts
  // sets `tc_refresh` as a SameSite=None; Secure cookie, and POST /auth/refresh
  // is public and returned both tokens in the body. So: deploy anything to a
  // free Vercel subdomain, get a signed-in citizen to visit it,
  // fetch('/api/auth/refresh', {credentials:'include'}), read a 60-day refresh
  // token. One request, full account takeover. Found in the 26 Aug audit.
  //
  // Now: the explicit CORS_ORIGIN allowlist, our own domain and subdomains, and
  // — only when CORS_PREVIEW_PROJECT names it — that ONE Vercel project's
  // aliases. Preview URLs of the form <project>-<hash>-<team>.vercel.app and
  // <project>-git-<branch>-<team>.vercel.app match; arbitrary subdomains do
  // not. '*' remains the development sentinel and is refused in production.
  const corsOrigin = config.get<string>('corsOrigin') ?? '';
  const allowlist = corsOrigin.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  const prod = process.env.NODE_ENV === 'production';
  const allowAll = corsOrigin === '*' && !prod;
  if (corsOrigin === '*' && prod) throw new Error('CORS_ORIGIN=* is not allowed in production');
  const previewProject = (process.env.CORS_PREVIEW_PROJECT ?? '').trim().toLowerCase();
  const previewTeam = (process.env.CORS_PREVIEW_TEAM ?? '').trim().toLowerCase();
  const isOurPreview = (o: string): boolean => {
    if (!previewProject || !previewTeam) return false;
    const m = /^https:\/\/([a-z0-9-]+)\.vercel\.app$/i.exec(o);
    if (!m) return false;
    const host = m[1].toLowerCase();
    return host === `${previewProject}-${previewTeam}`
      || host.startsWith(`${previewProject}-git-`) && host.endsWith(`-${previewTeam}`)
      || new RegExp(`^${previewProject}-[a-z0-9]{6,12}-${previewTeam}$`).test(host);
  };
  const isOwnDomain = (o: string) => /^https:\/\/([a-z0-9-]+\.)?togethercity\.app$/i.test(o);
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);                       // no Origin header (curl, same-origin, S2S)
      const o = origin.replace(/\/+$/, '');
      if (allowAll || allowlist.includes(o) || isOwnDomain(o) || isOurPreview(o)) return cb(null, true);
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
