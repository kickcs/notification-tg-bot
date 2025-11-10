#!/bin/bash

# Migration Health Check Script
# Проверяет состояние миграций и соответствие схемы БД

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to log messages
log() {
    echo -e "${BLUE}[MIGRATION-HEALTH]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✅ MIGRATION-HEALTH]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[⚠️ MIGRATION-HEALTH]${NC} $1"
}

log_error() {
    echo -e "${RED}[❌ MIGRATION-HEALTH]${NC} $1"
}

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    log_error "DATABASE_URL environment variable is not set"
    exit 1
fi

log "Starting migration health check..."

# Wait for database to be ready
log "Waiting for database to be ready..."
max_attempts=30
attempt=1

while [ $attempt -le $max_attempts ]; do
    if npx prisma db push --accept-data-loss 2>/dev/null; then
        log_success "Database is ready and accessible"
        break
    else
        log_warning "Database not ready (attempt $attempt/$max_attempts)"
        sleep 2
        attempt=$((attempt + 1))
    fi
done

if [ $attempt -gt $max_attempts ]; then
    log_error "Database is not accessible after $max_attempts attempts"
    exit 1
fi

# Check migration status
log "Checking migration status..."
if npx prisma migrate status; then
    log_success "Database schema is up to date"
else
    log_warning "Database schema needs migration"

    # Try to get details about pending migrations
    log "Getting details about pending migrations..."
    npx prisma migrate status || true

    exit 1  # Exit with error to indicate migration is needed
fi

# Verify database connection
log "Verifying database connection..."
if npx prisma db execute --stdin <<< "SELECT 1;" >/dev/null 2>&1; then
    log_success "Database connection verified"
else
    log_error "Database connection failed"
    exit 1
fi

# Check if all tables exist
log "Checking if all required tables exist..."
REQUIRED_TABLES=("User" "Schedule" "Reminder" "MessageTemplate" "Quiz" "QuizQuestion" "QuizOption" "Confirmation" "Notification")

for table in "${REQUIRED_TABLES[@]}"; do
    if npx prisma db execute --stdin <<< "SELECT 1 FROM \"$table\" LIMIT 1;" >/dev/null 2>&1; then
        log_success "Table $table exists and is accessible"
    else
        log_error "Table $table does not exist or is not accessible"
        exit 1
    fi
done

log_success "Migration health check completed successfully"
exit 0