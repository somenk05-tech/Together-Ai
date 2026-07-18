import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 configuration.
 *
 * As of Prisma 7 the datasource URL lives here, not in schema.prisma. Per the
 * `@prisma/config` types, `datasource` is OPTIONAL — required only for
 * commands that touch the database (migrate deploy / db push / db seed /
 * introspection). `prisma generate` needs no datasource at all.
 *
 * We therefore include the datasource block only when DATABASE_URL is set:
 *  - Docker build (`npx prisma generate`): no DATABASE_URL → no datasource →
 *    generate succeeds with no database available.
 *  - Container start / local CLI (migrate, db push, seed): DATABASE_URL is
 *    injected by the host (Railway/Render/Docker) or loaded from .env via
 *    dotenv above → datasource present → commands connect normally.
 *
 * Note: `env()` resolves eagerly and throws if the variable is missing, which
 * is why it sits inside the conditional.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  ...(process.env.DATABASE_URL ? { datasource: { url: env('DATABASE_URL') } } : {}),
});
