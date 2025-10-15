#!/bin/bash

set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql"

mkdir -p "$BACKUP_DIR"

echo "📦 Создание бэкапа базы данных..."

source .env

docker exec notification-bot-db-prod pg_dump \
  -U "${POSTGRES_USER:-postgres}" \
  -d "${POSTGRES_DB:-notification_bot}" \
  > "$BACKUP_FILE"

if [ -f "$BACKUP_FILE" ]; then
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "✅ Бэкап создан: $BACKUP_FILE ($SIZE)"
    
    echo "🧹 Удаление старых бэкапов (>7 дней)..."
    find "$BACKUP_DIR" -name "backup_*.sql" -type f -mtime +7 -delete
    
    BACKUP_COUNT=$(find "$BACKUP_DIR" -name "backup_*.sql" -type f | wc -l)
    echo "📊 Всего бэкапов: $BACKUP_COUNT"
else
    echo "❌ Ошибка создания бэкапа"
    exit 1
fi
