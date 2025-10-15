#!/bin/bash

set -e

if [ -z "$1" ]; then
    echo "❌ Использование: ./restore.sh <backup_file>"
    echo ""
    echo "Доступные бэкапы:"
    ls -lh ./backups/backup_*.sql 2>/dev/null || echo "  Нет бэкапов"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Файл бэкапа не найден: $BACKUP_FILE"
    exit 1
fi

echo "⚠️  ВНИМАНИЕ: Это удалит все текущие данные!"
echo "Файл бэкапа: $BACKUP_FILE"
read -p "Продолжить? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Отменено"
    exit 0
fi

source .env

echo "🛑 Остановка бота..."
docker compose -f docker-compose.prod.yml stop bot

echo "🗑️  Очистка базы данных..."
docker exec notification-bot-db-prod psql \
  -U "${POSTGRES_USER:-postgres}" \
  -d "${POSTGRES_DB:-notification_bot}" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

echo "📥 Восстановление из бэкапа..."
cat "$BACKUP_FILE" | docker exec -i notification-bot-db-prod psql \
  -U "${POSTGRES_USER:-postgres}" \
  -d "${POSTGRES_DB:-notification_bot}"

echo "🚀 Перезапуск бота..."
docker compose -f docker-compose.prod.yml start bot

echo "✅ Восстановление завершено!"
