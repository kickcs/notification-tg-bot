#!/bin/bash

set -e

echo "🚀 Начало деплоя Telegram бота..."

if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose не установлен"
    exit 1
fi

if [ ! -f .env ]; then
    echo "❌ Файл .env не найден"
    echo "Создайте .env файл на основе .env.production.example"
    exit 1
fi

echo "✅ Проверки пройдены"

echo "🔄 Синхронизация с origin/main..."
git fetch origin
CURRENT_COMMIT=$(git rev-parse HEAD)
ORIGIN_COMMIT=$(git rev-parse origin/main)

if [ "$CURRENT_COMMIT" != "$ORIGIN_COMMIT" ]; then
    echo "⚠️  Локальная версия отличается от origin/main"
    echo "📥 Сброс к origin/main..."
    git reset --hard origin/main
    echo "✅ Синхронизация завершена"
else
    echo "✅ Уже на актуальной версии"
fi

echo "🗂️  Подготовка к миграциям..."
# Создаем директорию для бэкапов, если она не существует
mkdir -p backups
mkdir -p scripts

# Убедимся, что скрипты миграций исполняемы
chmod +x scripts/*.sh 2>/dev/null || true

echo "🛑 Остановка старых контейнеров..."
docker compose -f docker-compose.prod.yml down || true

echo "🗑️  Удаление старых образов..."
docker images | grep notification-tg-bot | awk '{print $3}' | xargs -r docker rmi -f 2>/dev/null || true

echo "🏗️  Сборка Docker образов..."
docker compose -f docker-compose.prod.yml build --no-cache

echo "🚀 Запуск базы данных..."
# Запускаем только базу данных, чтобы выполнить миграции перед запуском приложения
docker compose -f docker-compose.prod.yml up -d postgres

echo "⏳ Ожидание готовности базы данных..."
sleep 15

echo "🔄 Проверка и применение миграций..."
# Выполняем миграции в контейнере бота без запуска приложения
docker compose -f docker-compose.prod.yml run --rm --entrypoint ./scripts/deploy-migration.sh bot || {
    echo "⚠️  Миграции не удались, но продолжаем развертывание..."
    echo "Приложение попытается применить миграции при старте"
}

echo "🚀 Запуск приложения..."
docker compose -f docker-compose.prod.yml up -d bot

echo "⏳ Ожидание запуска сервисов..."
sleep 10

echo "📊 Статус контейнеров:"
docker compose -f docker-compose.prod.yml ps

echo ""
echo "✅ Деплой завершен!"
echo "📝 Текущий коммит: $(git log --oneline -1)"
echo ""
echo "Полезные команды:"
echo "  docker compose -f docker-compose.prod.yml logs -f     # Просмотр логов"
echo "  docker compose -f docker-compose.prod.yml ps          # Статус контейнеров"
echo "  docker compose -f docker-compose.prod.yml down        # Остановка"
echo "  docker compose -f docker-compose.prod.yml restart bot # Перезапуск бота"
