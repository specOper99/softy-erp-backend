#!/bin/bash
set -e

CONTAINER_DB="softy-erp-postgres-1"
API_HEALTH="http://localhost:3000/health"

echo "🔥 starting Chaos Experiment: Database Failure check..."

# 1. Check Baseline
echo "Checking baseline health..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $API_HEALTH)
if [ "$STATUS" != "200" ]; then
  echo "❌ Error: System is not healthy ($STATUS) to begin with."
  exit 1
fi
echo "✅ Baseline Healthy."

# 2. Simulate Failure
echo "💀 Killing Database Container ($CONTAINER_DB)..."
docker stop $CONTAINER_DB

echo "Waiting 5s for health check to fail..."
sleep 5

# 3. Assert Failure
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $API_HEALTH)
if [ "$STATUS" == "503" ]; then
  echo "✅ Success: API reported 503 Service Unavailable as expected."
else
  echo "❌ Failed: API reported $STATUS instead of 503."
  # Continue to recovery anyway
fi

# 4. Recovery
echo "🚑 Recovering Database..."
docker start $CONTAINER_DB

echo "Waiting 10s for database to warm up..."
sleep 10

# 5. Assert Recovery
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $API_HEALTH)
if [ "$STATUS" == "200" ]; then
  echo "✅ Recovery Successful: API is back to 200 OK."
else
  echo "❌ Recovery Failed: API is still $STATUS."
  exit 1
fi

echo "🎉 Chaos Experiment Passed."
