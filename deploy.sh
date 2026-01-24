#!/bin/bash

################################################################################
# Softy ERP - Backend Production Deployment Script
# Generated: 2026-01-25
# Compatible: Linux & macOS
# 
# This script automates the complete backend deployment process. It handles:
# - Interactive .env configuration wizard
# - Pre-deployment checks
# - Dependency installation
# - Database migrations
# - Application build
# - Health checks
# - Service startup
# - Post-deployment verification
################################################################################

set -e  # Exit on error
set -o pipefail  # Exit on pipe failure

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script configuration - Use relative paths
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="${SCRIPT_DIR}"
LOG_FILE="${BACKEND_DIR}/deployment-$(date +%Y%m%d-%H%M%S).log"

# Deployment options (can be overridden with environment variables)
DEPLOYMENT_TYPE="${DEPLOYMENT_TYPE:-bare-metal}"  # bare-metal, docker, kubernetes
RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"
RUN_TESTS="${RUN_TESTS:-false}"
START_SERVICE="${START_SERVICE:-true}"
INSTALL_DEPS="${INSTALL_DEPS:-true}"
BACKUP_DB="${BACKUP_DB:-false}"
CREATE_ADMIN="${CREATE_ADMIN:-false}"
DEPLOY_MONITORING="${DEPLOY_MONITORING:-false}"

# Track whether DEPLOY_INFRA was explicitly set (env var or flag).
DEPLOY_INFRA_SET=false
if [ -n "${DEPLOY_INFRA+x}" ]; then
    DEPLOY_INFRA_SET=true
fi
DEPLOY_INFRA="${DEPLOY_INFRA:-}"

# Kubernetes specific
K8S_NAMESPACE="${K8S_NAMESPACE:-softy-erp}"
K8S_CONTEXT="${K8S_CONTEXT:-}"
DOCKER_IMAGE="${DOCKER_IMAGE:-softy-erp:latest}"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-}"

################################################################################
# Utility Functions
################################################################################

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}✗${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1" | tee -a "$LOG_FILE"
}

log_section() {
    echo "" | tee -a "$LOG_FILE"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}" | tee -a "$LOG_FILE"
    echo -e "${BLUE}  $1${NC}" | tee -a "$LOG_FILE"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "Required command '$1' not found"
        exit 1
    fi
}

COMPOSE_STYLE=""
detect_compose() {
    if [ -n "$COMPOSE_STYLE" ]; then
        return 0
    fi

    if command -v docker-compose &> /dev/null; then
        COMPOSE_STYLE="v1"
        return 0
    fi

    if command -v docker &> /dev/null && docker compose version &> /dev/null; then
        COMPOSE_STYLE="v2"
        return 0
    fi

    log_error "Docker Compose not found. Install docker-compose or Docker Compose plugin."
    exit 1
}

compose() {
    detect_compose

    if [ "$COMPOSE_STYLE" = "v2" ]; then
        docker compose "$@"
        return $?
    fi

    docker-compose "$@"
}

prompt_continue() {
    read -p "$(echo -e ${YELLOW}$1 [y/N]${NC} )" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Deployment cancelled by user"
        exit 0
    fi
}

generate_random_secret() {
    if command -v openssl &> /dev/null; then
        openssl rand -base64 32
    else
        # Fallback for systems without openssl
        cat /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | fold -w 43 | head -n 1
    fi
}

################################################################################
# Environment Configuration Wizard
################################################################################

env_wizard() {
    log_section ".ENV CONFIGURATION WIZARD"
    
    if [ -f "${BACKEND_DIR}/.env" ]; then
        log_warning ".env file already exists at: ${BACKEND_DIR}/.env"
        read -p "$(echo -e ${YELLOW}Do you want to reconfigure? [y/N]${NC} )" -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "Using existing .env file"
            return 0
        fi
        cp "${BACKEND_DIR}/.env" "${BACKEND_DIR}/.env.backup.$(date +%Y%m%d-%H%M%S)"
        log "Backed up existing .env file"
    fi
    
    if [ ! -f "${BACKEND_DIR}/.env.example" ]; then
        log_error ".env.example file not found. Cannot proceed with wizard."
        exit 1
    fi
    
    # Copy from example
    cp "${BACKEND_DIR}/.env.example" "${BACKEND_DIR}/.env"
    
    log "This wizard will guide you through configuring ALL environment variables."
    log "Press Enter to keep default values shown in [brackets]"
    log "Leave blank to skip optional values"
    echo ""
    
    # 1. Application Environment
    log_section "1. Application Settings"
    
    read -p "Node Environment [production]: " NODE_ENV
    NODE_ENV=${NODE_ENV:-production}
    sed -i.bak "s|^NODE_ENV=.*|NODE_ENV=${NODE_ENV}|" "${BACKEND_DIR}/.env"
    
    read -p "Application Port [3000]: " PORT
    PORT=${PORT:-3000}
    sed -i.bak "s|^PORT=.*|PORT=${PORT}|" "${BACKEND_DIR}/.env"
    
    read -p "Application Name [softY ERP]: " APP_NAME
    APP_NAME=${APP_NAME:-softY ERP}
    sed -i.bak "s|^APP_NAME=.*|APP_NAME=\"${APP_NAME}\"|" "${BACKEND_DIR}/.env"
    
    read -p "Company Name [softY]: " COMPANY_NAME
    COMPANY_NAME=${COMPANY_NAME:-softY}
    sed -i.bak "s|^COMPANY_NAME=.*|COMPANY_NAME=\"${COMPANY_NAME}\"|" "${BACKEND_DIR}/.env"
    
    read -p "Company URL [https://erp.soft-y.org]: " COMPANY_URL
    COMPANY_URL=${COMPANY_URL:-https://erp.soft-y.org}
    sed -i.bak "s|^COMPANY_URL=.*|COMPANY_URL=\"${COMPANY_URL}\"|" "${BACKEND_DIR}/.env"
    
    # 2. Reverse Proxy / Ingress
    read -p "Trust Proxy (behind reverse proxy/load balancer)? [false]: " TRUST_PROXY
    TRUST_PROXY=${TRUST_PROXY:-false}
    sed -i.bak "s|^TRUST_PROXY=.*|TRUST_PROXY=${TRUST_PROXY}|" "${BACKEND_DIR}/.env"
    
    # 3. Database Configuration
    log_section "2. Database Configuration (PostgreSQL)"
    
    read -p "Database Host [localhost]: " DB_HOST
    DB_HOST=${DB_HOST:-localhost}
    sed -i.bak "s|^DB_HOST=.*|DB_HOST=${DB_HOST}|" "${BACKEND_DIR}/.env"
    
    read -p "Database Port [5434]: " DB_PORT
    DB_PORT=${DB_PORT:-5434}
    sed -i.bak "s|^DB_PORT=.*|DB_PORT=${DB_PORT}|" "${BACKEND_DIR}/.env"
    
    read -p "Database Username [softy]: " DB_USERNAME
    DB_USERNAME=${DB_USERNAME:-softy}
    sed -i.bak "s|^DB_USERNAME=.*|DB_USERNAME=${DB_USERNAME}|" "${BACKEND_DIR}/.env"
    
    read -sp "Database Password: " DB_PASSWORD
    echo
    sed -i.bak "s|^DB_PASSWORD=.*|DB_PASSWORD=${DB_PASSWORD}|" "${BACKEND_DIR}/.env"
    
    read -p "Database Name [softy]: " DB_DATABASE
    DB_DATABASE=${DB_DATABASE:-softy}
    sed -i.bak "s|^DB_DATABASE=.*|DB_DATABASE=${DB_DATABASE}|" "${BACKEND_DIR}/.env"
    
    # Set DB_SYNCHRONIZE based on environment
    if [ "$NODE_ENV" = "production" ]; then
        sed -i.bak "s|^DB_SYNCHRONIZE=.*|DB_SYNCHRONIZE=false|" "${BACKEND_DIR}/.env"
        log "Set DB_SYNCHRONIZE=false for production"
    else
        read -p "Enable DB Synchronize (auto-create tables)? [true]: " DB_SYNCHRONIZE
        DB_SYNCHRONIZE=${DB_SYNCHRONIZE:-true}
        sed -i.bak "s|^DB_SYNCHRONIZE=.*|DB_SYNCHRONIZE=${DB_SYNCHRONIZE}|" "${BACKEND_DIR}/.env"
    fi
    
    read -p "Enable Database Logging? [true]: " DB_LOGGING
    DB_LOGGING=${DB_LOGGING:-true}
    sed -i.bak "s|^DB_LOGGING=.*|DB_LOGGING=${DB_LOGGING}|" "${BACKEND_DIR}/.env"
    
    # Database Connection Pool
    log_section "3. Database Connection Pool Settings"
    
    read -p "DB Pool Size [20]: " DB_POOL_SIZE
    DB_POOL_SIZE=${DB_POOL_SIZE:-20}
    sed -i.bak "s|^DB_POOL_SIZE=.*|DB_POOL_SIZE=${DB_POOL_SIZE}|" "${BACKEND_DIR}/.env"
    
    read -p "DB Connection Timeout (ms) [30000]: " DB_CONNECTION_TIMEOUT
    DB_CONNECTION_TIMEOUT=${DB_CONNECTION_TIMEOUT:-30000}
    sed -i.bak "s|^DB_CONNECTION_TIMEOUT=.*|DB_CONNECTION_TIMEOUT=${DB_CONNECTION_TIMEOUT}|" "${BACKEND_DIR}/.env"
    
    read -p "DB Idle Timeout (ms) [600000]: " DB_IDLE_TIMEOUT
    DB_IDLE_TIMEOUT=${DB_IDLE_TIMEOUT:-600000}
    sed -i.bak "s|^DB_IDLE_TIMEOUT=.*|DB_IDLE_TIMEOUT=${DB_IDLE_TIMEOUT}|" "${BACKEND_DIR}/.env"
    
    read -p "DB Statement Timeout (ms) [60000]: " DB_STATEMENT_TIMEOUT
    DB_STATEMENT_TIMEOUT=${DB_STATEMENT_TIMEOUT:-60000}
    sed -i.bak "s|^DB_STATEMENT_TIMEOUT=.*|DB_STATEMENT_TIMEOUT=${DB_STATEMENT_TIMEOUT}|" "${BACKEND_DIR}/.env"
    
    # Database Read Replicas (Optional)
    read -p "Configure DB Read Replicas? [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "DB Replica Hosts (comma-separated): " DB_REPLICA_HOSTS
        if [ -n "$DB_REPLICA_HOSTS" ]; then
            sed -i.bak "s|^# DB_REPLICA_HOSTS=|DB_REPLICA_HOSTS=${DB_REPLICA_HOSTS}|" "${BACKEND_DIR}/.env"
            
            read -p "DB Replica Port [5432]: " DB_REPLICA_PORT
            DB_REPLICA_PORT=${DB_REPLICA_PORT:-5432}
            sed -i.bak "s|^# DB_REPLICA_PORT=.*|DB_REPLICA_PORT=${DB_REPLICA_PORT}|" "${BACKEND_DIR}/.env"
            
            read -p "DB Replica Username: " DB_REPLICA_USERNAME
            sed -i.bak "s|^# DB_REPLICA_USERNAME=|DB_REPLICA_USERNAME=${DB_REPLICA_USERNAME}|" "${BACKEND_DIR}/.env"
            
            read -sp "DB Replica Password: " DB_REPLICA_PASSWORD
            echo
            sed -i.bak "s|^# DB_REPLICA_PASSWORD=|DB_REPLICA_PASSWORD=${DB_REPLICA_PASSWORD}|" "${BACKEND_DIR}/.env"
        fi
    fi
    
    # 4. Authentication & Session Security
    log_section "4. Authentication & JWT Configuration"
    
    read -p "JWT Allowed Algorithms [HS256]: " JWT_ALLOWED_ALGORITHMS
    JWT_ALLOWED_ALGORITHMS=${JWT_ALLOWED_ALGORITHMS:-HS256}
    sed -i.bak "s|^JWT_ALLOWED_ALGORITHMS=.*|JWT_ALLOWED_ALGORITHMS=${JWT_ALLOWED_ALGORITHMS}|" "${BACKEND_DIR}/.env"
    
    log "Generating JWT secret (for HS256)..."
    JWT_SECRET=$(generate_random_secret)
    sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" "${BACKEND_DIR}/.env"
    log_success "JWT secret generated: ${JWT_SECRET}"
    
    # Check if RS256 is configured
    if [[ "$JWT_ALLOWED_ALGORITHMS" == *"RS256"* ]]; then
        log_warning "RS256 requires a public key. Please add JWT_PUBLIC_KEY to .env manually."
        read -p "Press Enter to continue..."
    fi
    
    log "Generating cursor secret..."
    CURSOR_SECRET=$(generate_random_secret)
    sed -i.bak "s|^CURSOR_SECRET=.*|CURSOR_SECRET=${CURSOR_SECRET}|" "${BACKEND_DIR}/.env"
    log_success "Cursor secret generated"
    
    read -p "JWT Access Token Expiration (seconds) [900]: " JWT_ACCESS_EXPIRES_SECONDS
    JWT_ACCESS_EXPIRES_SECONDS=${JWT_ACCESS_EXPIRES_SECONDS:-900}
    sed -i.bak "s|^JWT_ACCESS_EXPIRES_SECONDS=.*|JWT_ACCESS_EXPIRES_SECONDS=${JWT_ACCESS_EXPIRES_SECONDS}|" "${BACKEND_DIR}/.env"
    
    read -p "JWT Refresh Token Expiration (days) [7]: " JWT_REFRESH_EXPIRES_DAYS
    JWT_REFRESH_EXPIRES_DAYS=${JWT_REFRESH_EXPIRES_DAYS:-7}
    sed -i.bak "s|^JWT_REFRESH_EXPIRES_DAYS=.*|JWT_REFRESH_EXPIRES_DAYS=${JWT_REFRESH_EXPIRES_DAYS}|" "${BACKEND_DIR}/.env"
    
    # 5. Security Hardening - Account Lockout
    log_section "5. Security Hardening - Account Lockout"
    
    read -p "Lockout Max Attempts [5]: " LOCKOUT_MAX_ATTEMPTS
    LOCKOUT_MAX_ATTEMPTS=${LOCKOUT_MAX_ATTEMPTS:-5}
    sed -i.bak "s|^LOCKOUT_MAX_ATTEMPTS=.*|LOCKOUT_MAX_ATTEMPTS=${LOCKOUT_MAX_ATTEMPTS}|" "${BACKEND_DIR}/.env"
    
    read -p "Lockout Duration (seconds) [1800]: " LOCKOUT_DURATION_SECONDS
    LOCKOUT_DURATION_SECONDS=${LOCKOUT_DURATION_SECONDS:-1800}
    sed -i.bak "s|^LOCKOUT_DURATION_SECONDS=.*|LOCKOUT_DURATION_SECONDS=${LOCKOUT_DURATION_SECONDS}|" "${BACKEND_DIR}/.env"
    
    read -p "Lockout Window (seconds) [900]: " LOCKOUT_WINDOW_SECONDS
    LOCKOUT_WINDOW_SECONDS=${LOCKOUT_WINDOW_SECONDS:-900}
    sed -i.bak "s|^LOCKOUT_WINDOW_SECONDS=.*|LOCKOUT_WINDOW_SECONDS=${LOCKOUT_WINDOW_SECONDS}|" "${BACKEND_DIR}/.env"
    
    # 6. Security Hardening - MFA
    read -p "MFA Required Roles (comma-separated) [ADMIN]: " MFA_REQUIRED_ROLES
    MFA_REQUIRED_ROLES=${MFA_REQUIRED_ROLES:-ADMIN}
    sed -i.bak "s|^MFA_REQUIRED_ROLES=.*|MFA_REQUIRED_ROLES=${MFA_REQUIRED_ROLES}|" "${BACKEND_DIR}/.env"
    
    # 7. CORS
    read -p "CORS Origins (comma-separated) [http://localhost:3000,http://localhost:5173]: " CORS_ORIGINS
    CORS_ORIGINS=${CORS_ORIGINS:-http://localhost:3000,http://localhost:5173}
    sed -i.bak "s|^CORS_ORIGINS=.*|CORS_ORIGINS=${CORS_ORIGINS}|" "${BACKEND_DIR}/.env"
    
    # 8. Object Storage (MinIO / S3)
    log_section "6. Object Storage (MinIO/S3)"
    
    read -p "MinIO Endpoint [http://localhost:9000]: " MINIO_ENDPOINT
    MINIO_ENDPOINT=${MINIO_ENDPOINT:-http://localhost:9000}
    sed -i.bak "s|^MINIO_ENDPOINT=.*|MINIO_ENDPOINT=${MINIO_ENDPOINT}|" "${BACKEND_DIR}/.env"
    
    read -p "MinIO Bucket [softy-erp]: " MINIO_BUCKET
    MINIO_BUCKET=${MINIO_BUCKET:-softy-erp}
    sed -i.bak "s|^MINIO_BUCKET=.*|MINIO_BUCKET=${MINIO_BUCKET}|" "${BACKEND_DIR}/.env"
    
    read -p "MinIO Region [us-east-1]: " MINIO_REGION
    MINIO_REGION=${MINIO_REGION:-us-east-1}
    sed -i.bak "s|^MINIO_REGION=.*|MINIO_REGION=${MINIO_REGION}|" "${BACKEND_DIR}/.env"
    
    read -p "MinIO Access Key [minioadmin]: " MINIO_ACCESS_KEY
    MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY:-minioadmin}
    sed -i.bak "s|^MINIO_ACCESS_KEY=.*|MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}|" "${BACKEND_DIR}/.env"
    
    read -sp "MinIO Secret Key [minioadmin]: " MINIO_SECRET_KEY
    MINIO_SECRET_KEY=${MINIO_SECRET_KEY:-minioadmin}
    echo
    sed -i.bak "s|^MINIO_SECRET_KEY=.*|MINIO_SECRET_KEY=${MINIO_SECRET_KEY}|" "${BACKEND_DIR}/.env"
    
    read -p "MinIO Public URL [http://localhost:9000]: " MINIO_PUBLIC_URL
    MINIO_PUBLIC_URL=${MINIO_PUBLIC_URL:-http://localhost:9000}
    sed -i.bak "s|^MINIO_PUBLIC_URL=.*|MINIO_PUBLIC_URL=${MINIO_PUBLIC_URL}|" "${BACKEND_DIR}/.env"
    
    # 9. Email Service (SMTP)
    log_section "7. Email Service (SMTP)"
    
    read -p "SMTP Host [smtp.erp.soft-y.org]: " MAIL_HOST
    MAIL_HOST=${MAIL_HOST:-smtp.erp.soft-y.org}
    sed -i.bak "s|^MAIL_HOST=.*|MAIL_HOST=${MAIL_HOST}|" "${BACKEND_DIR}/.env"
    
    read -p "SMTP Port [587]: " MAIL_PORT
    MAIL_PORT=${MAIL_PORT:-587}
    sed -i.bak "s|^MAIL_PORT=.*|MAIL_PORT=${MAIL_PORT}|" "${BACKEND_DIR}/.env"
    
    read -p "SMTP Username [noreply@erp.soft-y.org]: " MAIL_USER
    MAIL_USER=${MAIL_USER:-noreply@erp.soft-y.org}
    sed -i.bak "s|^MAIL_USER=.*|MAIL_USER=${MAIL_USER}|" "${BACKEND_DIR}/.env"
    
    read -sp "SMTP Password: " MAIL_PASSWORD
    echo
    sed -i.bak "s|^MAIL_PASSWORD=.*|MAIL_PASSWORD=${MAIL_PASSWORD}|" "${BACKEND_DIR}/.env"
    
    read -p "From Address [noreply@erp.soft-y.org]: " MAIL_FROM_ADDRESS
    MAIL_FROM_ADDRESS=${MAIL_FROM_ADDRESS:-noreply@erp.soft-y.org}
    sed -i.bak "s|^MAIL_FROM_ADDRESS=.*|MAIL_FROM_ADDRESS=\"${MAIL_FROM_ADDRESS}\"|" "${BACKEND_DIR}/.env"
    
    read -p "From Name [Softy ERP]: " MAIL_FROM_NAME
    MAIL_FROM_NAME=${MAIL_FROM_NAME:-Softy ERP}
    sed -i.bak "s|^MAIL_FROM_NAME=.*|MAIL_FROM_NAME=\"${MAIL_FROM_NAME}\"|" "${BACKEND_DIR}/.env"
    
    MAIL_FROM="\"${MAIL_FROM_NAME}\" <${MAIL_FROM_ADDRESS}>"
    sed -i.bak "s|^MAIL_FROM=.*|MAIL_FROM=\"${MAIL_FROM}\"|" "${BACKEND_DIR}/.env"
    
    # 10. Telemetry & Observability
    log_section "8. Telemetry & Observability"
    
    read -p "Enable OpenTelemetry? [true]: " OTEL_ENABLED
    OTEL_ENABLED=${OTEL_ENABLED:-true}
    sed -i.bak "s|^OTEL_ENABLED=.*|OTEL_ENABLED=${OTEL_ENABLED}|" "${BACKEND_DIR}/.env"
    
    read -p "Zipkin Endpoint [http://localhost:9411/api/v2/spans]: " ZIPKIN_ENDPOINT
    ZIPKIN_ENDPOINT=${ZIPKIN_ENDPOINT:-http://localhost:9411/api/v2/spans}
    sed -i.bak "s|^ZIPKIN_ENDPOINT=.*|ZIPKIN_ENDPOINT=${ZIPKIN_ENDPOINT}|" "${BACKEND_DIR}/.env"
    
    read -p "Sentry DSN (leave blank to skip): " SENTRY_DSN
    if [ -n "$SENTRY_DSN" ]; then
        sed -i.bak "s|^SENTRY_DSN=.*|SENTRY_DSN=${SENTRY_DSN}|" "${BACKEND_DIR}/.env"
    fi
    
    # Grafana Loki (Optional)
    read -p "Configure Grafana Loki? [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Loki Host [http://localhost:3100]: " LOKI_HOST
        LOKI_HOST=${LOKI_HOST:-http://localhost:3100}
        sed -i.bak "s|^# LOKI_HOST=.*|LOKI_HOST=${LOKI_HOST}|" "${BACKEND_DIR}/.env"
    fi
    
    # Prometheus Metrics Protection
    if [ "$NODE_ENV" = "production" ]; then
        log "Generating metrics token for production..."
        METRICS_TOKEN=$(generate_random_secret)
        sed -i.bak "s|^METRICS_TOKEN=.*|METRICS_TOKEN=${METRICS_TOKEN}|" "${BACKEND_DIR}/.env"
        log_success "Metrics token generated: ${METRICS_TOKEN}"
        log_warning "Save this token to access /api/v1/metrics endpoint"
    else
        read -p "Set Metrics Token (leave blank for no protection): " METRICS_TOKEN
        if [ -n "$METRICS_TOKEN" ]; then
            sed -i.bak "s|^METRICS_TOKEN=.*|METRICS_TOKEN=${METRICS_TOKEN}|" "${BACKEND_DIR}/.env"
        fi
    fi
    
    # 11. Performance & Caching
    log_section "9. Performance & Caching (Redis)"
    
    read -p "Redis URL [redis://localhost:6379]: " REDIS_URL
    REDIS_URL=${REDIS_URL:-redis://localhost:6379}
    sed -i.bak "s|^REDIS_URL=.*|REDIS_URL=${REDIS_URL}|" "${BACKEND_DIR}/.env"
    
    # 12. Maintenance & Backups
    read -p "Upload to MinIO? [true]: " UPLOAD_TO_MINIO
    UPLOAD_TO_MINIO=${UPLOAD_TO_MINIO:-true}
    sed -i.bak "s|^UPLOAD_TO_MINIO=.*|UPLOAD_TO_MINIO=${UPLOAD_TO_MINIO}|" "${BACKEND_DIR}/.env"
    
    # 13. Initial Seeding
    log_section "10. Initial Seeding Configuration"
    
    read -p "Configure seed data? [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -sp "Seed Admin Password: " SEED_ADMIN_PASSWORD
        echo
        sed -i.bak "s|^SEED_ADMIN_PASSWORD=.*|SEED_ADMIN_PASSWORD=${SEED_ADMIN_PASSWORD}|" "${BACKEND_DIR}/.env"
        
        read -sp "Seed Staff Password: " SEED_STAFF_PASSWORD
        echo
        sed -i.bak "s|^SEED_STAFF_PASSWORD=.*|SEED_STAFF_PASSWORD=${SEED_STAFF_PASSWORD}|" "${BACKEND_DIR}/.env"
        
        read -sp "Seed Ops Password: " SEED_OPS_PASSWORD
        echo
        sed -i.bak "s|^SEED_OPS_PASSWORD=.*|SEED_OPS_PASSWORD=${SEED_OPS_PASSWORD}|" "${BACKEND_DIR}/.env"
        
        read -p "Seed Tenant Name [Default Organization]: " SEED_TENANT_NAME
        SEED_TENANT_NAME=${SEED_TENANT_NAME:-Default Organization}
        sed -i.bak "s|^SEED_TENANT_NAME=.*|SEED_TENANT_NAME=\"${SEED_TENANT_NAME}\"|" "${BACKEND_DIR}/.env"
        
        read -p "Seed Tenant Slug [default-org]: " SEED_TENANT_SLUG
        SEED_TENANT_SLUG=${SEED_TENANT_SLUG:-default-org}
        sed -i.bak "s|^SEED_TENANT_SLUG=.*|SEED_TENANT_SLUG=\"${SEED_TENANT_SLUG}\"|" "${BACKEND_DIR}/.env"
        
        read -p "Seed Email Domain [soft-y.org]: " SEED_EMAIL_DOMAIN
        SEED_EMAIL_DOMAIN=${SEED_EMAIL_DOMAIN:-soft-y.org}
        sed -i.bak "s|^SEED_EMAIL_DOMAIN=.*|SEED_EMAIL_DOMAIN=\"${SEED_EMAIL_DOMAIN}\"|" "${BACKEND_DIR}/.env"
    fi
    
    # 14. Booking Configuration
    read -p "Max Tasks Per Booking [500]: " MAX_TASKS_PER_BOOKING
    MAX_TASKS_PER_BOOKING=${MAX_TASKS_PER_BOOKING:-500}
    sed -i.bak "s|^MAX_TASKS_PER_BOOKING=.*|MAX_TASKS_PER_BOOKING=${MAX_TASKS_PER_BOOKING}|" "${BACKEND_DIR}/.env"
    
    # 15. HashiCorp Vault (Optional)
    log_section "11. HashiCorp Vault (Optional Secret Management)"
    
    read -p "Enable HashiCorp Vault? [false]: " VAULT_ENABLED
    VAULT_ENABLED=${VAULT_ENABLED:-false}
    sed -i.bak "s|^VAULT_ENABLED=.*|VAULT_ENABLED=${VAULT_ENABLED}|" "${BACKEND_DIR}/.env"
    
    if [ "$VAULT_ENABLED" = "true" ]; then
        read -p "Vault Address [http://localhost:8200]: " VAULT_ADDR
        VAULT_ADDR=${VAULT_ADDR:-http://localhost:8200}
        sed -i.bak "s|^VAULT_ADDR=.*|VAULT_ADDR=${VAULT_ADDR}|" "${BACKEND_DIR}/.env"
        
        read -p "Vault Token: " VAULT_TOKEN
        sed -i.bak "s|^VAULT_TOKEN=.*|VAULT_TOKEN=${VAULT_TOKEN}|" "${BACKEND_DIR}/.env"
        
        read -p "Vault Role ID: " VAULT_ROLE_ID
        sed -i.bak "s|^VAULT_ROLE_ID=.*|VAULT_ROLE_ID=${VAULT_ROLE_ID}|" "${BACKEND_DIR}/.env"
        
        read -p "Vault Secret ID: " VAULT_SECRET_ID
        sed -i.bak "s|^VAULT_SECRET_ID=.*|VAULT_SECRET_ID=${VAULT_SECRET_ID}|" "${BACKEND_DIR}/.env"
        
        read -p "Vault Secret Path [secret/data/softy-erp]: " VAULT_SECRET_PATH
        VAULT_SECRET_PATH=${VAULT_SECRET_PATH:-secret/data/softy-erp}
        sed -i.bak "s|^VAULT_SECRET_PATH=.*|VAULT_SECRET_PATH=${VAULT_SECRET_PATH}|" "${BACKEND_DIR}/.env"
    fi
    
    # 16. Testing Utilities
    log_section "12. Testing Utilities (Development Only)"
    
    if [ "$NODE_ENV" != "production" ]; then
        read -p "Set test utilities? [y/N]: " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            read -p "Test Error Key [some-random-key-for-errors]: " TEST_ERROR_KEY
            TEST_ERROR_KEY=${TEST_ERROR_KEY:-some-random-key-for-errors}
            sed -i.bak "s|^TEST_ERROR_KEY=.*|TEST_ERROR_KEY=${TEST_ERROR_KEY}|" "${BACKEND_DIR}/.env"
            
            read -p "Test Mock Password [Test@Mock#Password!2024]: " TEST_MOCK_PASSWORD
            TEST_MOCK_PASSWORD=${TEST_MOCK_PASSWORD:-Test@Mock#Password!2024}
            sed -i.bak "s|^TEST_MOCK_PASSWORD=.*|TEST_MOCK_PASSWORD=\"${TEST_MOCK_PASSWORD}\"|" "${BACKEND_DIR}/.env"
            
            read -p "Test Mock Password Wrong [Wrong@Mock#Password!2024]: " TEST_MOCK_PASSWORD_WRONG
            TEST_MOCK_PASSWORD_WRONG=${TEST_MOCK_PASSWORD_WRONG:-Wrong@Mock#Password!2024}
            sed -i.bak "s|^TEST_MOCK_PASSWORD_WRONG=.*|TEST_MOCK_PASSWORD_WRONG=\"${TEST_MOCK_PASSWORD_WRONG}\"|" "${BACKEND_DIR}/.env"
        fi
    fi
    
    # 17. Stripe Billing (Optional)
    log_section "13. Stripe Billing (Optional)"
    
    read -p "Configure Stripe? [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Stripe Secret Key: " STRIPE_SECRET_KEY
        sed -i.bak "s|^STRIPE_SECRET_KEY=.*|STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}|" "${BACKEND_DIR}/.env"
        
        read -p "Stripe Webhook Secret: " STRIPE_WEBHOOK_SECRET
        sed -i.bak "s|^STRIPE_WEBHOOK_SECRET=.*|STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}|" "${BACKEND_DIR}/.env"
        
        read -p "Stripe Publishable Key: " STRIPE_PUBLISHABLE_KEY
        sed -i.bak "s|^STRIPE_PUBLISHABLE_KEY=.*|STRIPE_PUBLISHABLE_KEY=${STRIPE_PUBLISHABLE_KEY}|" "${BACKEND_DIR}/.env"
    fi
    
    # Clean up backup files
    rm -f "${BACKEND_DIR}/.env.bak"
    
    log_success ".env file created successfully at: ${BACKEND_DIR}/.env"
    log_warning "Review the file and adjust any additional settings as needed"
    echo ""
    
    # Summary
    log_section "Configuration Summary"
    log "Environment: ${NODE_ENV}"
    log "Port: ${PORT}"
    log "Database: ${DB_USERNAME}@${DB_HOST}:${DB_PORT}/${DB_DATABASE}"
    log "Redis: ${REDIS_URL}"
    log "MinIO: ${MINIO_ENDPOINT}"
    log "SMTP: ${MAIL_HOST}:${MAIL_PORT}"
    echo ""
}

################################################################################
# Pre-Deployment Checks
################################################################################

pre_deployment_checks() {
    log_section "PRE-DEPLOYMENT CHECKS"
    
    # Check required commands
    log "Checking required commands..."
    check_command "node"
    check_command "npm"
    check_command "git"
    
    # Check Node.js version
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 20 ]; then
        log_error "Node.js version 20 or higher is required (current: $(node -v))"
        exit 1
    fi
    log_success "Node.js version: $(node -v)"
    
    # Check if backend directory exists
    if [ ! -d "$BACKEND_DIR" ]; then
        log_error "Backend directory not found: $BACKEND_DIR"
        exit 1
    fi
    
    # Check for .env file - run wizard if missing
    if [ ! -f "$BACKEND_DIR/.env" ]; then
        log_warning "Backend .env file not found."
        read -p "$(echo -e ${YELLOW}Would you like to run the configuration wizard? [Y/n]${NC} )" -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            env_wizard
        else
            log_warning "Continuing without .env file"
            prompt_continue "Continue without .env file?"
        fi
    fi
    
    log_success "Pre-deployment checks passed"
}

################################################################################
# Backup Database
################################################################################

backup_database() {
    if [ "$BACKUP_DB" = "true" ]; then
        log_section "DATABASE BACKUP"
        
        cd "$BACKEND_DIR"
        
        if [ -f "./scripts/backup.sh" ]; then
            log "Running database backup..."
            bash ./scripts/backup.sh || {
                log_warning "Database backup failed (continuing anyway)"
            }
            log_success "Database backup completed"
        else
            log_warning "Backup script not found, skipping backup"
        fi
    fi
}

################################################################################
# Backend Deployment
################################################################################

deploy_backend() {
    log_section "BACKEND DEPLOYMENT"
    
    cd "$BACKEND_DIR"
    
    # Install dependencies
    if [ "$INSTALL_DEPS" = "true" ]; then
        log "Installing backend dependencies..."
        npm ci || npm install
        log_success "Backend dependencies installed"
    fi
    
    # Run type checking
    log "Running type check..."
    npm run type-check || {
        log_error "Type checking failed"
        exit 1
    }
    log_success "Type check passed"
    
    # Run linting
    log "Running linter..."
    npm run lint || {
        log_warning "Linting found issues (continuing anyway)"
    }
    
    # Run tests
    if [ "$RUN_TESTS" = "true" ]; then
        log "Running backend tests..."
        npm test || {
            log_error "Tests failed"
            prompt_continue "Continue despite test failures?"
        }
        log_success "Backend tests passed"
    fi
    
    # Build application
    log "Building backend application..."
    npm run build || {
        log_error "Backend build failed"
        exit 1
    }
    log_success "Backend build completed"
    
    # Run database migrations
    if [ "$RUN_MIGRATIONS" = "true" ]; then
        log "Running database migrations..."
        npm run migration:run || {
            log_error "Database migration failed"
            exit 1
        }
        log_success "Database migrations completed"
    fi
    
    log_success "Backend deployment completed"
}

################################################################################
# Docker Deployment
################################################################################

deploy_docker() {
    if [ "$DEPLOYMENT_TYPE" != "docker" ]; then
        return 0
    fi
    
    log_section "DOCKER DEPLOYMENT"

    check_command "docker"
    
    cd "$BACKEND_DIR"
    
    # Build Docker image
    log "Building Docker image: $DOCKER_IMAGE"
    docker build -t "$DOCKER_IMAGE" . || {
        log_error "Docker build failed"
        exit 1
    }
    log_success "Docker image built: $DOCKER_IMAGE"
    
    # Tag and push if registry is specified
    if [ -n "$DOCKER_REGISTRY" ]; then
        FULL_IMAGE="$DOCKER_REGISTRY/$DOCKER_IMAGE"
        log "Tagging image: $FULL_IMAGE"
        docker tag "$DOCKER_IMAGE" "$FULL_IMAGE"
        
        log "Pushing image to registry..."
        docker push "$FULL_IMAGE" || {
            log_error "Docker push failed"
            exit 1
        }
        log_success "Image pushed to registry"
    fi
    
    # Run migrations in container
    if [ "$RUN_MIGRATIONS" = "true" ]; then
        log "Running migrations in Docker container..."
        DOCKER_RUN_NETWORK_ARGS=()
        DOCKER_RUN_ENV_OVERRIDES=()

        # NOTE: --network host works on Linux but not on macOS.
        # On macOS, use host.docker.internal to reach services on the host.
        if [ "$(uname -s)" = "Linux" ]; then
            DOCKER_RUN_NETWORK_ARGS+=(--network host)
        else
            DOCKER_RUN_ENV_OVERRIDES+=(-e DB_HOST=host.docker.internal)
        fi

        docker run --rm \
            --env-file .env \
            "${DOCKER_RUN_NETWORK_ARGS[@]}" \
            "${DOCKER_RUN_ENV_OVERRIDES[@]}" \
            "$DOCKER_IMAGE" \
            npm run migration:run || {
            log_warning "Migration failed (may already be applied)"
        }
    fi
    
    log_success "Docker deployment completed"
}

################################################################################
# Kubernetes Deployment
################################################################################

deploy_kubernetes() {
    if [ "$DEPLOYMENT_TYPE" != "kubernetes" ]; then
        return 0
    fi
    
    log_section "KUBERNETES DEPLOYMENT"
    
    # Check kubectl availability
    check_command "kubectl"
    
    # Set kubectl context if specified
    if [ -n "$K8S_CONTEXT" ]; then
        log "Switching to kubectl context: $K8S_CONTEXT"
        kubectl config use-context "$K8S_CONTEXT" || {
            log_error "Failed to switch context"
            exit 1
        }
    fi
    
    # Create namespace if it doesn't exist
    log "Ensuring namespace exists: $K8S_NAMESPACE"
    kubectl create namespace "$K8S_NAMESPACE" 2>/dev/null || true
    
    cd "$BACKEND_DIR/manifests"
    
    # Apply ConfigMap and Secrets first
    log "Applying ConfigMaps and Secrets..."
    if [ -f "configmap.yaml" ]; then
        kubectl apply -f configmap.yaml -n "$K8S_NAMESPACE"
    fi
    if [ -f "secrets.yaml" ]; then
        kubectl apply -f secrets.yaml -n "$K8S_NAMESPACE"
    fi
    
    # Apply deployments
    log "Deploying application..."
    kubectl apply -f deployment.yaml -n "$K8S_NAMESPACE" || {
        log_error "Deployment failed"
        exit 1
    }
    
    # Apply service and ingress
    log "Applying services and ingress..."
    if [ -f "service.yaml" ]; then
        kubectl apply -f service.yaml -n "$K8S_NAMESPACE"
    fi
    kubectl apply -f ingress.yaml -n "$K8S_NAMESPACE"
    
    # Apply HPA
    log "Configuring autoscaling..."
    kubectl apply -f hpa.yaml -n "$K8S_NAMESPACE"
    
    # Apply network policies
    log "Applying network policies..."
    kubectl apply -f networkpolicy.yaml -n "$K8S_NAMESPACE"
    
    # Apply monitoring config
    log "Configuring Prometheus monitoring..."
    kubectl apply -f prometheus-configmap.yaml -n "$K8S_NAMESPACE"
    
    # Wait for deployment
    log "Waiting for deployment to be ready..."
    kubectl rollout status deployment/softy-erp -n "$K8S_NAMESPACE" --timeout=300s || {
        log_error "Deployment failed to become ready"
        kubectl get pods -n "$K8S_NAMESPACE"
        kubectl logs -n "$K8S_NAMESPACE" -l app=softy-erp --tail=50
        exit 1
    }
    
    log_success "Kubernetes deployment completed"
    
    # Show deployment info
    log ""
    log "Deployment Information:"
    kubectl get pods -n "$K8S_NAMESPACE" -l app=softy-erp
    kubectl get svc -n "$K8S_NAMESPACE"
    kubectl get ingress -n "$K8S_NAMESPACE"
}

################################################################################
# Deploy Infrastructure (Docker Compose)
################################################################################

deploy_infrastructure() {
    if [ "$DEPLOY_INFRA" != "true" ]; then
        return 0
    fi
    
    log_section "DEPLOYING INFRASTRUCTURE"
    
    check_command "docker"
    detect_compose
    
    cd "$BACKEND_DIR"
    
    log "Starting infrastructure services (PostgreSQL, Redis, MinIO)..."
    compose up -d postgres redis minio minio-init || {
        log_error "Infrastructure deployment failed"
        exit 1
    }
    
    log "Waiting for services to be healthy..."
    sleep 10
    
    # Check service health
    compose ps
    
    log_success "Infrastructure deployed successfully"
}

################################################################################
# Deploy Monitoring Stack
################################################################################

deploy_monitoring() {
    if [ "$DEPLOY_MONITORING" != "true" ]; then
        return 0
    fi
    
    log_section "DEPLOYING MONITORING STACK"
    
    check_command "docker"
    detect_compose
    
    MONITORING_DIR="$BACKEND_DIR/docker/monitoring"
    
    if [ ! -d "$MONITORING_DIR" ]; then
        log_warning "Monitoring directory not found at: $MONITORING_DIR"
        log_warning "Skipping monitoring deployment..."
        return 0
    fi
    
    cd "$MONITORING_DIR"
    
    if [ ! -f "docker-compose.monitoring.yml" ]; then
        log_warning "Monitoring compose file not found, skipping..."
        return 0
    fi
    
    log "Starting Prometheus, Grafana, and Alertmanager..."
    compose -f docker-compose.monitoring.yml up -d || {
        log_error "Monitoring deployment failed"
        exit 1
    }
    
    log "Waiting for monitoring services to start..."
    sleep 5
    
    # Check service health
    compose -f docker-compose.monitoring.yml ps
    
    log_success "Monitoring stack deployed"
    log ""
    log "Access URLs:"
    log "  - Prometheus: http://localhost:9090"
    log "  - Grafana: http://localhost:3001 (admin/admin)"
    log "  - Alertmanager: http://localhost:9093"
}

################################################################################
# Start Service
################################################################################

start_service() {
    if [ "$START_SERVICE" != "true" ]; then
        log "Skipping service startup"
        return 0
    fi
    
    # Skip service startup for containerized deployments
    if [ "$DEPLOYMENT_TYPE" = "docker" ] || [ "$DEPLOYMENT_TYPE" = "kubernetes" ]; then
        log "Service managed by $DEPLOYMENT_TYPE, skipping bare-metal startup"
        return 0
    fi
    
    log_section "STARTING BACKEND SERVICE"
    
    cd "$BACKEND_DIR"
    
    # Check if PM2 is available
    if command -v pm2 &> /dev/null; then
        log "Starting backend with PM2..."
        pm2 delete softy-erp 2>/dev/null || true
        pm2 start npm --name "softy-erp" -- run start:prod
        pm2 save
        log_success "Backend started with PM2"
        log ""
        pm2 status
    elif command -v systemctl &> /dev/null; then
        log "Systemd detected. To run as a service:"
        log "  1. Create service file: /etc/systemd/system/softy-erp.service"
        log "  2. Run: sudo systemctl enable softy-erp"
        log "  3. Run: sudo systemctl start softy-erp"
        log ""
        log "For now, starting in foreground mode..."
        log "Run manually: cd $BACKEND_DIR && npm run start:prod"
    else
        log_warning "PM2 not found. Consider installing: npm install -g pm2"
        log "Backend ready to start. Run: cd backend && npm run start:prod"
    fi
}

################################################################################
# Post-Deployment Verification
################################################################################

post_deployment_verification() {
    log_section "POST-DEPLOYMENT VERIFICATION"
    
    if [ "$START_SERVICE" != "true" ] && [ "$DEPLOYMENT_TYPE" = "bare-metal" ]; then
        log "Service not started, skipping health checks"
        return 0
    fi
    
    sleep 5  # Give service time to start
    
    log "Checking backend health..."
    
    BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
    
    # For Kubernetes, try to get the service URL
    if [ "$DEPLOYMENT_TYPE" = "kubernetes" ]; then
        K8S_SVC=$(kubectl get svc -n "$K8S_NAMESPACE" -l app=softy-erp -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
        if [ -n "$K8S_SVC" ]; then
            log "Kubernetes service: $K8S_SVC"
            log "Use port-forward to access: kubectl port-forward -n $K8S_NAMESPACE svc/$K8S_SVC 3000:3000"
        fi
    fi
    
    for i in {1..10}; do
        if curl -f -s "${BACKEND_URL}/api/v1/health" > /dev/null 2>&1; then
            log_success "Backend health check passed"
            log ""
            log "Health Status:"
            curl -s "${BACKEND_URL}/api/v1/health" | head -n 20
            break
        else
            if [ $i -eq 10 ]; then
                log_warning "Backend health check failed after 10 attempts"
                if [ "$DEPLOYMENT_TYPE" = "kubernetes" ]; then
                    log "Check pods: kubectl get pods -n $K8S_NAMESPACE"
                    log "Check logs: kubectl logs -n $K8S_NAMESPACE -l app=softy-erp"
                elif [ "$DEPLOYMENT_TYPE" = "docker" ]; then
                    log "Check containers: docker ps"
                    log "Check logs: docker logs <container-id>"
                else
                    log "Check logs: tail -f $BACKEND_DIR/logs/app.log"
                fi
            else
                log "Waiting for backend to be ready... (attempt $i/10)"
                sleep 3
            fi
        fi
    done
}

################################################################################
# Create Admin User
################################################################################

create_admin() {
    if [ "$CREATE_ADMIN" != "true" ]; then
        return 0
    fi
    
    log_section "CREATING PLATFORM ADMIN"
    
    cd "$BACKEND_DIR"
    
    if [ -f ".platform-admin-created" ]; then
        log_warning "Platform admin already exists. Skipping..."
        return 0
    fi
    
    log "Creating platform admin user..."
    npm run platform:create-admin
    
    if [ $? -eq 0 ]; then
        touch .platform-admin-created
        log_success "Platform admin created"
    else
        log_warning "Admin creation failed or was cancelled"
    fi
}

################################################################################
# Deployment Summary
################################################################################

deployment_summary() {
    log_section "DEPLOYMENT SUMMARY"
    
    log "Deployment completed at: $(date +'%Y-%m-%d %H:%M:%S')"
    log "Deployment type: $DEPLOYMENT_TYPE"
    log "Log file: $LOG_FILE"
    echo ""
    
    log_success "Backend deployed successfully"
    
    case "$DEPLOYMENT_TYPE" in
        bare-metal)
            log "  - Backend URL: ${BACKEND_URL:-http://localhost:3000}"
            log "  - API Docs: ${BACKEND_URL:-http://localhost:3000}/api/docs"
            log "  - Health: ${BACKEND_URL:-http://localhost:3000}/api/v1/health"
            log "  - Metrics: ${BACKEND_URL:-http://localhost:3000}/api/v1/metrics"
            ;;
        docker)
            log "  - Docker Image: $DOCKER_IMAGE"
            if [ -n "$DOCKER_REGISTRY" ]; then
                log "  - Registry: $DOCKER_REGISTRY"
            fi
            log "  - Run container: docker run -d -p 3000:3000 --env-file backend/.env --name softy-erp $DOCKER_IMAGE"
            ;;
        kubernetes)
            log "  - Namespace: $K8S_NAMESPACE"
            log "  - Check pods: kubectl get pods -n $K8S_NAMESPACE"
            log "  - Check logs: kubectl logs -n $K8S_NAMESPACE -l app=softy-erp"
            log "  - Port forward: kubectl port-forward -n $K8S_NAMESPACE svc/softy-erp 3000:3000"
            ;;
    esac
    
    if [ "$DEPLOY_MONITORING" = "true" ]; then
        echo ""
        log_success "Monitoring stack deployed"
        log "  - Prometheus: http://localhost:9090"
        log "  - Grafana: http://localhost:3001 (admin/admin)"
        log "  - Alertmanager: http://localhost:9093"
    fi
    
    if [ "$DEPLOY_INFRA" = "true" ]; then
        echo ""
        log_success "Infrastructure deployed"
        log "  - PostgreSQL: localhost:5434"
        log "  - Redis: localhost:6379"
        log "  - MinIO: http://localhost:9001"
    fi
    
    echo ""
    log "Next steps:"
    
    if [ ! -f "$BACKEND_DIR/.platform-admin-created" ]; then
        log "  1. Create platform admin: cd backend && npm run platform:create-admin"
        log "     Or run deployment with: ./deploy.sh --create-admin"
    fi
    
    if [ "$DEPLOY_MONITORING" != "true" ]; then
        log "  2. Deploy monitoring: ./deploy.sh --monitoring"
    fi
    
    if [ "$DEPLOY_INFRA" != "true" ] && [ "$DEPLOYMENT_TYPE" = "bare-metal" ]; then
        log "  3. Deploy infrastructure: ./deploy.sh --infra"
    fi
    
    log "  4. Review logs:"
    case "$DEPLOYMENT_TYPE" in
        bare-metal)
            log "     tail -f backend/logs/app.log"
            if command -v pm2 &> /dev/null && [ "$START_SERVICE" = "true" ]; then
                log "     pm2 logs softy-erp"
            fi
            ;;
        docker)
            log "     docker logs <container-id>"
            ;;
        kubernetes)
            log "     kubectl logs -n $K8S_NAMESPACE -l app=softy-erp -f"
            ;;
    esac
    
    echo ""
    log_success "🚀 Backend deployment completed successfully!"
}

################################################################################
# Main Deployment Flow
################################################################################

main() {
    log_section "SOFTY ERP BACKEND DEPLOYMENT"
    log "Starting backend deployment process..."
    log "Deployment type: $DEPLOYMENT_TYPE"
    log "Migrations: $RUN_MIGRATIONS | Tests: $RUN_TESTS | Start: $START_SERVICE"
    echo ""
    
    # Confirmation prompt in production
    if [ "${ENVIRONMENT:-production}" = "production" ]; then
        prompt_continue "Deploy to PRODUCTION environment?"
    fi
    
    # Execute deployment steps based on type
    pre_deployment_checks
    
    if [ "$DEPLOY_INFRA" = "true" ]; then
        deploy_infrastructure
    fi
    
    backup_database
    
    case "$DEPLOYMENT_TYPE" in
        bare-metal)
            deploy_backend
            create_admin
            start_service
            ;;
        docker)
            deploy_backend
            deploy_docker
            ;;
        kubernetes)
            # For K8s, we need the image first
            deploy_backend
            deploy_docker
            deploy_kubernetes
            ;;
        *)
            log_error "Unknown deployment type: $DEPLOYMENT_TYPE"
            exit 1
            ;;
    esac
    
    if [ "$DEPLOY_MONITORING" = "true" ]; then
        deploy_monitoring
    fi
    
    post_deployment_verification
    deployment_summary
}

################################################################################
# Script Entry Point
################################################################################

# Handle script interruption
trap 'log_error "Deployment interrupted"; exit 130' INT TERM

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --configure)
            cd "$BACKEND_DIR"
            env_wizard
            log_success "Configuration complete!"
            exit 0
            ;;
        --docker)
            DEPLOYMENT_TYPE="docker"
            shift
            ;;
        --kubernetes|--k8s)
            DEPLOYMENT_TYPE="kubernetes"
            shift
            ;;
        --bare-metal)
            DEPLOYMENT_TYPE="bare-metal"
            shift
            ;;
        --monitoring)
            DEPLOY_MONITORING=true
            shift
            ;;
        --infra)
            DEPLOY_INFRA=true
            DEPLOY_INFRA_SET=true
            shift
            ;;
        --skip-migrations)
            RUN_MIGRATIONS=false
            shift
            ;;
        --with-tests)
            RUN_TESTS=true
            shift
            ;;
        --no-start)
            START_SERVICE=false
            shift
            ;;
        --skip-deps)
            INSTALL_DEPS=false
            shift
            ;;
        --backup)
            BACKUP_DB=true
            shift
            ;;
        --create-admin)
            CREATE_ADMIN=true
            shift
            ;;
        --namespace)
            K8S_NAMESPACE="$2"
            shift 2
            ;;
        --context)
            K8S_CONTEXT="$2"
            shift 2
            ;;
        --image)
            DOCKER_IMAGE="$2"
            shift 2
            ;;
        --registry)
            DOCKER_REGISTRY="$2"
            shift 2
            ;;
        --help|-h)
            echo "Softy ERP Backend Deployment Script"
            echo "Compatible with Linux and macOS"
            echo ""
            echo "Usage: ./deploy.sh [OPTIONS]"
            echo ""
            echo "Configuration:"
            echo "  --configure         Run interactive .env configuration wizard only"
            echo ""
            echo "Deployment Types:"
            echo "  --bare-metal        Deploy directly on server (default)"
            echo "  --docker            Build and deploy as Docker container"
            echo "  --kubernetes, --k8s Deploy to Kubernetes cluster"
            echo ""
            echo "Options:"
            echo "  --skip-migrations   Skip database migrations"
            echo "  --with-tests        Run tests before deployment"
            echo "  --no-start          Build but don't start service"
            echo "  --skip-deps         Skip dependency installation"
            echo "  --backup            Backup database before deployment"
            echo "  --create-admin      Create platform admin after deployment"
            echo "  --monitoring        Deploy monitoring stack (Prometheus/Grafana)"
            echo "  --infra             Deploy infrastructure (PostgreSQL/Redis/MinIO)"
            echo ""
            echo "Docker Options:"
            echo "  --image NAME        Docker image name (default: softy-erp:latest)"
            echo "  --registry URL      Docker registry URL for pushing image"
            echo ""
            echo "Kubernetes Options:"
            echo "  --namespace NAME    K8s namespace (default: softy-erp)"
            echo "  --context NAME      K8s context to use"
            echo ""
            echo "Environment Variables:"
            echo "  BACKEND_URL         Backend URL (default: http://localhost:3000)"
            echo "  ENVIRONMENT         Environment name (default: production)"
            echo "  K8S_NAMESPACE       Kubernetes namespace"
            echo "  K8S_CONTEXT         Kubernetes context"
            echo "  DOCKER_IMAGE        Docker image name"
            echo "  DOCKER_REGISTRY     Docker registry URL"
            echo ""
            echo "Examples:"
            echo "  # Configuration"
            echo "  ./deploy.sh --configure                  # Run .env wizard only"
            echo ""
            echo "  # Bare-metal deployment"
            echo "  ./deploy.sh                              # Standard deployment"
            echo "  ./deploy.sh --backup --create-admin      # With backup and admin"
            echo ""
            echo "  # Docker deployment"
            echo "  ./deploy.sh --docker                     # Build Docker image"
            echo "  ./deploy.sh --docker --registry gcr.io/myproject  # Build and push"
            echo ""
            echo "  # Kubernetes deployment"
            echo "  ./deploy.sh --k8s                        # Deploy to K8s"
            echo "  ./deploy.sh --k8s --namespace production # Deploy to specific namespace"
            echo "  ./deploy.sh --k8s --context prod-cluster # Use specific context"
            echo ""
            echo "  # Infrastructure"
            echo "  ./deploy.sh --infra                      # Deploy databases"
            echo "  ./deploy.sh --monitoring                 # Deploy monitoring stack"
            echo "  ./deploy.sh --infra --monitoring         # Deploy both"
            echo ""
            echo "  # Quick redeploy"
            echo "  ./deploy.sh --skip-deps --skip-migrations"
            echo ""
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Default infra behavior:
# - bare-metal: start local infrastructure by default (unless overridden)
# - docker/kubernetes: do not start local compose services by default
if [ "$DEPLOY_INFRA_SET" = "false" ]; then
    if [ "$DEPLOYMENT_TYPE" = "bare-metal" ]; then
        DEPLOY_INFRA=true
    else
        DEPLOY_INFRA=false
    fi
fi

# Run main deployment
main

exit 0
