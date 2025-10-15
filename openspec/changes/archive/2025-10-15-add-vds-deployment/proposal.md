# Proposal: Deployment на VDS с Docker

## Why

Необходимо развернуть Telegram бот на VDS (Virtual Dedicated Server) для production использования. Текущая конфигурация Docker требует доработки для безопасного и надежного деплоя с автоматическим запуском, логированием и управлением.

## What Changes

- Улучшить Docker конфигурацию для production
- Добавить docker-compose.prod.yml для production окружения
- Создать скрипты деплоя и управления
- Добавить healthcheck для бота
- Настроить логирование с ротацией
- Добавить .dockerignore для оптимизации образа
- Создать документацию по деплою на VDS
- Добавить systemd service для автозапуска
- Настроить backup базы данных

## Impact

- Affected specs: новая capability `deployment`
- Affected code:
  - `Dockerfile` - оптимизация для production
  - `docker-compose.yml` - разделение dev/prod
  - Новые файлы: `docker-compose.prod.yml`, `deploy.sh`, `backup.sh`
  - Новая документация: `docs/DEPLOYMENT.md`

## Benefits

- Простой и безопасный деплой одной командой
- Автоматический запуск при перезагрузке сервера
- Централизованное логирование
- Регулярные бэкапы базы данных
- Изоляция через Docker контейнеры
