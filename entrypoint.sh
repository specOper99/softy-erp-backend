#!/bin/sh
set -e

# Wait until devops has applied migrations (does NOT run them).
# Admin one-off: node dist/database/migrate.js
# (or: npm run migration:run:prod)
node dist/database/wait-for-migrations.js

echo "Starting application..."
exec node dist/main.js
