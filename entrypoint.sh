#!/bin/sh
set -e

# Default: wait until devops applied migrations (does NOT run them).
# Coolify Dockerfile Application (no migrate sidecar): set RUN_MIGRATIONS_ON_BOOT=true
# so this container applies pending migrations, then starts Nest.
# Keep single-replica when using boot migrate (concurrent migrate races).
# Admin one-off: node dist/database/migrate.js
# (or: npm run migration:run:prod)

if [ "${RUN_MIGRATIONS_ON_BOOT:-false}" = "true" ]; then
  echo "RUN_MIGRATIONS_ON_BOOT=true — applying migrations before start..."
  node dist/database/migrate.js
else
  node dist/database/wait-for-migrations.js
fi

echo "Starting application..."
exec node dist/main.js
