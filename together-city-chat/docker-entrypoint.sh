#!/bin/sh
# Together City API — container startup.
# 1) Verify DATABASE_URL is configured (fail fast with a clear message if not).
# 2) Wait until PostgreSQL actually accepts connections (fresh databases and
#    redeploys often race the app boot by a few seconds).
# 3) Apply committed migrations if any exist, otherwise push the schema.
# 4) Start the API.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "=============================================================="
  echo " Together City API cannot start: DATABASE_URL is not set."
  echo ""
  echo " On Railway: add a PostgreSQL database to this project, then"
  echo " on THIS service open Variables and add a reference:"
  echo "   DATABASE_URL -> \${{Postgres.DATABASE_URL}}"
  echo " (Optional but recommended: REDIS_URL -> \${{Redis.REDIS_URL}})"
  echo "=============================================================="
  exit 1
fi

MAX_ATTEMPTS="${DB_WAIT_ATTEMPTS:-30}"
SLEEP_SECS="${DB_WAIT_SLEEP:-2}"
ATTEMPT=0
echo "Waiting for PostgreSQL to accept connections..."
until node -e "const{Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:4000});c.connect().then(()=>c.end()).then(()=>process.exit(0)).catch(()=>process.exit(1));"; do
  ATTEMPT=$((ATTEMPT+1))
  if [ "$ATTEMPT" -ge "$MAX_ATTEMPTS" ]; then
    echo "Database did not become reachable after $MAX_ATTEMPTS attempts."
    echo "Check that the PostgreSQL service is running and DATABASE_URL is correct."
    exit 1
  fi
  echo "  ...not ready (attempt $ATTEMPT/$MAX_ATTEMPTS), retrying in ${SLEEP_SECS}s"
  sleep "$SLEEP_SECS"
done
echo "PostgreSQL is reachable."

if [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  # Preferred path once migrations are committed: versioned, reviewable, and it
  # NEVER drops data (a destructive migration must be written explicitly).
  #
  # Auto-baseline: this database already has its tables (built earlier by
  # db push) but no Prisma migration history. Applying the initial migration
  # would try to CREATE existing tables and fail, so if we detect app tables but
  # no _prisma_migrations table, mark the first migration as already applied
  # (records history only — never runs its SQL, never touches data).
  FIRST_MIGRATION="$(ls prisma/migrations | grep -v migration_lock.toml | sort | head -n1)"
  NEEDS_BASELINE="$(node -e "
    const { Client } = require('pg');
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    c.connect()
      .then(async () => {
        const hist = await c.query(\"SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS has\");
        const app  = await c.query(\"SELECT to_regclass('public.\\\"User\\\"') IS NOT NULL AS has\");
        process.stdout.write(!hist.rows[0].has && app.rows[0].has ? 'yes' : 'no');
        await c.end();
      })
      .catch(() => process.stdout.write('no'));
  ")"
  if [ "$NEEDS_BASELINE" = "yes" ] && [ -n "$FIRST_MIGRATION" ]; then
    echo "Existing database without migration history — baselining ${FIRST_MIGRATION} as already applied..."
    npx prisma migrate resolve --applied "$FIRST_MIGRATION"
  fi
  # MIGRATIONS ARE A RELEASE STEP, NOT A BOOT STEP (5 Sep). railway.json runs
  # `prisma migrate deploy` as the pre-deploy command, once, before the new
  # instance starts — so a long migration cannot hold the health check hostage
  # and two overlapping instances do not both try it. This boot-time run stays
  # as the safety net for a host that ignores railway.json: `migrate deploy`
  # is idempotent and advisory-locked, so after the pre-deploy step it finds
  # nothing to do. MIGRATE_ON_BOOT=off skips it where the release step is known
  # to run.
  if [ "${MIGRATE_ON_BOOT:-on}" = "off" ]; then
    echo "MIGRATE_ON_BOOT=off — migrations were applied by the release step."
  else
    echo "Applying committed migrations (prisma migrate deploy)..."
    npx prisma migrate deploy
  fi
else
  # There is no db-push fallback here, deliberately.
  #
  # This branch used to run `prisma db push`, and if Postgres refused the change
  # as destructive it retried with `--accept-data-loss`. That kept deploys green
  # at the cost of silently dropping whatever stood in the way — real citizen
  # data, with no review, no record and no way back. A schema that cannot be
  # applied safely is a problem to look at, not to force through.
  #
  # If you are seeing this, prisma/migrations didn't make it into the image.
  # Check that the Dockerfile still copies prisma/ and that the directory is
  # committed. Do NOT "fix" it by putting db push back.
  echo "=============================================================="
  echo " Together City API cannot start: no migrations found."
  echo ""
  echo " Expected prisma/migrations to contain at least 0_baseline."
  echo " Refusing to fall back to 'prisma db push', which can drop"
  echo " production data to make a schema fit."
  echo "=============================================================="
  exit 1
fi

echo "Starting Together City API..."
exec node dist/main.js
