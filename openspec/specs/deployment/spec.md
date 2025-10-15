# deployment Specification

## Purpose
TBD - created by archiving change add-vds-deployment. Update Purpose after archive.
## Requirements
### Requirement: System SHALL provide Docker Production Configuration
The system SHALL provide production-ready Docker конфигурацию для развертывания на VDS.

#### Scenario: Production deployment
- **WHEN** администратор запускает `docker-compose -f docker-compose.prod.yml up -d`
- **THEN** все сервисы (бот и PostgreSQL) запускаются в изолированной сети
- **AND** PostgreSQL порты не exposed наружу
- **AND** применяются resource limits (memory, CPU)
- **AND** настроена ротация логов

#### Scenario: Development vs Production
- **WHEN** разработчик использует `docker-compose.yml` для разработки
- **THEN** порты exposed для доступа с хоста
- **AND** volumes mounted для hot-reload
- **WHEN** администратор использует `docker-compose.prod.yml` для production
- **THEN** порты закрыты, оптимизированные образы, resource limits применены

### Requirement: System SHALL provide Automated Deployment Script
The system SHALL provide скрипт для автоматизированного деплоя.

#### Scenario: Initial deployment
- **WHEN** администратор запускает `./deploy.sh` на VDS
- **THEN** скрипт проверяет наличие Docker и Docker Compose
- **AND** проверяет наличие `.env` файла
- **AND** собирает Docker образы
- **AND** применяет миграции базы данных
- **AND** запускает контейнеры
- **AND** выводит статус всех сервисов

#### Scenario: Update deployment
- **WHEN** администратор запускает `./deploy.sh` после `git pull`
- **THEN** скрипт останавливает старые контейнеры
- **AND** собирает новые образы
- **AND** применяет новые миграции
- **AND** запускает обновленные контейнеры
- **AND** проверяет healthcheck

### Requirement: System SHALL support Systemd Integration
The system SHALL support автоматический запуск через systemd.

#### Scenario: Auto-start on boot
- **WHEN** VDS перезагружается
- **THEN** systemd service автоматически запускает Docker Compose
- **AND** бот начинает работу без ручного вмешательства

#### Scenario: Service management
- **WHEN** администратор выполняет `systemctl start notification-bot`
- **THEN** Docker Compose запускает все контейнеры
- **WHEN** администратор выполняет `systemctl stop notification-bot`
- **THEN** Docker Compose gracefully останавливает контейнеры
- **WHEN** администратор выполняет `systemctl status notification-bot`
- **THEN** отображается статус сервиса и последние логи

### Requirement: System SHALL provide Database Backup
The system SHALL provide механизм резервного копирования базы данных.

#### Scenario: Manual backup
- **WHEN** администратор запускает `./backup.sh`
- **THEN** создается pg_dump с timestamp в имени файла
- **AND** бэкап сохраняется в директорию `backups/`
- **AND** выводится путь к созданному бэкапу

#### Scenario: Automated backup via cron
- **WHEN** настроен cron job для `./backup.sh`
- **THEN** бэкапы создаются автоматически по расписанию
- **AND** старые бэкапы (>7 дней) автоматически удаляются

#### Scenario: Restore from backup
- **WHEN** администратор запускает `./restore.sh <backup_file>`
- **THEN** скрипт останавливает бота
- **AND** восстанавливает базу данных из указанного бэкапа
- **AND** перезапускает бота
- **AND** подтверждает успешное восстановление

### Requirement: System SHALL configure Logging Configuration
The system SHALL configure централизованное логирование с ротацией.

#### Scenario: Log rotation
- **WHEN** логи достигают 10MB
- **THEN** Docker автоматически ротирует лог файл
- **AND** сохраняет максимум 3 последних файла
- **AND** удаляет старые логи

#### Scenario: View logs
- **WHEN** администратор запускает `./logs.sh`
- **THEN** отображаются логи всех контейнеров в реальном времени
- **WHEN** администратор запускает `./logs.sh bot`
- **THEN** отображаются только логи бота

### Requirement: System SHALL provide Security Configuration
The system SHALL provide безопасное хранение секретов и изоляцию сервисов.

#### Scenario: Environment variables
- **WHEN** администратор создает `.env` файл
- **THEN** файл содержит все необходимые переменные окружения
- **AND** файл имеет права доступа 600 (только владелец)
- **AND** файл не коммитится в git (в .gitignore)

#### Scenario: Network isolation
- **WHEN** контейнеры запущены
- **THEN** бот и PostgreSQL находятся в изолированной bridge сети
- **AND** PostgreSQL доступен только боту по имени `postgres`
- **AND** PostgreSQL порт не exposed на хост

#### Scenario: Resource limits
- **WHEN** контейнеры запущены в production
- **THEN** бот ограничен 512MB памяти и 0.5 CPU
- **AND** PostgreSQL ограничен 1GB памяти и 1.0 CPU
- **AND** контейнеры не могут превысить лимиты

### Requirement: System SHALL provide Deployment Documentation
The system SHALL provide полную документацию по развертыванию.

#### Scenario: VDS requirements
- **WHEN** администратор читает `docs/DEPLOYMENT.md`
- **THEN** документация содержит минимальные требования к VDS
- **AND** указаны необходимые пакеты (Docker, Docker Compose, git)
- **AND** описан процесс подготовки сервера

#### Scenario: First-time deployment
- **WHEN** администратор следует инструкциям первичного деплоя
- **THEN** документация содержит пошаговые команды
- **AND** описано создание `.env` файла
- **AND** описана настройка systemd service
- **AND** описана настройка cron для бэкапов

#### Scenario: Update process
- **WHEN** администратор обновляет бота
- **THEN** документация описывает процесс обновления
- **AND** включает команды для git pull и rebuild
- **AND** описывает rollback процедуру

#### Scenario: Troubleshooting
- **WHEN** возникают проблемы при деплое
- **THEN** документация содержит раздел troubleshooting
- **AND** описаны частые ошибки и их решения
- **AND** указаны команды для диагностики

