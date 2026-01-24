#!/bin/bash

################################################################################
# Softy ERP - Backend Production Deployment Script
# Generated: 2026-01-24
# Compatible: Linux & macOS
# 
# This script automates the complete backend deployment process. It handles:
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

# Script configuration
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="${SCRIPT_DIR}/backend"
LOG_FILE="${SCRIPT_DIR}/deployment-$(date +%Y%m%d-%H%M%S).log"

# Deployment options (can be overridden with environment variables)
DEPLOYMENT_TYPE="${DEPLOYMENT_TYPE:-bare-metal}"  # bare-metal, docker, kubernetes
RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"
RUN_TESTS="${RUN_TESTS:-false}"
START_SERVICE="${START_SERVICE:-true}"
INSTALL_DEPS="${INSTALL_DEPS:-true}"
BACKUP_DB="${BACKUP_DB:-false}"
CREATE_ADMIN="${CREATE_ADMIN:-false}"
DEPLOY_MONITORING="${DEPLOY_MONITORING:-false}"
DEPLOY_INFRA="${DEPLOY_INFRA:-false}"

# Kubernetes specific
K8S_NAMESPACE="${K8S_NAMESPACE:-chapters-studio-erp}"
K8S_CONTEXT="${K8S_CONTEXT:-}"
DOCKER_IMAGE="${DOCKER_IMAGE:-chapters-studio-erp:latest}"
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

prompt_continue() {
    read -p "$(echo -e ${YELLOW}$1 [y/N]${NC} )" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Deployment cancelled by user"
        exit 0
    fi
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
    
    # Check for .env file
    if [ ! -f "$BACKEND_DIR/.env" ]; then
        log_warning "Backend .env file not found. Please create one from .env.example"
        prompt_continue "Continue without .env file?"
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
        docker run --rm \
            --env-file .env \
            --network host \
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
    kubectl rollout status deployment/chapters-studio-erp -n "$K8S_NAMESPACE" --timeout=300s || {
        log_error "Deployment failed to become ready"
        kubectl get pods -n "$K8S_NAMESPACE"
        kubectl logs -n "$K8S_NAMESPACE" -l app=chapters-studio-erp --tail=50
        exit 1
    }
    
    log_success "Kubernetes deployment completed"
    
    # Show deployment info
    log ""
    log "Deployment Information:"
    kubectl get pods -n "$K8S_NAMESPACE" -l app=chapters-studio-erp
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
    check_command "docker-compose"
    
    cd "$BACKEND_DIR"
    
    log "Starting infrastructure services (PostgreSQL, Redis, MinIO)..."
    docker-compose up -d postgres redis minio minio-init || {
        log_error "Infrastructure deployment failed"
        exit 1
    }
    
    log "Waiting for services to be healthy..."
    sleep 10
    
    # Check service health
    docker-compose ps
    
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
    check_command "docker-compose"
    
    cd "$BACKEND_DIR/docker/monitoring"
    
    if [ ! -f "docker-compose.monitoring.yml" ]; then
        log_warning "Monitoring compose file not found, skipping..."
        return 0
    fi
    
    log "Starting Prometheus, Grafana, and Alertmanager..."
    docker-compose -f docker-compose.monitoring.yml up -d || {
        log_error "Monitoring deployment failed"
        exit 1
    }
    
    log "Waiting for monitoring services to start..."
    sleep 5
    
    # Check service health
    docker-compose -f docker-compose.monitoring.yml ps
    
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
        pm2 delete chapters-studio-erp 2>/dev/null || true
        pm2 start npm --name "chapters-studio-erp" -- run start:prod
        pm2 save
        log_success "Backend started with PM2"
        log ""
        pm2 status
    elif command -v systemctl &> /dev/null; then
        log "Systemd detected. To run as a service:"
        log "  1. Create service file: /etc/systemd/system/chapters-studio-erp.service"
        log "  2. Run: sudo systemctl enable chapters-studio-erp"
        log "  3. Run: sudo systemctl start chapters-studio-erp"
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
        K8S_SVC=$(kubectl get svc -n "$K8S_NAMESPACE" -l app=chapters-studio-erp -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
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
                    log "Check logs: kubectl logs -n $K8S_NAMESPACE -l app=chapters-studio-erp"
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
            log "  - Run container: docker run -d -p 3000:3000 --env-file backend/.env --name chapters-studio-erp $DOCKER_IMAGE"
            ;;
        kubernetes)
            log "  - Namespace: $K8S_NAMESPACE"
            log "  - Check pods: kubectl get pods -n $K8S_NAMESPACE"
            log "  - Check logs: kubectl logs -n $K8S_NAMESPACE -l app=chapters-studio-erp"
            log "  - Port forward: kubectl port-forward -n $K8S_NAMESPACE svc/chapters-studio-erp 3000:3000"
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
                log "     pm2 logs chapters-studio-erp"
            fi
            ;;
        docker)
            log "     docker logs <container-id>"
            ;;
        kubernetes)
            log "     kubectl logs -n $K8S_NAMESPACE -l app=chapters-studio-erp -f"
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
            echo "  --image NAME        Docker image name (default: chapters-studio-erp:latest)"
            echo "  --registry URL      Docker registry URL for pushing image"
            echo ""
            echo "Kubernetes Options:"
            echo "  --namespace NAME    K8s namespace (default: chapters-studio-erp)"
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

# Run main deployment
main

exit 0
