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

echo "🛑 Остановка старых контейнеров..."
docker compose -f docker-compose.prod.yml down || true

echo "🏗️  Сборка Docker образов..."
docker compose -f docker-compose.prod.yml build --no-cache

echo "🚀 Запуск контейнеров..."
docker compose -f docker-compose.prod.yml up -d

echo "⏳ Ожидание запуска сервисов..."
sleep 10

echo "📊 Статус контейнеров:"
docker compose -f docker-compose.prod.yml ps

echo ""
echo "✅ Деплой завершен!"
echo ""
echo "Полезные команды:"
echo "  docker compose -f docker-compose.prod.yml logs -f     # Просмотр логов"
echo "  docker compose -f docker-compose.prod.yml ps          # Статус контейнеров"
echo "  docker compose -f docker-compose.prod.yml down        # Остановка"
echo "  docker compose -f docker-compose.prod.yml restart bot # Перезапуск бота"
