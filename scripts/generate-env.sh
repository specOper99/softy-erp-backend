#!/usr/bin/env bash
# =============================================================================
# Softy ERP — Production .env Generator
# =============================================================================
# Prompts for required runtime values, auto-generates all cryptographic
# secrets, and writes a production-ready .env with strict permissions (600).
#
# Usage:
#   bash scripts/generate-env.sh                   # writes .env in backend/
#   bash scripts/generate-env.sh /custom/path/.env # custom output path
#
# Requirements: bash 3.2+, openssl
# =============================================================================
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
R='\033[0;31m'; Y='\033[1;33m'; G='\033[0;32m'
C='\033[0;36m'; B='\033[1m'; D='\033[2m'; N='\033[0m'

info()    { echo -e "${C}  ▶${N} $*"; }
warn()    { echo -e "${Y}  ⚠${N}  $*"; }
ok()      { echo -e "${G}  ✔${N} $*"; }
die()     { echo -e "${R}  ✖ ERROR:${N} $*" >&2; exit 1; }
section() { echo -e "\n${B}━━━ $* ━━━${N}"; }

# ── Preflight ─────────────────────────────────────────────────────────────────
command -v openssl >/dev/null 2>&1 || die "openssl is required but not installed."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${1:-${SCRIPT_DIR}/../.env}"

# ── Secret generators ─────────────────────────────────────────────────────────
# 32 random bytes → base64 (44 chars, 256 bits — satisfies env-validation MinLength(43))
gen256() { openssl rand -base64 32; }
# 16 random bytes → base64 (24 chars — satisfies MinLength(16) for METRICS_TOKEN)
gen128() { openssl rand -base64 16; }

# ── Input helpers ─────────────────────────────────────────────────────────────
# All reads use </dev/tty so the script works even when piped (e.g. curl | bash).

# ask "prompt" "default"
ask() {
  local _v
  read -rp "  $1 [${D}${2}${N}]: " _v </dev/tty
  printf '%s' "${_v:-$2}"
}

# ask_required "prompt"
ask_required() {
  local _v=""
  while [[ -z "$_v" ]]; do
    read -rp "  $1 (required): " _v </dev/tty
    [[ -z "$_v" ]] && echo -e "  ${R}Value cannot be empty.${N}"
  done
  printf '%s' "$_v"
}

# ask_secret "prompt" — hidden input, required
ask_secret() {
  local _v=""
  while [[ -z "$_v" ]]; do
    read -rsp "  $1 (required, hidden): " _v </dev/tty; echo
    [[ -z "$_v" ]] && echo -e "  ${R}Value cannot be empty.${N}"
  done
  printf '%s' "$_v"
}

# ask_opt_secret "prompt" — hidden input, optional (Enter to skip)
ask_opt_secret() {
  local _v=""
  read -rsp "  $1 (optional, press Enter to skip): " _v </dev/tty; echo
  printf '%s' "$_v"
}

# ask_yn "prompt" → echoes "true" or "false"
ask_yn() {
  local _v
  read -rp "  $1 [y/N]: " _v </dev/tty
  [[ "${_v:-n}" =~ ^[Yy]$ ]] && echo "true" || echo "false"
}

# ── Safe .env writer ──────────────────────────────────────────────────────────
# Accumulate all output in $_OUT so we write the file atomically at the end.
# This avoids leaving a partial file if the script is interrupted mid-way.
_OUT=""

# w KEY value — always double-quotes the value; escapes \ and " inside
w() {
  local escaped="${2//\\/\\\\}"     # \ → \\  (must be first)
  escaped="${escaped//\"/\\\"}"     # " → \"
  _OUT+="${1}=\"${escaped}\""$'\n'
}

# wlit KEY value — bare (no quotes); use for booleans, integers, enums
wlit() { _OUT+="${1}=${2}"$'\n'; }

# wcmt text — comment line
wcmt() { _OUT+="# ${*}"$'\n'; }

# wblank — blank separator line
wblank() { _OUT+=$'\n'; }

# ── Banner ────────────────────────────────────────────────────────────────────
echo
echo -e "${B}╔══════════════════════════════════════════════╗${N}"
echo -e "${B}║   Softy ERP — Production .env Generator     ║${N}"
echo -e "${B}╚══════════════════════════════════════════════╝${N}"
echo
info "Output: ${OUT}"

if [[ -f "$OUT" ]]; then
  warn ".env already exists at ${OUT}"
  OVERWRITE=$(ask_yn "Overwrite it? (a timestamped backup will be created first)")
  if [[ "$OVERWRITE" != "true" ]]; then echo "Aborted."; exit 0; fi
  BACKUP="${OUT}.bak.$(date +%Y%m%d%H%M%S)"
  cp "$OUT" "$BACKUP"
  ok "Backed up to ${BACKUP}"
fi

# ────────────────────────────────── Prompts ───────────────────────────────────

section "Application"
APP_NAME=$(ask    "App name"     "Softy ERP")
COMPANY_NAME=$(ask "Company name" "Softy")
COMPANY_URL=$(ask  "Company URL"  "https://erp.soft-y.org")
PORT=$(ask         "Listening port" "3000")

section "Database (PostgreSQL)"
DB_HOST=$(ask_required "Host")
DB_PORT=$(ask          "Port" "5432")
DB_USERNAME=$(ask_required "Username")
DB_PASSWORD=$(ask_secret   "Password")
DB_DATABASE=$(ask          "Database name" "$DB_USERNAME")
DB_POOL_SIZE=$(ask         "Connection pool size (prod recommendation: 50–100)" "50")

CONFIGURE_REPLICA=$(ask_yn "Configure a read replica?")
DB_REPLICA_HOSTS=""; DB_REPLICA_PORT=""; DB_REPLICA_USERNAME=""; DB_REPLICA_PASSWORD=""
if [[ "$CONFIGURE_REPLICA" == "true" ]]; then
  DB_REPLICA_HOSTS=$(ask_required "Replica host(s), comma-separated")
  DB_REPLICA_PORT=$(ask "Replica port" "$DB_PORT")
  DB_REPLICA_USERNAME=$(ask "Replica username (blank = use primary credentials)" "")
  [[ -n "$DB_REPLICA_USERNAME" ]] && DB_REPLICA_PASSWORD=$(ask_secret "Replica password")
fi

section "Redis"
REDIS_URL=$(ask_required "Redis URL (e.g. redis://localhost:6379 or rediss://user:pass@host:6380)")

section "CORS"
CORS_ORIGINS=$(ask_required "Allowed origins, comma-separated (e.g. https://app.example.com)")

section "Auto-generating cryptographic secrets"
info "JWT_SECRET …"                  ; JWT_SECRET=$(gen256)
info "PLATFORM_JWT_SECRET …"         ; PLATFORM_JWT_SECRET=$(gen256)
info "CURSOR_SECRET …"               ; CURSOR_SECRET=$(gen256)
info "PASSWORD_RESET_TOKEN_SECRET …" ; PASSWORD_RESET_TOKEN_SECRET=$(gen256)
info "ENCRYPTION_KEY …"              ; ENCRYPTION_KEY=$(gen256)
info "METRICS_TOKEN …"               ; METRICS_TOKEN=$(gen128)
ok "All 6 secrets generated (256-bit entropy each)"

JWT_ACCESS_EXPIRES_SECONDS=$(ask "JWT access token lifetime (seconds)" "900")
JWT_REFRESH_EXPIRES_DAYS=$(ask   "JWT refresh token lifetime (days)"   "7")

JWT_ALLOWED_ALGORITHMS="HS256"
JWT_PUBLIC_KEY=""; JWT_PRIVATE_KEY=""
USE_RS256=$(ask_yn "Use RS256 (asymmetric keys) instead of HS256?")
if [[ "$USE_RS256" == "true" ]]; then
  JWT_ALLOWED_ALGORITHMS="RS256"
  warn "Paste the PEM key as a single line with literal \\n newlines."
  JWT_PUBLIC_KEY=$(ask_required "JWT_PUBLIC_KEY (-----BEGIN PUBLIC KEY-----\\n...)")
  JWT_PRIVATE_KEY=$(ask_secret  "JWT_PRIVATE_KEY (-----BEGIN PRIVATE KEY-----\\n...)")
fi

section "Object Storage (MinIO / S3)"
CONFIGURE_STORAGE=$(ask_yn "Configure object storage?")
MINIO_ENDPOINT=""; MINIO_PUBLIC_URL=""; MINIO_BUCKET="softy-erp"
MINIO_REGION="us-east-1"; MINIO_ACCESS_KEY=""; MINIO_SECRET_KEY=""
if [[ "$CONFIGURE_STORAGE" == "true" ]]; then
  MINIO_ENDPOINT=$(ask_required "Endpoint URL (e.g. https://s3.amazonaws.com)")
  MINIO_PUBLIC_URL=$(ask        "Public URL for presigned links" "$MINIO_ENDPOINT")
  MINIO_BUCKET=$(ask            "Bucket name" "softy-erp")
  MINIO_REGION=$(ask            "Region"      "us-east-1")
  MINIO_ACCESS_KEY=$(ask_secret "Access key")
  MINIO_SECRET_KEY=$(ask_secret "Secret key")
fi

section "Email (SMTP)"
CONFIGURE_MAIL=$(ask_yn "Configure SMTP email?")
MAIL_HOST=""; MAIL_PORT="587"; MAIL_USER=""; MAIL_PASS=""
MAIL_FROM=""; MAIL_FROM_NAME=""; MAIL_FROM_ADDRESS=""
if [[ "$CONFIGURE_MAIL" == "true" ]]; then
  MAIL_HOST=$(ask_required "SMTP host")
  MAIL_PORT=$(ask          "SMTP port" "587")
  MAIL_USER=$(ask_required "SMTP username / login")
  MAIL_PASS=$(ask_secret   "SMTP password")
  MAIL_FROM_NAME=$(ask     "From display name" "$COMPANY_NAME")
  MAIL_FROM_ADDRESS=$(ask  "From email address" "noreply@${MAIL_HOST#smtp.}")
  MAIL_FROM="${MAIL_FROM_NAME} <${MAIL_FROM_ADDRESS}>"
fi

section "Seeding (initial data)"
SEED_ADMIN_PASSWORD=$(ask_secret "Admin seed password")
SEED_STAFF_PASSWORD=$(ask_secret "Staff seed password")
SEED_OPS_PASSWORD=$(ask_secret   "Ops seed password")
SEED_TENANT_NAME=$(ask  "Default tenant name"  "$COMPANY_NAME")
SEED_TENANT_SLUG=$(ask  "Default tenant slug"  "default-org")
SEED_EMAIL_DOMAIN=$(ask "Seed email domain"    "${COMPANY_URL#https://}")

section "Observability (optional)"
SENTRY_DSN=$(ask "Sentry DSN (press Enter to skip)" "")
OTEL_ENABLED=$(ask_yn "Enable OpenTelemetry tracing?")
ZIPKIN_ENDPOINT=""
[[ "$OTEL_ENABLED" == "true" ]] && \
  ZIPKIN_ENDPOINT=$(ask "OTLP/Zipkin endpoint" "http://localhost:9411/api/v2/spans")

section "HashiCorp Vault (optional)"
VAULT_ENABLED=$(ask_yn "Enable HashiCorp Vault secret injection?")
VAULT_ADDR=""; VAULT_TOKEN=""; VAULT_ROLE_ID=""; VAULT_SECRET_ID=""
VAULT_SECRET_PATH="secret/data/softy-erp"
if [[ "$VAULT_ENABLED" == "true" ]]; then
  VAULT_ADDR=$(ask_required "Vault address (e.g. https://vault.example.com)")
  VAULT_SECRET_PATH=$(ask   "Secret path" "secret/data/softy-erp")
  USE_APPROLE=$(ask_yn "Use AppRole auth (VAULT_ROLE_ID + VAULT_SECRET_ID)?")
  if [[ "$USE_APPROLE" == "true" ]]; then
    VAULT_ROLE_ID=$(ask_required "VAULT_ROLE_ID")
    VAULT_SECRET_ID=$(ask_secret "VAULT_SECRET_ID")
  else
    VAULT_TOKEN=$(ask_secret "VAULT_TOKEN")
  fi
fi

section "Stripe billing (optional)"
CONFIGURE_STRIPE=$(ask_yn "Configure Stripe?")
STRIPE_SECRET_KEY=""; STRIPE_WEBHOOK_SECRET=""; STRIPE_PUBLISHABLE_KEY=""
if [[ "$CONFIGURE_STRIPE" == "true" ]]; then
  STRIPE_SECRET_KEY=$(ask_opt_secret     "Stripe secret key (sk_live_...)")
  STRIPE_WEBHOOK_SECRET=$(ask_opt_secret "Stripe webhook secret (whsec_...)")
  STRIPE_PUBLISHABLE_KEY=$(ask           "Stripe publishable key (pk_live_...)" "")
fi

# ─────────────────────────────── Build file ───────────────────────────────────

GENERATED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

wcmt "============================================================================="
wcmt " SOFTY ERP — Production Environment"
wcmt " Generated : ${GENERATED_AT}"
wcmt " Generator : scripts/generate-env.sh"
wcmt "============================================================================="
wcmt " ⚠  SECURITY: Keep this file secret. Never commit to version control."
wcmt " ⚠  SECRETS:  Auto-generated via: openssl rand -base64 32 (256-bit entropy)"
wcmt "============================================================================="
wblank

wcmt "🌍 Application"
wlit NODE_ENV       production
wlit PORT           "$PORT"
w    APP_NAME       "$APP_NAME"
w    COMPANY_NAME   "$COMPANY_NAME"
w    COMPANY_URL    "$COMPANY_URL"
wlit ENABLE_SWAGGER false
wblank

wcmt "🧭 Reverse Proxy (required behind nginx / ALB / K8s ingress)"
wlit TRUST_PROXY true
wblank

wcmt "🗄️  Database"
w    DB_HOST        "$DB_HOST"
wlit DB_PORT        "$DB_PORT"
w    DB_USERNAME    "$DB_USERNAME"
w    DB_PASSWORD    "$DB_PASSWORD"
w    DB_DATABASE    "$DB_DATABASE"
wlit DB_SYNCHRONIZE false
wlit DB_LOGGING     false
wlit DB_MIGRATIONS_RUN true
wblank

wcmt "🗄️  Connection Pool"
wlit DB_POOL_SIZE           "$DB_POOL_SIZE"
wlit DB_CONNECTION_TIMEOUT  30000
wlit DB_IDLE_TIMEOUT        600000
wlit DB_STATEMENT_TIMEOUT   60000
wlit DB_MAX_QUERY_MS        1000
wlit DB_RETRY_ATTEMPTS      10
wlit DB_RETRY_DELAY_MS      3000
wblank

if [[ "$CONFIGURE_REPLICA" == "true" ]]; then
  wcmt "🗄️  Read Replica"
  w DB_REPLICA_HOSTS "$DB_REPLICA_HOSTS"
  wlit DB_REPLICA_PORT "$DB_REPLICA_PORT"
  [[ -n "$DB_REPLICA_USERNAME" ]] && w DB_REPLICA_USERNAME "$DB_REPLICA_USERNAME"
  [[ -n "$DB_REPLICA_PASSWORD" ]] && w DB_REPLICA_PASSWORD "$DB_REPLICA_PASSWORD"
  wblank
fi

wcmt "🔐 Authentication"
wlit JWT_ALLOWED_ALGORITHMS      "$JWT_ALLOWED_ALGORITHMS"
w    JWT_SECRET                  "$JWT_SECRET"
w    PLATFORM_JWT_SECRET         "$PLATFORM_JWT_SECRET"
w    CURSOR_SECRET               "$CURSOR_SECRET"
w    PASSWORD_RESET_TOKEN_SECRET "$PASSWORD_RESET_TOKEN_SECRET"
wlit JWT_ACCESS_EXPIRES_SECONDS  "$JWT_ACCESS_EXPIRES_SECONDS"
wlit JWT_REFRESH_EXPIRES_DAYS    "$JWT_REFRESH_EXPIRES_DAYS"
if [[ "$JWT_ALLOWED_ALGORITHMS" == "RS256" ]]; then
  w JWT_PUBLIC_KEY  "$JWT_PUBLIC_KEY"
  w JWT_PRIVATE_KEY "$JWT_PRIVATE_KEY"
fi
wblank

wcmt "🛡️  Data Encryption"
w    ENCRYPTION_KEY         "$ENCRYPTION_KEY"
wlit ENCRYPTION_KEY_VERSION v1
wblank

wcmt "🛡️  CORS"
w CORS_ORIGINS "$CORS_ORIGINS"
wblank

wcmt "🛡️  Account Lockout"
wlit LOCKOUT_MAX_ATTEMPTS     5
wlit LOCKOUT_DURATION_SECONDS 1800
wlit LOCKOUT_WINDOW_SECONDS   900
wblank

wcmt "🛡️  MFA"
wlit MFA_REQUIRED_ROLES ADMIN
wblank

wcmt "⚡ Redis"
w REDIS_URL "$REDIS_URL"
wblank

wcmt "📊 Metrics (Prometheus)"
wcmt " Requests must include: Authorization: Bearer <METRICS_TOKEN>"
w    METRICS_TOKEN      "$METRICS_TOKEN"
wlit METRICS_ALLOW_ANON false
wblank

wcmt "🚦 Rate Limiting (IP-level, global)"
wlit RATE_LIMIT_SOFT           200
wlit RATE_LIMIT_HARD           500
wlit RATE_LIMIT_WINDOW_SECONDS 60
wlit RATE_LIMIT_BLOCK_SECONDS  900
wblank

wcmt "🚦 Throttler (NestJS throttler — auth endpoints)"
wlit THROTTLE_SHORT_TTL_SECONDS  1
wlit THROTTLE_SHORT_LIMIT        3
wlit THROTTLE_MEDIUM_TTL_SECONDS 10
wlit THROTTLE_MEDIUM_LIMIT       20
wlit THROTTLE_LONG_TTL_SECONDS   60
wlit THROTTLE_LONG_LIMIT         100
wblank

if [[ "$CONFIGURE_STORAGE" == "true" ]]; then
  wcmt "📦 Object Storage"
  w    MINIO_ENDPOINT   "$MINIO_ENDPOINT"
  w    MINIO_PUBLIC_URL "$MINIO_PUBLIC_URL"
  w    MINIO_BUCKET     "$MINIO_BUCKET"
  w    MINIO_REGION     "$MINIO_REGION"
  w    MINIO_ACCESS_KEY "$MINIO_ACCESS_KEY"
  w    MINIO_SECRET_KEY "$MINIO_SECRET_KEY"
  wlit UPLOAD_TO_MINIO  true
  wblank
else
  wlit UPLOAD_TO_MINIO false
  wblank
fi

if [[ "$CONFIGURE_MAIL" == "true" ]]; then
  wcmt "📧 Email (SMTP)"
  w    MAIL_HOST         "$MAIL_HOST"
  wlit MAIL_PORT         "$MAIL_PORT"
  w    MAIL_USER         "$MAIL_USER"
  w    MAIL_PASS         "$MAIL_PASS"
  w    MAIL_FROM         "$MAIL_FROM"
  w    MAIL_FROM_NAME    "$MAIL_FROM_NAME"
  w    MAIL_FROM_ADDRESS "$MAIL_FROM_ADDRESS"
  wblank
fi

wcmt "🧪 Seeding"
w SEED_ADMIN_PASSWORD "$SEED_ADMIN_PASSWORD"
w SEED_STAFF_PASSWORD "$SEED_STAFF_PASSWORD"
w SEED_OPS_PASSWORD   "$SEED_OPS_PASSWORD"
w SEED_TENANT_NAME    "$SEED_TENANT_NAME"
w SEED_TENANT_SLUG    "$SEED_TENANT_SLUG"
w SEED_EMAIL_DOMAIN   "$SEED_EMAIL_DOMAIN"
wblank

wcmt "📋 Booking"
wlit MAX_TASKS_PER_BOOKING 500
wblank

wcmt "📊 Telemetry"
wlit OTEL_ENABLED "$OTEL_ENABLED"
[[ -n "$ZIPKIN_ENDPOINT" ]] && w ZIPKIN_ENDPOINT "$ZIPKIN_ENDPOINT"
[[ -n "$SENTRY_DSN"      ]] && w SENTRY_DSN      "$SENTRY_DSN"
wblank

wcmt "🔑 HashiCorp Vault"
wlit VAULT_ENABLED "$VAULT_ENABLED"
if [[ "$VAULT_ENABLED" == "true" ]]; then
  w VAULT_ADDR        "$VAULT_ADDR"
  w VAULT_SECRET_PATH "$VAULT_SECRET_PATH"
  [[ -n "$VAULT_TOKEN"     ]] && w VAULT_TOKEN     "$VAULT_TOKEN"
  [[ -n "$VAULT_ROLE_ID"   ]] && w VAULT_ROLE_ID   "$VAULT_ROLE_ID"
  [[ -n "$VAULT_SECRET_ID" ]] && w VAULT_SECRET_ID "$VAULT_SECRET_ID"
fi
wblank

if [[ "$CONFIGURE_STRIPE" == "true" ]]; then
  wcmt "💳 Stripe"
  [[ -n "$STRIPE_SECRET_KEY"      ]] && w STRIPE_SECRET_KEY      "$STRIPE_SECRET_KEY"
  [[ -n "$STRIPE_WEBHOOK_SECRET"  ]] && w STRIPE_WEBHOOK_SECRET  "$STRIPE_WEBHOOK_SECRET"
  [[ -n "$STRIPE_PUBLISHABLE_KEY" ]] && w STRIPE_PUBLISHABLE_KEY "$STRIPE_PUBLISHABLE_KEY"
  wblank
fi

# ── Write atomically with strict permissions ──────────────────────────────────
mkdir -p "$(dirname "$OUT")"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

printf '%s' "$_OUT" > "$TMP"
chmod 600 "$TMP"
mv "$TMP" "$OUT"
chmod 600 "$OUT"
trap - EXIT   # clear trap — file is in place

# ── Summary ───────────────────────────────────────────────────────────────────
section "Done"
echo
ok "Written:     ${OUT}"
ok "Permissions: 600 (owner read/write only)"
echo
echo -e "  ${B}App:${N}     ${APP_NAME} (${COMPANY_NAME})"
echo -e "  ${B}DB:${N}      ${DB_USERNAME}@${DB_HOST}:${DB_PORT}/${DB_DATABASE}"
echo -e "  ${B}Redis:${N}   ${REDIS_URL}"
echo -e "  ${B}JWT:${N}     ${JWT_ALLOWED_ALGORITHMS}"
echo -e "  ${B}Storage:${N} $([[ "$CONFIGURE_STORAGE" == "true" ]] && echo "enabled (${MINIO_ENDPOINT})" || echo "disabled")"
echo -e "  ${B}Email:${N}   $([[ "$CONFIGURE_MAIL" == "true" ]] && echo "enabled (${MAIL_HOST})" || echo "disabled")"
echo -e "  ${B}Vault:${N}   ${VAULT_ENABLED}"
echo -e "  ${B}OTEL:${N}    ${OTEL_ENABLED}"
echo -e "  ${B}Stripe:${N}  ${CONFIGURE_STRIPE}"
echo
warn "Back up the .env file securely. Losing auto-generated secrets means"
warn "all existing JWT tokens, encrypted data, and cursors will be invalidated."
echo
