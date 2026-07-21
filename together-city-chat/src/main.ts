import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './shared/filters/all-exceptions.filter';
import { RedisIoAdapter } from './shared/redis/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);

  app.use(helmet());
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
  const allowAll = corsOrigin === '*' || allowlist.length === 0;
  const isVercelApp = (o: string) => /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(o);
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);                       // no Origin header (curl, same-origin, S2S)
      const o = origin.replace(/\/+$/, '');
      if (allowAll || allowlist.includes(o) || isVercelApp(o)) return cb(null, true);
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
