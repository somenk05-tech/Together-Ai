import { originPolicy } from './cors-policy';

/**
 * CORS origin check for Socket.IO gateways.
 *
 * Decorators evaluate at import time, so this reads env directly — but the
 * POLICY is no longer written here. It was, and it was the pre-26-Aug one:
 * any `*.vercel.app` origin, reflected with `credentials: true`, under a
 * docblock claiming parity with a `main.ts` that had been deliberately
 * narrowed a month earlier. See `cors-policy.ts` for what happened and why
 * there is now one copy.
 */
const raw = process.env.CORS_ORIGIN ?? ((process.env.NODE_ENV ?? 'development') === 'production' ? '' : '*');
const policy = originPolicy(raw, (process.env.NODE_ENV ?? 'development') === 'production');

export const wsCors = {
  credentials: true,
  origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
    cb(null, policy.allows(origin));
  },
};
