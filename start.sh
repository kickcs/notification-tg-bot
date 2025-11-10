#!/bin/bash

# Smart Startup Script with Migration Support
# Умный скрипт запуска с поддержкой миграций и автоматическим откатом

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to log messages
log() {
    echo -e "${BLUE}[STARTUP]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✅ STARTUP]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[⚠️ STARTUP]${NC} $1"
}

log_error() {
    echo -e "${RED}[❌ STARTUP]${NC} $1"
}

# Configuration
MAX_MIGRATION_ATTEMPTS=3
MIGRATION_TIMEOUT=300  # 5 minutes
STARTUP_TIMEOUT=0      # No timeout - run indefinitely

log "🚀 Starting Telegram Bot with smart migration support..."

# Check if required files exist
if [ ! -f "dist/index.js" ]; then
    log_error "Application binary not found. Please run 'npm run build' first."
    exit 1
fi

if [ ! -f ".env" ]; then
    log_warning ".env file not found. Using environment variables."
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    log_error "DATABASE_URL environment variable is not set"
    exit 1
fi

# Function to wait for database
wait_for_database() {
    log "Waiting for database to be ready..."

    # Extract host and port from DATABASE_URL
    DB_URL=$(echo "$DATABASE_URL" | sed 's/postgresql:\/\///g')
    DB_HOST=$(echo "$DB_URL" | cut -d'@' -f2 | cut -d':' -f1)
    DB_PORT=$(echo "$DB_URL" | cut -d':' -f3 | cut -d'/' -f1)

    log "Waiting for database at $DB_HOST:$DB_PORT..."

    # Use wait-for-it script if available, otherwise fallback to manual checking
    if [ -f "./scripts/wait-for-it.sh" ]; then
        if ./scripts/wait-for-it.sh -h "$DB_HOST" -p "$DB_PORT" -t 60 --strict --quiet; then
            log_success "Database is ready and accessible"
            return 0
        else
            log_error "Database is not accessible after 60 seconds"
            return 1
        fi
    else
        # Fallback to manual checking
        local max_attempts=30
        local attempt=1

        while [ $attempt -le $max_attempts ]; do
            if npx prisma db execute --stdin <<< "SELECT 1;" >/dev/null 2>&1; then
                log_success "Database is ready and accessible"
                return 0
            else
                log_warning "Database not ready (attempt $attempt/$max_attempts)"
                sleep 2
                attempt=$((attempt + 1))
            fi
        done

        log_error "Database is not accessible after $max_attempts attempts"
        return 1
    fi
}

# Function to check and apply migrations
handle_migrations() {
    log "Checking migration status..."

    # Wait for database first
    if ! wait_for_database; then
        return 1
    fi

    # Check if migration is needed
    if ./scripts/migration-health.sh >/dev/null 2>&1; then
        log_success "Database schema is up to date"
        return 0
    fi

    log_warning "Database migration is needed"

    # Try to apply migrations
    local attempt=1
    while [ $attempt -le $MAX_MIGRATION_ATTEMPTS ]; do
        log "Attempting migration (attempt $attempt/$MAX_MIGRATION_ATTEMPTS)..."

        if ./scripts/deploy-migration.sh; then
            log_success "Migration completed successfully"
            return 0
        else
            log_error "Migration failed (attempt $attempt/$MAX_MIGRATION_ATTEMPTS)"

            if [ $attempt -lt $MAX_MIGRATION_ATTEMPTS ]; then
                log_warning "Waiting before retry..."
                sleep 10
                attempt=$((attempt + 1))
            fi
        fi
    done

    log_error "Migration failed after $MAX_MIGRATION_ATTEMPTS attempts"
    log_error "Please check database state and apply migrations manually"
    return 1
}

# Function to start the application
start_application() {
    log "Starting the application..."

    # Generate Prisma client before starting
    if ! npx prisma generate; then
        log_error "Failed to generate Prisma client"
        return 1
    fi

    log_success "Prisma client generated"

    # Start the application (no timeout for production)
    if [ "$STARTUP_TIMEOUT" -eq 0 ]; then
        node dist/index.js &
        local app_pid=$!
    else
        timeout $STARTUP_TIMEOUT node dist/index.js &
        local app_pid=$!
    fi

    # Wait a bit to check if application starts successfully
    sleep 5

    # Check if process is still running
    if kill -0 $app_pid 2>/dev/null; then
        log_success "Application started successfully (PID: $app_pid)"

        # Forward the process and wait for it
        wait $app_pid
        exit_code=$?

        if [ $exit_code -eq 0 ]; then
            log_success "Application exited normally"
        else
            log_error "Application exited with code $exit_code"
        fi

        return $exit_code
    else
        log_error "Application failed to start"
        return 1
    fi
}

# Main execution flow
main() {
    local start_time=$(date +%s)

    # Step 1: Handle migrations
    if ! handle_migrations; then
        log_error "Migration handling failed"
        exit 1
    fi

    # Step 2: Start application
    if ! start_application; then
        log_error "Application startup failed"
        exit 1
    fi

    local end_time=$(date +%s)
    local total_time=$((end_time - start_time))

    log_success "Startup process completed in ${total_time}s"
}

# Handle interruption gracefully
trap 'log_warning "Startup interrupted"; exit 130' INT TERM

# Execute main function
main "$@"