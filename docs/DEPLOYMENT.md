# Deployment на VDS

Полное руководство по развертыванию Telegram бота на VDS (Virtual Dedicated Server).

## Требования к VDS

### Минимальные требования:
- **CPU**: 2 ядра
- **RAM**: 2 GB
- **Disk**: 20 GB SSD
- **OS**: Ubuntu 20.04+ / Debian 11+ / CentOS 8+
- **Network**: Стабильное подключение к интернету

### Рекомендуемые требования:
- **CPU**: 4 ядра
- **RAM**: 4 GB
- **Disk**: 40 GB SSD

## Подготовка сервера

### 1. Обновление системы

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Установка Docker

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

Выйдите и войдите снова для применения изменений.

### 3. Установка Docker Compose

```bash
sudo apt install docker-compose-plugin -y
```

Проверка установки:

```bash
docker --version
docker compose version
```

### 4. Установка Git

```bash
sudo apt install git -y
```

### 5. Создание пользователя для деплоя (опционально)

```bash
sudo adduser deploy
sudo usermod -aG docker deploy
sudo su - deploy
```

## Первичный деплой

### 1. Клонирование репозитория

```bash
cd /opt
sudo git clone https://github.com/your-username/notification-tg-bot.git
sudo chown -R $USER:$USER notification-tg-bot
cd notification-tg-bot
```

### 2. Создание .env файла

```bash
cp .env.production.example .env
nano .env
```

Заполните переменные окружения:

```env
BOT_TOKEN=your_actual_bot_token
POSTGRES_PASSWORD=your_strong_password_here
```

**Важно**: Используйте сильный пароль для PostgreSQL!

Генерация пароля:

```bash
openssl rand -base64 32
```

Установите права доступа:

```bash
chmod 600 .env
```

### 3. Запуск деплоя

```bash
./deploy.sh
```

Скрипт автоматически:
- Проверит наличие Docker и Docker Compose
- Проверит наличие .env файла
- Соберет Docker образы
- Применит миграции базы данных
- Запустит контейнеры

### 4. Проверка работы

```bash
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs -f bot
```

Бот должен быть в статусе `Up` и в логах должно быть:
```
✅ Подключено к базе данных
✅ Бот запущен
```

## Настройка автозапуска (Systemd)

### 1. Копирование service файла

```bash
sudo cp systemd/notification-bot.service /etc/systemd/system/
```

### 2. Редактирование пути (если нужно)

Если репозиторий находится не в `/opt/notification-tg-bot`:

```bash
sudo nano /etc/systemd/system/notification-bot.service
```

Измените `WorkingDirectory` на ваш путь.

### 3. Активация service

```bash
sudo systemctl daemon-reload
sudo systemctl enable notification-bot
sudo systemctl start notification-bot
```

### 4. Проверка статуса

```bash
sudo systemctl status notification-bot
```

### 5. Управление сервисом

```bash
sudo systemctl start notification-bot    # Запуск
sudo systemctl stop notification-bot     # Остановка
sudo systemctl restart notification-bot  # Перезапуск
sudo systemctl status notification-bot   # Статус
```

## Настройка автоматических бэкапов

### 1. Тестирование бэкапа

```bash
./backup.sh
```

Проверьте, что файл создан:

```bash
ls -lh backups/
```

### 2. Настройка cron

```bash
crontab -e
```

Добавьте строку для бэкапа каждые 6 часов:

```cron
0 */6 * * * cd /opt/notification-tg-bot && ./backup.sh >> /var/log/bot-backup.log 2>&1
```

Или каждый день в 3:00 ночи:

```cron
0 3 * * * cd /opt/notification-tg-bot && ./backup.sh >> /var/log/bot-backup.log 2>&1
```

### 3. Проверка cron

```bash
crontab -l
```

## Обновление бота

### 1. Создание бэкапа перед обновлением

```bash
./backup.sh
```

### 2. Получение обновлений

```bash
git pull origin main
```

### 3. Запуск деплоя

```bash
./deploy.sh
```

### 4. Проверка работы

```bash
docker-compose -f docker-compose.prod.yml logs -f bot
```

## Восстановление из бэкапа

### 1. Просмотр доступных бэкапов

```bash
ls -lh backups/
```

### 2. Восстановление

```bash
./restore.sh backups/backup_20231015_120000.sql
```

**Внимание**: Это удалит все текущие данные!

## Просмотр логов

### Все логи

```bash
./logs.sh
```

### Только логи бота

```bash
./logs.sh bot
```

### Только логи PostgreSQL

```bash
./logs.sh postgres
```

### Логи через Docker Compose

```bash
docker-compose -f docker-compose.prod.yml logs -f
docker-compose -f docker-compose.prod.yml logs -f --tail=100 bot
```

## Мониторинг

### Проверка статуса контейнеров

```bash
docker-compose -f docker-compose.prod.yml ps
```

### Проверка использования ресурсов

```bash
docker stats
```

### Проверка свободного места

```bash
df -h
```

### Проверка размера логов

```bash
du -sh /var/lib/docker/containers/*/
```

## Troubleshooting

### Бот не запускается

**Проверьте логи:**

```bash
docker-compose -f docker-compose.prod.yml logs bot
```

**Частые причины:**
- Неверный BOT_TOKEN в .env
- Проблемы с подключением к PostgreSQL
- Ошибки миграции базы данных

**Решение:**
1. Проверьте .env файл
2. Проверьте, что PostgreSQL запущен: `docker-compose -f docker-compose.prod.yml ps postgres`
3. Пересоздайте контейнеры: `./deploy.sh`

### PostgreSQL не запускается

**Проверьте логи:**

```bash
docker-compose -f docker-compose.prod.yml logs postgres
```

**Решение:**
1. Проверьте права на volume: `ls -la /var/lib/docker/volumes/`
2. Удалите volume и пересоздайте: `docker volume rm notification-tg-bot_postgres_data`
3. Восстановите из бэкапа

### Недостаточно места на диске

**Очистка старых Docker образов:**

```bash
docker system prune -a
```

**Очистка старых логов:**

```bash
sudo truncate -s 0 /var/lib/docker/containers/*/*-json.log
```

**Очистка старых бэкапов:**

```bash
find backups/ -name "backup_*.sql" -mtime +30 -delete
```

### Бот работает медленно

**Проверьте использование ресурсов:**

```bash
docker stats
```

**Увеличьте лимиты в docker-compose.prod.yml:**

```yaml
deploy:
  resources:
    limits:
      memory: 1G
      cpus: '1.0'
```

Перезапустите:

```bash
./deploy.sh
```

### Ошибка подключения к базе данных

**Проверьте DATABASE_URL в .env:**

```bash
cat .env | grep DATABASE_URL
```

Должно быть:

```
DATABASE_URL=postgresql://postgres:your_password@postgres:5432/notification_bot?schema=public
```

**Проверьте сеть Docker:**

```bash
docker network ls
docker network inspect notification-tg-bot_bot-network
```

### Миграции не применяются

**Применить миграции вручную:**

```bash
docker-compose -f docker-compose.prod.yml exec bot yarn prisma migrate deploy
```

**Сбросить и пересоздать базу (УДАЛИТ ВСЕ ДАННЫЕ):**

```bash
docker-compose -f docker-compose.prod.yml exec bot yarn prisma migrate reset
```

## Безопасность

### Рекомендации:

1. **Используйте сильные пароли** для PostgreSQL
2. **Ограничьте SSH доступ** только для ваших IP
3. **Настройте firewall** (ufw):

```bash
sudo ufw allow 22/tcp
sudo ufw enable
```

4. **Регулярно обновляйте систему**:

```bash
sudo apt update && sudo apt upgrade -y
```

5. **Мониторьте логи** на подозрительную активность
6. **Храните бэкапы** на внешнем хранилище (S3, другой сервер)

### Копирование бэкапов на другой сервер

```bash
scp backups/backup_*.sql user@backup-server:/path/to/backups/
```

Или используйте rsync:

```bash
rsync -avz backups/ user@backup-server:/path/to/backups/
```

## Полезные команды

```bash
./deploy.sh                                    # Деплой/обновление
./backup.sh                                    # Создать бэкап
./restore.sh backups/backup_YYYYMMDD.sql      # Восстановить из бэкапа
./logs.sh                                      # Просмотр логов
./logs.sh bot                                  # Логи только бота

docker-compose -f docker-compose.prod.yml ps          # Статус
docker-compose -f docker-compose.prod.yml restart bot # Перезапуск бота
docker-compose -f docker-compose.prod.yml down        # Остановка всех контейнеров
docker-compose -f docker-compose.prod.yml up -d       # Запуск всех контейнеров

sudo systemctl status notification-bot         # Статус systemd service
sudo systemctl restart notification-bot        # Перезапуск через systemd
```

## Контакты и поддержка

При возникновении проблем:
1. Проверьте раздел Troubleshooting
2. Изучите логи: `./logs.sh`
3. Создайте issue в репозитории
