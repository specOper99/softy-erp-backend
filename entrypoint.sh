#!/bin/sh
set -e

# Pre-flight: verify required environment variables are present.
# Fail fast with a clear message rather than a cryptic ECONNREFUSED.
_missing=""
for _var in DB_HOST DB_PORT DB_USERNAME DB_PASSWORD DB_DATABASE; do
  eval _val=\$$_var
  if [ -z "$_val" ]; then
    echo "ERROR: required environment variable $_var is not set." >&2
    _missing=1
  fi
done
if [ -n "$_missing" ]; then
  echo "ERROR: Set all required DB_* variables in Coolify -> your service -> Environment Variables." >&2
  exit 1
fi

# Wait for the database to accept TCP connections before running migrations.
# Handles slow DB startup and DNS propagation (EAI_AGAIN) on container orchestrators.
# Bounded so a genuinely misconfigured host still fails instead of hanging forever.
DB_WAIT_RETRIES="${DB_WAIT_RETRIES:-30}"
DB_WAIT_DELAY="${DB_WAIT_DELAY:-2}"

echo "Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT} (up to $((DB_WAIT_RETRIES * DB_WAIT_DELAY))s)..."

_attempt=1
while [ "$_attempt" -le "$DB_WAIT_RETRIES" ]; do
  if node -e "
    const net = require('net');
    const s = new net.Socket();
    s.setTimeout(3000);
    s.once('connect', () => { s.destroy(); process.exit(0); });
    s.once('timeout', () => { s.destroy(); process.exit(1); });
    s.once('error', () => process.exit(1));
    s.connect(Number(process.env.DB_PORT), process.env.DB_HOST);
  "; then
    echo "PostgreSQL is reachable."
    break
  fi
  if [ "$_attempt" -eq "$DB_WAIT_RETRIES" ]; then
    echo "ERROR: PostgreSQL at ${DB_HOST}:${DB_PORT} not reachable after ${DB_WAIT_RETRIES} attempts." >&2
    echo "ERROR: Check DB_HOST is the DB service's internal hostname and both containers share a Docker network." >&2
    exit 1
  fi
  echo "  attempt ${_attempt}/${DB_WAIT_RETRIES} - not ready, retrying in ${DB_WAIT_DELAY}s..."
  _attempt=$((_attempt + 1))
  sleep "$DB_WAIT_DELAY"
done

# Run migrations with a few retries: TCP being open does not guarantee
# Postgres has finished its own recovery/startup.
echo "Running database migrations..."
MIGRATE_RETRIES="${MIGRATE_RETRIES:-5}"
MIGRATE_DELAY="${MIGRATE_DELAY:-3}"

_m=1
while [ "$_m" -le "$MIGRATE_RETRIES" ]; do
  if node dist/database/migrate.js; then
    break
  fi
  if [ "$_m" -eq "$MIGRATE_RETRIES" ]; then
    echo "ERROR: migrations failed after ${MIGRATE_RETRIES} attempts." >&2
    exit 1
  fi
  echo "  migration attempt ${_m}/${MIGRATE_RETRIES} failed, retrying in ${MIGRATE_DELAY}s..."
  _m=$((_m + 1))
  sleep "$MIGRATE_DELAY"
done

echo "Starting application..."
exec node dist/main.js
