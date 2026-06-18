#!/bin/bash
# Validate Prometheus and Alertmanager configs under backend/docker/monitoring/.
# Used locally and in CI. Requires promtool (and optionally amtool) on PATH.
#
# Install:
#   brew install prometheus          # macOS
#   apt install prometheus promtool  # Debian/Ubuntu
#
# Usage: ./scripts/validate-prometheus-config.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITORING_DIR="${SCRIPT_DIR}/../docker/monitoring"
PROM_CONFIG="${MONITORING_DIR}/prometheus-platform.yml"
RULES_FILE="${MONITORING_DIR}/alert-rules.yml"
ALERTMANAGER_CONFIG="${MONITORING_DIR}/alertmanager.yml"

if [ ! -d "$MONITORING_DIR" ]; then
  echo "ERROR: monitoring directory not found: $MONITORING_DIR" >&2
  exit 1
fi

if ! command -v promtool >/dev/null 2>&1; then
  if [ "${CI:-}" = "true" ] || [ "${GITHUB_ACTIONS:-}" = "true" ]; then
    echo "ERROR: promtool required in CI but not found on PATH." >&2
    exit 1
  fi
  echo "SKIP: promtool not found on PATH."
  echo "Install prometheus package or run in CI with promtool available."
  echo "Manual check: docker run --rm -v \"${MONITORING_DIR}:/etc/prometheus\" prom/prometheus promtool check config /etc/prometheus/prometheus-platform.yml"
  exit 0
fi

echo "=== Prometheus config validation ==="

# promtool resolves rule_files paths relative to the config file location.
TMP_CONFIG="$(mktemp)"
trap 'rm -f "$TMP_CONFIG"' EXIT
sed "s|/etc/prometheus/alert-rules.yml|${RULES_FILE}|g" "$PROM_CONFIG" > "$TMP_CONFIG"

promtool check config "$TMP_CONFIG"
echo "OK: prometheus-platform.yml"

promtool check rules "$RULES_FILE"
echo "OK: alert-rules.yml"

if command -v amtool >/dev/null 2>&1; then
  echo "=== Alertmanager config validation ==="
  amtool check-config "$ALERTMANAGER_CONFIG"
  echo "OK: alertmanager.yml"
else
  echo "SKIP: amtool not found — alertmanager.yml not validated (install alertmanager package for full check)."
fi

echo "=== All available checks passed ==="
