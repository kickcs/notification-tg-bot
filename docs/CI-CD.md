# CI/CD Автоматический Деплой

Автоматический деплой на production сервер через GitHub Actions при каждом push в ветку `main`.

## Как это работает

1. **Push в main** → GitHub Actions запускает workflow
2. **Pre-Deploy Checks** → Build, Prisma generate, проверка артефактов
3. **Deploy** → SSH подключение к VDS, git pull, запуск deploy.sh
4. **Verify** → Проверка, что бот запущен

## Настройка GitHub Secrets

Для работы CI/CD нужно добавить следующие secrets в GitHub:

### 1. Перейдите в Settings → Secrets and variables → Actions

### 2. Добавьте следующие secrets:

**SSH_PRIVATE_KEY**
```
Приватный SSH ключ для подключения к VDS.
Получить: cat /tmp/ci-cd-key
```

**SSH_HOST**
```
188.225.38.67
```

**SSH_USER**
```
root
```

**DEPLOY_PATH**
```
/opt/notification-tg-bot
```

## Инструкция по добавлению secrets

### Шаг 1: Получить приватный ключ

На вашем локальном компьютере:

```bash
cat /tmp/ci-cd-key
```

Скопируйте весь вывод (включая `-----BEGIN OPENSSH PRIVATE KEY-----` и `-----END OPENSSH PRIVATE KEY-----`).

### Шаг 2: Добавить в GitHub

1. Откройте репозиторий на GitHub
2. Settings → Secrets and variables → Actions
3. New repository secret
4. Name: `SSH_PRIVATE_KEY`
5. Value: вставьте скопированный ключ
6. Add secret

Повторите для остальных secrets:
- `SSH_HOST`: `188.225.38.67`
- `SSH_USER`: `root`
- `DEPLOY_PATH`: `/opt/notification-tg-bot`

## Использование

### Автоматический деплой

Просто сделайте push в ветку `main`:

```bash
git add .
git commit -m "feat: новая функция"
git push origin main
```

GitHub Actions автоматически запустит деплой.

### Ручной деплой

Можно запустить workflow вручную:

1. Перейдите в Actions → Deploy to Production
2. Run workflow → Run workflow

### Просмотр логов деплоя

1. Перейдите в Actions
2. Выберите последний workflow run
3. Откройте job "Deploy to VDS"
4. Просмотрите логи каждого step

## Статусы деплоя

- ✅ **Success** - деплой прошел успешно
- ❌ **Failed** - деплой завершился с ошибкой
- 🟡 **In Progress** - деплой выполняется

Статус отображается:
- В коммите (зеленая галочка или красный крестик)
- В GitHub Actions
- В README (badge, если настроен)

## Rollback

### Автоматический rollback (через git revert)

```bash
# Найдите коммит, который нужно откатить
git log --oneline

# Откатите изменения
git revert <commit-hash>

# Запушьте
git push origin main
```

Автоматически запустится новый деплой с откатом.

### Ручной rollback (быстрый)

```bash
# Подключитесь к серверу
ssh root@188.225.38.67

# Перейдите в директорию проекта
cd /opt/notification-tg-bot

# Откатите к предыдущему коммиту
git log --oneline  # найдите нужный коммит
git reset --hard <commit-hash>

# Задеплойте
./deploy.sh
```

## Pre-Deploy Checks

Перед деплоем автоматически выполняются проверки:

1. **npm ci** - установка зависимостей
2. **npx prisma generate** - генерация Prisma Client
3. **npm run build** - компиляция TypeScript
4. **Проверка dist/** - наличие собранных файлов

Если любая проверка не прошла - деплой не запустится.

## Branch Protection

Рекомендуется настроить branch protection для `main`:

1. Settings → Branches → Add rule
2. Branch name pattern: `main`
3. Включите:
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
   - Выберите: `Pre-Deploy Checks`
4. Save changes

Теперь merge в main возможен только после успешных проверок.

## Troubleshooting

### Ошибка: "Permission denied (publickey)"

**Проблема**: SSH ключ не добавлен или неверный.

**Решение**:
1. Проверьте, что `SSH_PRIVATE_KEY` добавлен в GitHub Secrets
2. Проверьте, что публичный ключ добавлен на сервере:
   ```bash
   ssh root@188.225.38.67 "cat ~/.ssh/authorized_keys | grep ci-cd"
   ```

### Ошибка: "Build failed"

**Проблема**: Код не компилируется.

**Решение**:
1. Проверьте логи в GitHub Actions
2. Запустите build локально: `npm run build`
3. Исправьте ошибки и запушьте снова

### Ошибка: "Bot is not running"

**Проблема**: Бот не запустился после деплоя.

**Решение**:
1. Подключитесь к серверу: `ssh root@188.225.38.67`
2. Проверьте логи: `cd /opt/notification-tg-bot && ./logs.sh bot`
3. Проверьте статус: `docker compose -f docker-compose.prod.yml ps`
4. Перезапустите: `docker compose -f docker-compose.prod.yml restart bot`

### Workflow не запускается

**Проблема**: Push в main не запускает workflow.

**Решение**:
1. Проверьте, что файл `.github/workflows/deploy.yml` существует
2. Проверьте, что вы пушите в ветку `main` (не `master`)
3. Проверьте Actions → All workflows → Deploy to Production

### Деплой зависает

**Проблема**: Workflow выполняется слишком долго.

**Решение**:
1. Проверьте логи в GitHub Actions
2. Возможно, сервер недоступен - проверьте SSH доступ
3. Отмените workflow и запустите заново

## Мониторинг

### Проверка статуса после деплоя

```bash
# Подключитесь к серверу
ssh root@188.225.38.67

# Проверьте статус контейнеров
cd /opt/notification-tg-bot
docker compose -f docker-compose.prod.yml ps

# Проверьте логи
./logs.sh bot
```

### Email уведомления

GitHub автоматически отправляет email при:
- ❌ Failed workflow
- ✅ Fixed workflow (после failed)

Настройте в Settings → Notifications.

## Безопасность

### SSH ключ

- ✅ Ключ создан специально для CI/CD
- ✅ Ключ хранится только в GitHub Secrets (зашифрован)
- ✅ Ключ не имеет passphrase (для автоматизации)
- ⚠️ Ограничьте права ключа на сервере

### Ротация ключей

Рекомендуется менять SSH ключ каждые 3 месяца:

```bash
# Создайте новый ключ
ssh-keygen -t ed25519 -C "ci-cd@notification-bot" -f /tmp/ci-cd-key-new -N ""

# Добавьте на сервер
ssh root@188.225.38.67 "echo '$(cat /tmp/ci-cd-key-new.pub)' >> ~/.ssh/authorized_keys"

# Обновите в GitHub Secrets
# Settings → Secrets → SSH_PRIVATE_KEY → Update

# Удалите старый ключ с сервера
ssh root@188.225.38.67 "sed -i '/ci-cd@notification-bot/d' ~/.ssh/authorized_keys"
ssh root@188.225.38.67 "echo '$(cat /tmp/ci-cd-key-new.pub)' >> ~/.ssh/authorized_keys"
```

## Альтернатива: Ручной деплой

Если CI/CD не работает, всегда можно задеплоить вручную:

```bash
ssh root@188.225.38.67
cd /opt/notification-tg-bot
git pull origin main
./deploy.sh
```

## Полезные ссылки

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [SSH Action](https://github.com/appleboy/ssh-action)
- [Branch Protection Rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
