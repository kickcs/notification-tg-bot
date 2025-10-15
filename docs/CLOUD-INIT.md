# Cloud-init для автоматической настройки VDS

Cloud-init автоматизирует первоначальную настройку сервера при его создании.

## Что делает скрипт

✅ Создает пользователя `deploy` с sudo правами  
✅ Устанавливает Docker и Docker Compose  
✅ Устанавливает необходимые пакеты (git, ufw, htop, vim)  
✅ Настраивает firewall (открывает порты 22, 80, 443)  
✅ Клонирует репозиторий проекта в `/opt/notification-tg-bot`  
✅ Создает swap файл (если RAM < 4GB)  
✅ Настраивает автоматическую очистку Docker  
✅ Создает алиасы для управления ботом  
✅ Настраивает логирование Docker  

## Как использовать

### 1. Подготовка SSH ключа

Если у вас еще нет SSH ключа:

```bash
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
cat ~/.ssh/id_rsa.pub
```

Скопируйте содержимое публичного ключа.

### 2. Редактирование cloud-init.yml

Откройте `cloud-init.yml` и замените:

```yaml
ssh_authorized_keys:
  - ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC... # ЗАМЕНИТЕ НА ВАШ SSH КЛЮЧ
```

Вставьте ваш публичный SSH ключ.

### 3. Использование при создании VDS

#### Вариант A: Через веб-интерфейс хостинга

1. При создании VDS найдите раздел **"Cloud-init"** или **"User Data"**
2. Скопируйте содержимое файла `cloud-init.yml`
3. Вставьте в поле Cloud-init
4. Создайте сервер

#### Вариант B: Через CLI (например, для DigitalOcean)

```bash
doctl compute droplet create notification-bot \
  --region fra1 \
  --size s-2vcpu-2gb \
  --image ubuntu-22-04-x64 \
  --user-data-file cloud-init.yml
```

#### Вариант C: Для других провайдеров

- **Hetzner Cloud**: Используйте `--user-data-from-file cloud-init.yml`
- **AWS EC2**: Используйте параметр `--user-data file://cloud-init.yml`
- **Vultr**: Загрузите скрипт в разделе "Startup Script"
- **Selectel**: Используйте раздел "Cloud-init" при создании сервера

### 4. Ожидание завершения установки

После создания сервера подождите **5-10 минут** для завершения установки.

Проверить статус можно через:

```bash
ssh deploy@YOUR_SERVER_IP
tail -f /var/log/cloud-init-output.log
```

### 5. Финальная настройка

После завершения cloud-init:

```bash
# 1. Подключитесь к серверу
ssh deploy@YOUR_SERVER_IP

# 2. Настройте .env файл
cd /opt/notification-tg-bot
nano .env

# Заполните:
# BOT_TOKEN=ваш_токен_от_BotFather
# POSTGRES_PASSWORD=$(openssl rand -base64 32)

# 3. Запустите деплой
./deploy.sh

# 4. Настройте автозапуск
sudo cp systemd/notification-bot.service /etc/systemd/system/
sudo systemctl enable notification-bot
sudo systemctl start notification-bot

# 5. Настройте автоматические бэкапы
crontab -e
# Добавьте: 0 */6 * * * cd /opt/notification-tg-bot && ./backup.sh
```

## Полезные алиасы

После установки доступны команды:

```bash
bot-logs      # Просмотр логов
bot-status    # Статус контейнеров
bot-restart   # Перезапуск бота
bot-backup    # Создать бэкап
bot-deploy    # Обновить и задеплоить
```

## Проверка установки

```bash
# Проверка Docker
docker --version
docker compose version

# Проверка репозитория
ls -la /opt/notification-tg-bot

# Проверка firewall
sudo ufw status

# Проверка swap (если RAM < 4GB)
free -h
```

## Troubleshooting

### Cloud-init не выполнился

Проверьте логи:

```bash
sudo cat /var/log/cloud-init.log
sudo cat /var/log/cloud-init-output.log
```

### Репозиторий не склонирован

Клонируйте вручную:

```bash
cd /opt
sudo git clone https://github.com/kickcs/notification-tg-bot.git
sudo chown -R deploy:deploy notification-tg-bot
```

### Docker не установлен

Установите вручную:

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

Выйдите и войдите снова.

## Безопасность

После первого входа:

1. **Отключите вход по паролю:**

```bash
sudo nano /etc/ssh/sshd_config
# Установите: PasswordAuthentication no
sudo systemctl restart sshd
```

2. **Настройте fail2ban:**

```bash
sudo apt install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

3. **Регулярно обновляйте систему:**

```bash
sudo apt update && sudo apt upgrade -y
```

## Альтернатива: Ручная установка

Если ваш хостинг не поддерживает cloud-init, используйте инструкцию из [DEPLOYMENT.md](DEPLOYMENT.md).

## Поддерживаемые ОС

- ✅ Ubuntu 20.04 LTS
- ✅ Ubuntu 22.04 LTS
- ✅ Debian 11
- ✅ Debian 12

Для других ОС может потребоваться адаптация скрипта.
