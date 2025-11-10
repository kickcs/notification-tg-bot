#!/bin/bash

# Restore from Backup Script
# Безопасное восстановление базы данных из бэкапа

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to log messages
log() {
    echo -e "${BLUE}[RESTORE]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✅ RESTORE]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[⚠️ RESTORE]${NC} $1"
}

log_error() {
    echo -e "${RED}[❌ RESTORE]${NC} $1"
}

# Function to confirm action
confirm_action() {
    local message="$1"
    echo -e "${YELLOW}⚠️  $message${NC}"
    read -p "Are you sure you want to continue? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log "Operation cancelled by user"
        exit 0
    fi
}

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    log_error "DATABASE_URL environment variable is not set"
    exit 1
fi

# Check if backup file is provided
if [ -z "$1" ]; then
    log_error "Please provide a backup file path"
    echo ""
    echo "Usage: $0 <backup_file>"
    echo "       $0 list                    # List available backups"
    echo "       $0 latest                  # Restore from latest backup"
    echo ""
    echo "Available backups:"
    if [ -d "./backups" ]; then
        ls -la ./backups/*.sql.gz 2>/dev/null | while read -r line; do
            echo "  $line"
        done || echo "  No backup files found"
    else
        echo "  Backups directory not found"
    fi
    exit 1
fi

# List available backups
if [ "$1" = "list" ]; then
    log "Available backup files:"
    if [ -d "./backups" ]; then
        ls -lah ./backups/*.sql.gz 2>/dev/null | while read -r line; do
            echo "  $line"
        done || echo "  No backup files found"
    else
        log_warning "Backups directory not found"
    fi
    exit 0
fi

# Restore from latest backup
if [ "$1" = "latest" ]; then
    if [ ! -d "./backups" ]; then
        log_error "Backups directory not found"
        exit 1
    fi

    LATEST_BACKUP=$(ls -t ./backups/*.sql.gz 2>/dev/null | head -1)
    if [ -z "$LATEST_BACKUP" ]; then
        log_error "No backup files found"
        exit 1
    fi

    BACKUP_FILE="$LATEST_BACKUP"
    log "Using latest backup: $(basename "$BACKUP_FILE")"
else
    BACKUP_FILE="$1"
fi

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    log_error "Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Validate backup file
if [[ ! "$BACKUP_FILE" =~ \.sql\.gz$ ]]; then
    log_error "Invalid backup file format. Expected .sql.gz file"
    exit 1
fi

log "Starting restore process from backup: $(basename "$BACKUP_FILE")"

# Get current migration state for potential rollback
log "Creating emergency backup before restore..."
EMERGENCY_BACKUP="./backups/emergency_restore_$(date +%Y%m%d_%H%M%S).sql"

if command -v pg_dump >/dev/null 2>&1; then
    # Extract connection details from DATABASE_URL
    DB_URL=$(echo "$DATABASE_URL" | sed 's/postgresql:\/\///g')
    DB_HOST=$(echo "$DB_URL" | cut -d'@' -f2 | cut -d':' -f1)
    DB_PORT=$(echo "$DB_URL" | cut -d':' -f3 | cut -d'/' -f1)
    DB_USER=$(echo "$DB_URL" | cut -d':' -f1)
    DB_PASSWORD=$(echo "$DB_URL" | cut -d':' -f2 | cut -d'@' -f1)
    DB_NAME=$(echo "$DB_URL" | cut -d'/' -f2)

    export PGPASSWORD="$DB_PASSWORD"

    if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" > "$EMERGENCY_BACKUP" 2>/dev/null; then
        log_success "Emergency backup created: $EMERGENCY_BACKUP"
    else
        log_warning "Could not create emergency backup"
    fi
else
    log_warning "pg_dump not available, skipping emergency backup"
fi

# Confirm restore action
confirm_action "This will replace the current database with the backup from $(basename "$BACKUP_FILE"). This action cannot be undone."

# Stop the application if running
log "Stopping application..."
if command -v docker >/dev/null 2>&1; then
    if docker compose -f docker-compose.prod.yml ps | grep -q "bot"; then
        docker compose -f docker-compose.prod.yml stop bot || true
        log_success "Application stopped"
    else
        log "Application not running"
    fi
fi

# Extract and decompress backup if needed
TEMP_BACKUP="/tmp/restore_$(date +%s).sql"
if [[ "$BACKUP_FILE" =~ \.gz$ ]]; then
    log "Decompressing backup file..."
    if gunzip -c "$BACKUP_FILE" > "$TEMP_BACKUP"; then
        log_success "Backup file decompressed"
    else
        log_error "Failed to decompress backup file"
        exit 1
    fi
else
    cp "$BACKUP_FILE" "$TEMP_BACKUP"
fi

# Restore database
log "Restoring database from backup..."

# Extract connection details
DB_URL=$(echo "$DATABASE_URL" | sed 's/postgresql:\/\///g')
DB_HOST=$(echo "$DB_URL" | cut -d'@' -f2 | cut -d':' -f1)
DB_PORT=$(echo "$DB_URL" | cut -d':' -f3 | cut -d'/' -f1)
DB_USER=$(echo "$DB_URL" | cut -d':' -f1)
DB_PASSWORD=$(echo "$DB_URL" | cut -d':' -f2 | cut -d'@' -f1)
DB_NAME=$(echo "$DB_URL" | cut -d'/' -f2)

export PGPASSWORD="$DB_PASSWORD"

# Drop existing database and recreate
log "Dropping existing database..."
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" 2>/dev/null; then
    log_success "Existing database dropped"
else
    log_warning "Could not drop database (may not exist)"
fi

log "Creating new database..."
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DB_NAME\";" 2>/dev/null; then
    log_success "New database created"
else
    log_error "Failed to create database"
    exit 1
fi

# Restore from backup
log "Importing data from backup..."
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" < "$TEMP_BACKUP" 2>/dev/null; then
    log_success "Database restored successfully"
else
    log_error "Failed to restore database"

    # Attempt to restore from emergency backup
    if [ -f "$EMERGENCY_BACKUP" ]; then
        log_warning "Attempting to restore from emergency backup..."
        if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" < "$EMERGENCY_BACKUP" 2>/dev/null; then
            log_success "Emergency backup restored successfully"
        else
            log_error "Emergency backup restore also failed"
        fi
    fi

    exit 1
fi

# Clean up temporary files
rm -f "$TEMP_BACKUP"
unset PGPASSWORD

# Run post-restore checks
log "Running post-restore checks..."

# Check database connectivity
if npx prisma db execute --stdin <<< "SELECT 1;" >/dev/null 2>&1; then
    log_success "Database connectivity check passed"
else
    log_error "Database connectivity check failed"
    exit 1
fi

# Check if required tables exist
REQUIRED_TABLES=("User" "Schedule" "Reminder" "MessageTemplate")
missing_tables=0

for table in "${REQUIRED_TABLES[@]}"; do
    if npx prisma db execute --stdin <<< "SELECT 1 FROM \"$table\" LIMIT 1;" >/dev/null 2>&1; then
        log_success "Table $table exists"
    else
        log_error "Table $table not found"
        missing_tables=$((missing_tables + 1))
    fi
done

if [ $missing_tables -gt 0 ]; then
    log_error "Missing $missing_tables required tables"
    exit 1
fi

# Start the application
log "Starting application..."
if command -v docker >/dev/null 2>&1; then
    if docker compose -f docker-compose.prod.yml start bot 2>/dev/null; then
        log_success "Application started"

        # Wait a bit for startup
        sleep 10

        # Check if application is running
        if docker compose -f docker-compose.prod.yml ps | grep -q "Up"; then
            log_success "Application is running"
        else
            log_warning "Application may not be running properly"
        fi
    else
        log_warning "Could not start application with Docker"
    fi
fi

# Generate Prisma client
log "Generating Prisma client..."
if npx prisma generate; then
    log_success "Prisma client generated"
else
    log_warning "Failed to generate Prisma client"
fi

log_success "Restore process completed successfully"
log "Emergency backup available at: $EMERGENCY_BACKUP"

# Clean up
log "Cleaning up temporary files..."
rm -f "$TEMP_BACKUP"

log_success "Database restore completed successfully"
exit 0