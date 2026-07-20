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
  echo "Applying committed migrations (prisma migrate deploy)..."
  npx prisma migrate deploy
else
  # No migrations yet: sync the schema WITHOUT --accept-data-loss. Additive
  # changes apply automatically; any change Prisma judges destructive aborts the
  # deploy (non-zero exit, data left intact) instead of silently dropping data.
  # `set -e` then stops startup so Railway keeps the previous, working release.
  echo "No migration history yet — syncing schema (prisma db push, non-destructive)..."
  npx prisma db push
fi

echo "Starting Together City API..."
exec node dist/main.js
