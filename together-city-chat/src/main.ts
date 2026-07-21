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
  // Never send "*" with credentials (invalid + insecure). Dev: reflect the request
  // origin. Prod: an explicit comma-separated allowlist (enforced non-empty at boot).
  const corsOrigin = config.get<string>('corsOrigin') ?? '';
  const allowlist = corsOrigin.split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({
    origin: corsOrigin === '*' || allowlist.length === 0 ? true : allowlist,
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
