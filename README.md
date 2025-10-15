# Telegram Medication Reminder Bot

Telegram бот для напоминаний о приеме таблеток с автоматическим расписанием, построенный на grammY, PostgreSQL, Docker, TypeScript и Prisma.

## Возможности

- 💊 Автоматические напоминания о приеме таблеток по расписанию
- ⏰ Настройка множественных времен напоминаний в день
- ✅ Подтверждение приема через inline-кнопки
- 🎉 Мотивационные сообщения-награды после подтверждения
- 🔁 Повторные напоминания при отсутствии подтверждения
- 👥 Поддержка работы в группах Telegram
- 📝 Управление расписанием (создание, редактирование, удаление)
- 🎲 Случайные шаблоны сообщений из базы данных

## Технологии

- **grammY** - современный фреймворк для Telegram ботов
- **TypeScript** - типизированный JavaScript
- **PostgreSQL** - реляционная база данных
- **Prisma** - современная ORM для TypeScript
- **node-cron** - планировщик задач
- **Docker** - контейнеризация приложения
- **GitHub Actions** - CI/CD автоматический деплой
- **Yarn** - менеджер пакетов

## Структура проекта

```
notification-tg-bot/
├── src/
│   ├── index.ts                  # Основной файл бота
│   ├── config.ts                 # Конфигурация
│   ├── handlers/
│   │   ├── commands.ts           # Обработчики команд
│   │   └── callbacks.ts          # Обработчики callback-кнопок
│   ├── services/
│   │   ├── scheduleService.ts    # Управление расписаниями
│   │   ├── reminderService.ts    # Работа с напоминаниями
│   │   └── templateService.ts    # Шаблоны сообщений
│   ├── scheduler/
│   │   └── cronScheduler.ts      # Планировщик задач
│   ├── utils/
│   │   └── timeUtils.ts          # Утилиты для работы со временем
│   └── lib/
│       └── prisma.ts             # Prisma клиент
├── prisma/
│   ├── schema.prisma             # Схема базы данных
│   └── seed.ts                   # Seed данные для шаблонов
├── Dockerfile                    # Docker образ
├── docker-compose.yml            # Docker Compose (development)
├── docker-compose.prod.yml       # Docker Compose (production)
├── deploy.sh                     # Скрипт деплоя
├── backup.sh                     # Скрипт бэкапа БД
├── restore.sh                    # Скрипт восстановления БД
├── logs.sh                       # Скрипт просмотра логов
├── systemd/
│   └── notification-bot.service  # Systemd service
├── .github/
│   └── workflows/
│       └── deploy.yml            # GitHub Actions CI/CD
├── docs/
│   ├── DEPLOYMENT.md             # Инструкция по деплою
│   ├── CI-CD.md                  # Инструкция по CI/CD
│   └── CLOUD-INIT.md             # Cloud-init настройка
├── package.json                  # Зависимости
├── tsconfig.json                 # TypeScript конфигурация
└── .env.example                  # Пример переменных окружения
```

## Быстрый старт

### 1. Установка зависимостей

```bash
yarn install
```

### 2. Настройка переменных окружения

Скопируйте `.env.example` в `.env` и заполните необходимые значения:

```bash
cp .env.example .env
```

Получите токен бота у [@BotFather](https://t.me/BotFather) и добавьте его в `.env`:

```env
BOT_TOKEN=your_bot_token_here
```

### 3. Запуск с Docker (рекомендуется)

```bash
yarn docker:up
```

Это запустит PostgreSQL и бот в Docker контейнерах.

### 4. Запуск локально (для разработки)

Сначала запустите PostgreSQL:

```bash
docker run -d \
  --name postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=notification_bot \
  -p 5432:5432 \
  postgres:16-alpine
```

Затем выполните миграции и seed:

```bash
yarn prisma:migrate
yarn prisma:seed
```

И запустите бота в режиме разработки:

```bash
yarn dev
```

## Production Deployment

### CI/CD Автоматический деплой

При каждом push в `main` автоматически запускается деплой на production сервер через GitHub Actions.

Подробная инструкция: **[docs/CI-CD.md](docs/CI-CD.md)**

**Требуется настройка GitHub Secrets:**
- `SSH_PRIVATE_KEY` - приватный SSH ключ
- `SSH_HOST` - IP адрес сервера
- `SSH_USER` - пользователь для SSH
- `DEPLOY_PATH` - путь к проекту

### Автоматическая установка (Cloud-init)

Используйте **[cloud-init.yml](cloud-init.yml)** для автоматической настройки VDS при создании сервера.

Подробная инструкция: **[docs/CLOUD-INIT.md](docs/CLOUD-INIT.md)**

### Ручная установка

Полная инструкция: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**

Краткая версия:

```bash
# На VDS
git clone https://github.com/kickcs/notification-tg-bot.git
cd notification-tg-bot
cp .env.production.example .env
nano .env  # Заполните переменные
./deploy.sh
```

## Доступные команды

### Команды бота

#### Основные команды
- `/start` - Регистрация в боте
- `/help` - Справка по всем командам

#### Управление расписанием
- `/setreminder 09:00,14:00,21:00` - Создать расписание напоминаний
- `/myreminders` - Показать текущее расписание
- `/editreminder 10:00,16:00` - Изменить расписание
- `/deletereminder` - Удалить расписание

#### Дополнительные команды
- `/notify <сообщение>` - Создать уведомление вручную
- `/history` - Показать последние 10 уведомлений

### Формат времени

Используйте 24-часовой формат `HH:MM`:
- ✅ Правильно: `09:00`, `14:30`, `21:00`
- ❌ Неправильно: `9:00`, `25:00`, `14:60`

Несколько времен указывайте через запятую: `09:00,14:00,21:00`

### NPM скрипты

- `yarn dev` - Запуск в режиме разработки с hot-reload
- `yarn build` - Сборка проекта
- `yarn start` - Запуск собранного проекта
- `yarn prisma:generate` - Генерация Prisma клиента
- `yarn prisma:migrate` - Выполнение миграций
- `yarn prisma:seed` - Заполнение базы шаблонами
- `yarn prisma:studio` - Открыть Prisma Studio
- `yarn docker:up` - Запустить Docker контейнеры
- `yarn docker:down` - Остановить Docker контейнеры
- `yarn docker:logs` - Показать логи контейнеров

## База данных

Проект использует PostgreSQL с Prisma ORM. Схема включает:

### Модель User
- `id` - UUID
- `telegramId` - ID пользователя в Telegram (уникальный)
- `username` - Имя пользователя в Telegram
- `firstName` - Имя
- `lastName` - Фамилия
- `chatId` - ID чата/группы
- `createdAt` - Дата создания
- `updatedAt` - Дата обновления

### Модель Schedule
- `id` - UUID
- `userId` - Связь с пользователем
- `chatId` - ID группы
- `times` - Массив времен напоминаний
- `isActive` - Активно ли расписание
- `createdAt` - Дата создания
- `updatedAt` - Дата обновления

### Модель Reminder
- `id` - UUID
- `scheduleId` - Связь с расписанием
- `status` - Статус (pending/confirmed/missed)
- `retryCount` - Количество повторных попыток
- `sentAt` - Дата отправки

### Модель Confirmation
- `id` - UUID
- `reminderId` - Связь с напоминанием
- `confirmedAt` - Дата подтверждения

### Модель MessageTemplate
- `id` - UUID
- `type` - Тип (reminder/reward)
- `content` - Текст сообщения
- `isActive` - Активен ли шаблон
- `createdAt` - Дата создания

### Модель Notification
- `id` - UUID
- `userId` - Связь с пользователем
- `message` - Текст уведомления
- `sentAt` - Дата отправки

## Как это работает

### Автоматические напоминания

1. Пользователь создает расписание через `/setreminder 09:00,14:00,21:00`
2. Система регистрирует cron-задачи для каждого времени
3. В указанное время бот отправляет напоминание с кнопкой "Подтвердить"
4. Если пользователь не подтверждает, через 15 минут отправляется повторное напоминание
5. Максимум 3 повторных попытки, после чего напоминание помечается как пропущенное

### Подтверждение приема

1. Пользователь нажимает кнопку "✅ Подтвердить"
2. Система проверяет, что нажавший = получатель напоминания
3. Напоминание помечается как подтвержденное
4. Отменяются все повторные напоминания
5. Отправляется случайное сообщение-награда

### Шаблоны сообщений

- Хранятся в таблице `MessageTemplate`
- Два типа: `reminder` (напоминания) и `reward` (награды)
- При отправке выбирается случайный активный шаблон
- Можно добавлять свои шаблоны через Prisma Studio или напрямую в БД

## Разработка

### Добавление новых команд

Откройте `src/handlers/commands.ts` и добавьте новую команду:

```typescript
async function handleMyCommand(ctx: Context) {
  await ctx.reply('Ответ на команду');
}
```

Затем зарегистрируйте её в функции `registerCommands`:

```typescript
export function registerCommands(bot: Bot) {
  bot.command('mycommand', handleMyCommand);
}
```

### Изменение схемы базы данных

1. Отредактируйте `prisma/schema.prisma`
2. Создайте миграцию: `yarn prisma:migrate`
3. Prisma клиент обновится автоматически

### Просмотр базы данных

Используйте Prisma Studio для визуального просмотра данных:

```bash
yarn prisma:studio
```

## Docker

### Сборка образа

```bash
docker build -t notification-bot .
```

### Запуск с Docker Compose

```bash
docker-compose up -d
```

### Просмотр логов

```bash
docker-compose logs -f bot
```

### Остановка

```bash
docker-compose down
```

## Производство

Для продакшена рекомендуется:

1. Использовать переменные окружения для всех секретов
2. Настроить логирование
3. Добавить мониторинг
4. Использовать reverse proxy (nginx)
5. Настроить автоматические бэкапы базы данных

## Лицензия

MIT
