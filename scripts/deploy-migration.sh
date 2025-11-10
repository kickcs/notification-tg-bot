#!/bin/bash

# Deploy Migration Script
# Безопасное применение миграций с автоматическим откатом при ошибках

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to log messages
log() {
    echo -e "${BLUE}[MIGRATION-DEPLOY]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✅ MIGRATION-DEPLOY]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[⚠️ MIGRATION-DEPLOY]${NC} $1"
}

log_error() {
    echo -e "${RED}[❌ MIGRATION-DEPLOY]${NC} $1"
}

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    log_error "DATABASE_URL environment variable is not set"
    exit 1
fi

# Backup before migration
log "Creating backup before migration..."
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/pre_migration_$TIMESTAMP.sql"

mkdir -p "$BACKUP_DIR"

if command -v pg_dump >/dev/null 2>&1; then
    # Extract connection details from DATABASE_URL
    # DATABASE_URL format: postgresql://user:password@host:port/database
    DB_URL=$(echo "$DATABASE_URL" | sed 's/postgresql:\/\///g')
    DB_HOST=$(echo "$DB_URL" | cut -d'@' -f2 | cut -d':' -f1)
    DB_PORT=$(echo "$DB_URL" | cut -d':' -f3 | cut -d'/' -f1)
    DB_USER=$(echo "$DB_URL" | cut -d':' -f1)
    DB_PASSWORD=$(echo "$DB_URL" | cut -d':' -f2 | cut -d'@' -f1)
    DB_NAME=$(echo "$DB_URL" | cut -d'/' -f2)

    export PGPASSWORD="$DB_PASSWORD"

    if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" > "$BACKUP_FILE" 2>/dev/null; then
        log_success "Backup created: $BACKUP_FILE"
    else
        log_warning "Could not create database backup (continuing anyway)"
    fi
else
    log_warning "pg_dump not found, skipping backup"
fi

# Check if migration is needed
log "Checking if migration is needed..."
if npx prisma migrate status | grep -q "Database is up to date"; then
    log_success "No migration needed - database is up to date"
    exit 0
fi

log "Migration is needed, proceeding with deployment..."

# Get current migration state
CURRENT_MIGRATION=$(npx prisma migrate status 2>/dev/null | grep "Current migration" || echo "Unknown")
log "Current migration state: $CURRENT_MIGRATION"

# Generate Prisma client before migration
log "Generating Prisma client..."
npx prisma generate

# Apply migration
log "Applying migration..."
MIGRATION_START_TIME=$(date +%s)

if npx prisma migrate deploy; then
    MIGRATION_END_TIME=$(date +%s)
    MIGRATION_DURATION=$((MIGRATION_END_TIME - MIGRATION_START_TIME))

    log_success "Migration applied successfully in ${MIGRATION_DURATION}s"

    # Verify migration was successful
    log "Verifying migration success..."
    # Store migration status for debugging
    MIGRATION_STATUS_OUTPUT=$(npx prisma migrate status 2>&1)

    # Check for multiple possible success patterns
    if echo "$MIGRATION_STATUS_OUTPUT" | grep -q -i -E "(Database is up to date|No pending migrations to apply|Already up to date| migrations are up to date)"; then
        log_success "Migration verification successful"

        # Test database operations
        log "Testing basic database operations..."
        if npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM _prisma_migrations;" >/dev/null 2>&1; then
            log_success "Database operations test passed"
        else
            log_warning "Database operations test failed (but migration may still be successful)"
        fi
    else
        log_error "Migration verification failed"
        log_error "Expected pattern not found in migration status output:"
        log_error "$MIGRATION_STATUS_OUTPUT"
        exit 1
    fi
else
    log_error "Migration failed"

    # Attempt rollback
    log "Attempting rollback..."

    if [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
        log "Rolling back from backup: $BACKUP_FILE"

        if psql "$DATABASE_URL" < "$BACKUP_FILE" 2>/dev/null; then
            log_success "Rollback from backup successful"
        else
            log_error "Rollback from backup failed"
            log_error "Manual intervention required - check database state"
        fi
    else
        log_warning "No backup file available for rollback"
        log_error "Manual intervention required - check database state"
    fi

    exit 1
fi

# Generate Prisma client after successful migration
log "Generating Prisma client after migration..."
npx prisma generate

log_success "Migration deployment completed successfully"
exit 0