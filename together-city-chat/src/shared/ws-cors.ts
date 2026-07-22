/**
 * CORS origin check for Socket.IO gateways. Decorators evaluate at import time,
 * so this reads env directly (same policy as the HTTP CORS in main.ts):
 * the explicit CORS_ORIGIN allowlist, any of this app's own Vercel deployments,
 * our own custom domain (and subdomains), and origin-less clients. Dev
 * ('*' or unset outside production) reflects any origin.
 */
const raw = process.env.CORS_ORIGIN ?? ((process.env.NODE_ENV ?? 'development') === 'production' ? '' : '*');
const allowlist = raw.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
const allowAll = raw === '*';
const isVercelApp = (o: string) => /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(o);
const isOwnDomain = (o: string) => /^https:\/\/([a-z0-9-]+\.)?togethercity\.app$/i.test(o);

export const wsCors = {
  credentials: true,
  origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) return cb(null, true);
    const o = origin.replace(/\/+$/, '');
    cb(null, allowAll || allowlist.includes(o) || isVercelApp(o) || isOwnDomain(o));
  },
};
