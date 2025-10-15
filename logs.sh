#!/bin/bash

SERVICE="${1:-}"

if [ -z "$SERVICE" ]; then
    echo "📋 Логи всех сервисов:"
    docker-compose -f docker-compose.prod.yml logs -f --tail=100
elif [ "$SERVICE" = "bot" ]; then
    echo "📋 Логи бота:"
    docker-compose -f docker-compose.prod.yml logs -f --tail=100 bot
elif [ "$SERVICE" = "postgres" ] || [ "$SERVICE" = "db" ]; then
    echo "📋 Логи PostgreSQL:"
    docker-compose -f docker-compose.prod.yml logs -f --tail=100 postgres
else
    echo "❌ Неизвестный сервис: $SERVICE"
    echo ""
    echo "Использование:"
    echo "  ./logs.sh           # Все логи"
    echo "  ./logs.sh bot       # Только бот"
    echo "  ./logs.sh postgres  # Только БД"
    exit 1
fi
