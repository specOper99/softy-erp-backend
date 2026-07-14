#!/usr/bin/env bash
# Recovery drill scaffold for docs/RECOVERY_CONTRACT.md (RPO ≤15m / RTO ≤1h).
# Modes:
#   --help       usage
#   --checklist  print operator steps (default)
#   --smoke      monthly wiring check (no restore); exit 0
#   --full       quarterly full drill — prints restore commands; does not auto-restore
#
# Dry-run: RESTORE_DRILL_DRY_RUN=true skips any restore attempt.
set -euo pipefail

MODE="${1:---checklist}"

usage() {
  cat <<'EOF'
Usage: recovery-drill.sh [--help|--checklist|--smoke|--full]

  --help       Show this help and exit 0
  --checklist  Print operator checklist (default); exit 0
  --smoke      Monthly smoke: validate script + print checklist; exit 0
  --full       Quarterly full drill: print restore commands for backup host

Environment:
  RESTORE_DRILL_DRY_RUN=true   Checklist only; never restore (exit 0)

This script never drops/restores a database by itself. Operators run
scripts/restore.sh with an explicit backup file on an isolated host.

See docs/RECOVERY_CONTRACT.md and docs/ops/OPERATOR_CHECKLIST.md.
EOF
}

print_banner() {
  echo "Softy ERP recovery drill"
  echo "Mode: ${MODE}"
  echo "RPO target: ≤15 minutes | RTO target: ≤1 hour"
  echo ""
}

print_checklist() {
  echo "Operator checklist:"
  echo "  1. Confirm latest WAL/base backup age ≤15m (Garage/off-site + PostgreSQL PITR)."
  echo "  2. Restore to isolated instance via scripts/restore.sh."
  echo "  3. Run backend migration:run against restored DB."
  echo "  4. Deploy previous GHCR image digest; verify /api/v1/health/ready."
  echo "  5. Record elapsed RTO and backup lag in docs/releases/ recovery log."
  echo ""
  echo "See docs/RECOVERY_CONTRACT.md for full procedure."
}

print_full_commands() {
  cat <<'EOF'

Full drill commands (backup host, isolated DB only):

  # 1) Restore backup (overwrites target DB — confirm interactively)
  cd backend
  ./scripts/restore.sh /path/to/backup.sql.gz
  # or: ./scripts/restore.sh --from-minio <filename>

  # 2) Apply migrations against restored DB
  npm run migration:run
  # prod image: node dist/database/migrate.js
  #          or: npm run migration:run:prod

  # 3) Redeploy previous GHCR digests in Coolify; hit /api/v1/health/ready

  # 4) Log RTO + backup lag under docs/releases/
EOF
}

case "${MODE}" in
  --help|-h)
    usage
    exit 0
    ;;
  --checklist|--smoke)
    print_banner
    print_checklist
    if [[ "${RESTORE_DRILL_DRY_RUN:-}" == "true" ]]; then
      echo "Dry-run OK — no restore executed."
    elif [[ "${MODE}" == "--smoke" ]]; then
      echo "Smoke OK — checklist printed; no restore executed."
    fi
    exit 0
    ;;
  --full)
    print_banner
    print_checklist
    print_full_commands
    if [[ "${RESTORE_DRILL_DRY_RUN:-}" == "true" ]]; then
      echo "Dry-run OK — full restore skipped."
      exit 0
    fi
    echo ""
    echo "Full drill requires operator credentials on backup host."
    echo "Re-run with RESTORE_DRILL_DRY_RUN=true for checklist-only, or execute restore.sh manually."
    exit 2
    ;;
  *)
    echo "ERROR: unknown mode '${MODE}'" >&2
    usage >&2
    exit 2
    ;;
esac
