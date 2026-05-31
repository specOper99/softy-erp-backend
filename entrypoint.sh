#!/bin/sh
set -e

# The migration bootstrap owns DB readiness, retry policy, and
# DATABASE_URL / DB_* resolution so the container has one startup contract.
node dist/database/migrate.js

echo "Starting application..."
exec node dist/main.js
