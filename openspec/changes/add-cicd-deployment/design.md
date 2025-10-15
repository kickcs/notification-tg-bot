# Design: CI/CD автоматический деплой

## Context

Текущий процесс деплоя требует ручного подключения к VDS и выполнения команд. Необходимо автоматизировать этот процесс для ускорения разработки и уменьшения ошибок.

Текущая инфраструктура:
- VDS сервер: 188.225.38.67
- Репозиторий: GitHub (kickcs/notification-tg-bot)
- Deployment скрипт: `deploy.sh` уже существует
- Docker Compose production конфигурация готова

## Goals / Non-Goals

### Goals
- Автоматический деплой при push в main
- Безопасное SSH подключение через GitHub Actions
- Pre-deploy проверки (build, lint)
- Rollback механизм при ошибках
- Уведомления о статусе деплоя

### Non-Goals
- Multi-environment деплой (staging, production) - v1 только production
- Blue-green deployment - v1 простой деплой с downtime
- Automated testing в CI - v1 только build проверка
- Slack/Discord интеграция - v1 только GitHub notifications

## Decisions

### 1. GitHub Actions как CI/CD платформа
**Решение**: Использовать GitHub Actions для автоматизации деплоя.

**Обоснование**:
- Нативная интеграция с GitHub
- Бесплатно для публичных репозиториев
- Простая настройка через YAML
- Встроенные secrets management

**Альтернативы**:
- GitLab CI - требует миграцию репозитория
- Jenkins - требует отдельный сервер
- CircleCI - платный для приватных репозиториев

### 2. SSH деплой через GitHub Actions
**Решение**: Использовать SSH для подключения к VDS и выполнения команд.

**Обоснование**:
- Простота реализации
- Не требует дополнительных агентов на сервере
- Использует существующий `deploy.sh` скрипт
- Безопасно через GitHub Secrets

**Workflow**:
```yaml
- name: Deploy to VDS
  uses: appleboy/ssh-action@v1.0.0
  with:
    host: ${{ secrets.SSH_HOST }}
    username: ${{ secrets.SSH_USER }}
    key: ${{ secrets.SSH_PRIVATE_KEY }}
    script: |
      cd /opt/notification-tg-bot
      git pull origin main
      ./deploy.sh
```

**Альтернативы**:
- Docker Registry + Watchtower - сложнее для single server
- Webhook на сервере - требует дополнительный сервис

### 3. Pre-deploy проверки
**Решение**: Запускать build и базовые проверки перед деплоем.

**Проверки**:
1. `npm install` - проверка зависимостей
2. `npm run build` - проверка компиляции TypeScript
3. `npx prisma generate` - проверка Prisma схемы

**Обоснование**:
- Предотвращает деплой сломанного кода
- Быстрая обратная связь (2-3 минуты)
- Не требует написания тестов (v1)

### 4. Rollback стратегия
**Решение**: Простой rollback через git revert + redeploy.

**Механизм**:
1. При ошибке деплоя - GitHub Actions помечает как failed
2. Ручной rollback: `git revert <commit> && git push`
3. Автоматический redeploy срабатывает на новый push

**Обоснование**:
- Простота реализации для v1
- Использует стандартный Git workflow
- Не требует дополнительной инфраструктуры

**Альтернативы v2**:
- Автоматический rollback при ошибке
- Сохранение предыдущей версии Docker образа
- Blue-green deployment

### 5. Secrets management
**Решение**: Использовать GitHub Secrets для хранения SSH ключей.

**Secrets**:
- `SSH_PRIVATE_KEY` - приватный SSH ключ для деплоя
- `SSH_HOST` - IP адрес VDS (188.225.38.67)
- `SSH_USER` - пользователь для SSH (root)
- `DEPLOY_PATH` - путь к проекту (/opt/notification-tg-bot)

**Безопасность**:
- SSH ключ создается специально для CI/CD
- Ограниченные права (только для деплоя)
- Ключ не имеет passphrase для автоматизации
- known_hosts проверка для защиты от MITM

### 6. Branch protection
**Решение**: Настроить branch protection для main.

**Правила**:
- Require status checks to pass (build должен пройти)
- Require branches to be up to date
- Опционально: Require pull request reviews

**Обоснование**:
- Предотвращает прямой push сломанного кода
- Гарантирует, что CI проверки прошли
- Улучшает качество кода

## Risks / Trade-offs

### Risk 1: Downtime при деплое
**Описание**: При деплое бот будет недоступен 1-2 минуты.

**Митигация v1**: Принять downtime (приемлемо для бота напоминаний).

**Митигация v2**: Blue-green deployment с двумя инстансами.

### Risk 2: Компрометация SSH ключа
**Описание**: Если SSH ключ утечет, злоумышленник получит доступ к серверу.

**Митигация**:
- Ключ хранится только в GitHub Secrets (зашифрован)
- Ограниченные права ключа (только для деплоя)
- Регулярная ротация ключей (каждые 3 месяца)
- Мониторинг логов SSH на сервере

### Risk 3: Автоматический деплой сломанного кода
**Описание**: Если pre-deploy проверки не поймают ошибку, сломанный код попадет в production.

**Митигация**:
- Pre-deploy проверки (build, prisma generate)
- Быстрый rollback через git revert
- Мониторинг логов бота после деплоя
- v2: Добавить автоматические тесты

### Risk 4: GitHub Actions недоступен
**Описание**: Если GitHub Actions не работает, деплой невозможен.

**Митигация**:
- Ручной деплой через SSH всегда доступен
- Документация процесса ручного деплоя
- Альтернатива: локальный скрипт для деплоя

## Migration Plan

### Этап 1: Подготовка SSH ключей
1. Создать новый SSH ключ для CI/CD: `ssh-keygen -t ed25519 -C "ci-cd@notification-bot"`
2. Добавить публичный ключ на VDS: `~/.ssh/authorized_keys`
3. Добавить приватный ключ в GitHub Secrets

### Этап 2: Создание GitHub Actions workflow
1. Создать `.github/workflows/deploy.yml`
2. Настроить trigger на push в main
3. Добавить pre-deploy проверки
4. Настроить SSH деплой

### Этап 3: Тестирование
1. Создать тестовый коммит
2. Проверить, что workflow запустился
3. Проверить, что деплой прошел успешно
4. Проверить логи бота

### Этап 4: Настройка branch protection
1. Включить branch protection для main
2. Require status checks to pass
3. Документировать процесс

### Rollback
Если CI/CD не работает:
1. Удалить `.github/workflows/deploy.yml`
2. Вернуться к ручному деплою через SSH
3. Удалить SSH ключ CI/CD с сервера

## Open Questions

1. **Нужны ли уведомления в Telegram о деплое?**
   - Предложение: v2 - можно добавить через Telegram Bot API

2. **Нужен ли staging environment?**
   - Предложение: v1 - нет, только production. v2 - можно добавить

3. **Как часто ротировать SSH ключи?**
   - Предложение: Каждые 3 месяца или при компрометации

4. **Нужны ли автоматические тесты перед деплоем?**
   - Предложение: v1 - нет (только build). v2 - добавить unit тесты
