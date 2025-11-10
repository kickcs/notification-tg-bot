#!/bin/bash

# Backup Before Migration Script
# Создает бэкап базы данных перед миграцией

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to log messages
log() {
    echo -e "${BLUE}[MIGRATION-BACKUP]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✅ MIGRATION-BACKUP]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[⚠️ MIGRATION-BACKUP]${NC} $1"
}

log_error() {
    echo -e "${RED}[❌ MIGRATION-BACKUP]${NC} $1"
}

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    log_error "DATABASE_URL environment variable is not set"
    exit 1
fi

# Create backup directory
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

# Generate timestamp for backup file
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/pre_migration_$TIMESTAMP.sql"
COMPRESSED_BACKUP_FILE="$BACKUP_FILE.gz"

log "Creating database backup before migration..."

# Check if pg_dump is available
if ! command -v pg_dump >/dev/null 2>&1; then
    log_error "pg_dump is not available. Please install PostgreSQL client tools."
    exit 1
fi

# Extract connection details from DATABASE_URL
# DATABASE_URL format: postgresql://user:password@host:port/database
DB_URL=$(echo "$DATABASE_URL" | sed 's/postgresql:\/\///g')
DB_HOST=$(echo "$DB_URL" | cut -d'@' -f2 | cut -d':' -f1)
DB_PORT=$(echo "$DB_URL" | cut -d':' -f3 | cut -d'/' -f1)
DB_USER=$(echo "$DB_URL" | cut -d':' -f1)
DB_PASSWORD=$(echo "$DB_URL" | cut -d':' -f2 | cut -d'@' -f1)
DB_NAME=$(echo "$DB_URL" | cut -d'/' -f2)

log "Connecting to database: $DB_HOST:$DB_PORT/$DB_NAME as $DB_USER"

# Set password for pg_dump
export PGPASSWORD="$DB_PASSWORD"

# Create backup
if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --verbose \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    --create > "$BACKUP_FILE" 2>/dev/null; then

    log_success "Database backup created: $BACKUP_FILE"

    # Compress backup
    if gzip "$BACKUP_FILE"; then
        log_success "Backup compressed: $COMPRESSED_BACKUP_FILE"

        # Get backup size
        BACKUP_SIZE=$(du -h "$COMPRESSED_BACKUP_FILE" | cut -f1)
        log_success "Backup size: $BACKUP_SIZE"

        # Clean old backups (keep last 5)
        log "Cleaning old backups..."
        cd "$BACKUP_DIR"
        ls -t pre_migration_*.sql.gz 2>/dev/null | tail -n +6 | xargs -r rm
        cd - >/dev/null

        log_success "Old backups cleaned (keeping last 5)"

        # List current backups
        log "Current backups:"
        ls -la "$BACKUP_DIR"/pre_migration_*.sql.gz 2>/dev/null || log_warning "No backup files found"

    else
        log_error "Failed to compress backup file"
        exit 1
    fi

else
    log_error "Failed to create database backup"
    exit 1
fi

# Unset password for security
unset PGPASSWORD

log_success "Backup process completed successfully"
exit 0