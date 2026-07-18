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
  echo "Applying committed migrations (prisma migrate deploy)..."
  npx prisma migrate deploy
else
  echo "No migration history yet — pushing schema (prisma db push)..."
  npx prisma db push --accept-data-loss
fi

echo "Starting Together City API..."
exec node dist/main.js
