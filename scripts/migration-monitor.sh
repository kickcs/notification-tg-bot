#!/bin/bash

# Migration Monitor Script
# Мониторинг статуса миграций и оповещения

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to log messages
log() {
    echo -e "${BLUE}[MIGRATION-MONITOR]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✅ MIGRATION-MONITOR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[⚠️ MIGRATION-MONITOR]${NC} $1"
}

log_error() {
    echo -e "${RED}[❌ MIGRATION-MONITOR]${NC} $1"
}

# Configuration
LOG_FILE="./logs/migration-monitor.log"
ALERT_WEBHOOK_URL="${MIGRATION_ALERT_WEBHOOK:-}"
MAX_BACKUP_AGE_DAYS=7
HEALTH_CHECK_INTERVAL=300  # 5 minutes

# Create logs directory
mkdir -p logs

# Function to send alert
send_alert() {
    local message="$1"
    local severity="$2"  # info, warning, error

    # Log to file
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$severity] $message" >> "$LOG_FILE"

    # Send webhook alert if configured
    if [ -n "$ALERT_WEBHOOK_URL" ]; then
        local payload=$(cat <<EOF
{
    "text": "$message",
    "severity": "$severity",
    "timestamp": "$timestamp",
    "service": "migration-monitor"
}
EOF
)
        curl -X POST "$ALERT_WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "$payload" \
            2>/dev/null || log_warning "Failed to send alert webhook"
    fi

    # Print to console
    case "$severity" in
        "error")
            log_error "$message"
            ;;
        "warning")
            log_warning "$message"
            ;;
        *)
            log "$message"
            ;;
    esac
}

# Function to check backup health
check_backup_health() {
    log "Checking backup health..."

    local backup_count=0
    local old_backups=0

    if [ -d "./backups" ]; then
        backup_count=$(find ./backups -name "*.sql.gz" | wc -l)

        # Check for old backups
        while IFS= read -r -d '' backup_file; do
            local file_days=$(find "$backup_file" -mtime +$MAX_BACKUP_AGE_DAYS -print)
            if [ -n "$file_days" ]; then
                old_backups=$((old_backups + 1))
            fi
        done < <(find ./backups -name "*.sql.gz" -print0 2>/dev/null)

        if [ $backup_count -eq 0 ]; then
            send_alert "No backup files found" "warning"
        else
            send_alert "Found $backup_count backup files" "info"

            if [ $old_backups -gt 0 ]; then
                send_alert "Found $old_backups old backups (older than $MAX_BACKUP_AGE_DAYS days)" "warning"
            fi
        fi
    else
        send_alert "Backups directory does not exist" "warning"
    fi
}

# Function to check migration status
check_migration_status() {
    log "Checking migration status..."

    if ! command -v npx >/dev/null 2>&1; then
        send_alert "npx command not found" "error"
        return 1
    fi

    if [ -z "$DATABASE_URL" ]; then
        send_alert "DATABASE_URL not set" "error"
        return 1
    fi

    # Try to check migration status
    if npx prisma migrate status >/dev/null 2>&1; then
        send_alert "Database migrations are up to date" "info"
        return 0
    else
        local migration_output=$(npx prisma migrate status 2>&1 || echo "Status check failed")
        send_alert "Migration status check failed: $migration_output" "warning"
        return 1
    fi
}

# Function to check database connectivity
check_database_connectivity() {
    log "Checking database connectivity..."

    if [ -z "$DATABASE_URL" ]; then
        send_alert "DATABASE_URL not set" "error"
        return 1
    fi

    # Simple connectivity test
    if npx prisma db execute --stdin <<< "SELECT 1;" >/dev/null 2>&1; then
        send_alert "Database connectivity test passed" "info"
        return 0
    else
        send_alert "Database connectivity test failed" "error"
        return 1
    fi
}

# Function to check disk space
check_disk_space() {
    log "Checking disk space..."

    local usage=$(df . | awk 'NR==2 {print $5}' | sed 's/%//')

    if [ "$usage" -gt 90 ]; then
        send_alert "Disk usage is critically high: ${usage}%" "error"
    elif [ "$usage" -gt 80 ]; then
        send_alert "Disk usage is high: ${usage}%" "warning"
    else
        send_alert "Disk usage is normal: ${usage}%" "info"
    fi
}

# Function to check application logs for migration errors
check_migration_errors() {
    log "Checking for migration errors in logs..."

    if [ -f "./logs/migration-errors.log" ]; then
        local error_count=$(grep -c "ERROR" ./logs/migration-errors.log 2>/dev/null || echo "0")
        if [ "$error_count" -gt 0 ]; then
            send_alert "Found $error_count migration errors in logs" "warning"
        fi
    fi
}

# Function to generate migration report
generate_report() {
    log "Generating migration status report..."

    local report_file="./logs/migration-report-$(date +%Y%m%d_%H%M%S).txt"

    {
        echo "Migration Status Report"
        echo "======================"
        echo "Generated: $(date)"
        echo ""

        echo "Migration Status:"
        if npx prisma migrate status 2>&1; then
            echo "✅ Status: OK"
        else
            echo "❌ Status: Issues detected"
        fi
        echo ""

        echo "Database Connectivity:"
        if npx prisma db execute --stdin <<< "SELECT 1;" >/dev/null 2>&1; then
            echo "✅ Database: Connected"
        else
            echo "❌ Database: Not connected"
        fi
        echo ""

        echo "Backup Status:"
        if [ -d "./backups" ]; then
            local backup_count=$(find ./backups -name "*.sql.gz" | wc -l)
            echo "📁 Backup files: $backup_count"
            echo "📂 Latest backup: $(ls -t ./backups/*.sql.gz 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo 'None')"
        else
            echo "❌ Backup directory not found"
        fi
        echo ""

        echo "Disk Usage:"
        df -h . | tail -1
        echo ""

        echo "Recent Migration Logs:"
        if [ -f "./logs/migration-monitor.log" ]; then
            tail -10 ./logs/migration-monitor.log
        else
            echo "No log file found"
        fi

    } > "$report_file"

    send_alert "Migration report generated: $report_file" "info"
}

# Function to cleanup old logs
cleanup_logs() {
    log "Cleaning up old logs..."

    # Keep logs for 30 days
    find ./logs -name "*.log" -mtime +30 -delete 2>/dev/null || true
    find ./logs -name "migration-report-*.txt" -mtime +7 -delete 2>/dev/null || true

    send_alert "Old logs cleaned up" "info"
}

# Main monitoring function
run_health_check() {
    log "Starting migration health check..."

    local failed_checks=0

    # Run all checks
    check_database_connectivity || failed_checks=$((failed_checks + 1))
    check_migration_status || failed_checks=$((failed_checks + 1))
    check_backup_health || failed_checks=$((failed_checks + 1))
    check_disk_space || failed_checks=$((failed_checks + 1))
    check_migration_errors || failed_checks=$((failed_checks + 1))

    # Generate report
    generate_report

    # Cleanup old logs
    cleanup_logs

    # Final status
    if [ $failed_checks -eq 0 ]; then
        send_alert "All health checks passed" "info"
        return 0
    else
        send_alert "$failed_checks health checks failed" "warning"
        return 1
    fi
}

# Continuous monitoring mode
continuous_monitor() {
    log "Starting continuous monitoring (interval: ${HEALTH_CHECK_INTERVAL}s)..."

    while true; do
        run_health_check
        sleep $HEALTH_CHECK_INTERVAL
    done
}

# Main execution
case "${1:-check}" in
    "check")
        run_health_check
        ;;
    "continuous")
        continuous_monitor
        ;;
    "report")
        generate_report
        ;;
    "cleanup")
        cleanup_logs
        ;;
    *)
        echo "Usage: $0 {check|continuous|report|cleanup}"
        echo ""
        echo "Commands:"
        echo "  check       - Run one-time health check"
        echo "  continuous  - Run continuous monitoring"
        echo "  report      - Generate migration report"
        echo "  cleanup     - Clean up old logs"
        exit 1
        ;;
esac