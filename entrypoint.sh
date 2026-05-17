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
  echo "ERROR: Set all required DB_* variables in Coolify → your service → Environment Variables." >&2
  exit 1
fi

echo "Connecting to PostgreSQL at ${DB_HOST}:${DB_PORT}..."
echo "Running database migrations..."
node dist/database/migrate.js

echo "Starting application..."
exec node dist/main.js
