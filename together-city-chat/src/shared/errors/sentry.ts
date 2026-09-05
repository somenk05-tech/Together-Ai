import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';

/**
 * Error reporting, behind one variable. (26 Aug launch audit: "no instrument
 * on the dashboard to tell you any of it had happened".)
 *
 * With SENTRY_DSN unset nothing is initialised and `report()` is a no-op, so
 * development and tests run exactly as before. With it set, every 5xx the
 * exception filter sees and every unhandled rejection reaches Sentry, with
 * no request body and no citizen data attached — `sendDefaultPii` stays
 * false, which is the setting that decides that.
 */
let enabled = false;

export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN ?? '';
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // The API runs on Railway, which exposes RAILWAY_GIT_COMMIT_SHA; the
    // Vercel name was the web app's and never set here, so every error landed
    // as "no release" and nothing could be pinned to a deploy (4 Sep).
    release: process.env.SENTRY_RELEASE || process.env.RAILWAY_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
  enabled = true;
  new Logger('Sentry').log('Error reporting is on.');
  return true;
}

export function report(err: unknown, context: Record<string, string | number | boolean | undefined> = {}): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    for (const [k, v] of Object.entries(context)) if (v !== undefined) scope.setTag(k, String(v));
    Sentry.captureException(err);
  });
}
