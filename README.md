# Telegram Notification Bot

Telegram бот для уведомлений, построенный на grammY, PostgreSQL, Docker, TypeScript и Prisma.

## Технологии

- **grammY** - современный фреймворк для Telegram ботов
- **TypeScript** - типизированный JavaScript
- **PostgreSQL** - реляционная база данных
- **Prisma** - современная ORM для TypeScript
- **Docker** - контейнеризация приложения
- **Yarn** - менеджер пакетов

## Структура проекта

```
notification-tg-bot/
├── src/
│   ├── index.ts          # Основной файл бота
│   ├── config.ts         # Конфигурация
│   └── lib/
│       └── prisma.ts     # Prisma клиент
├── prisma/
│   └── schema.prisma     # Схема базы данных
├── Dockerfile            # Docker образ
├── docker-compose.yml    # Docker Compose конфигурация
├── package.json          # Зависимости
├── tsconfig.json         # TypeScript конфигурация
└── .env.example          # Пример переменных окружения
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

Затем выполните миграции:

```bash
yarn prisma:migrate
```

И запустите бота в режиме разработки:

```bash
yarn dev
```

## Доступные команды

### Команды бота

- `/start` - Регистрация в боте
- `/notify <сообщение>` - Создать уведомление
- `/history` - Показать последние 10 уведомлений

### NPM скрипты

- `yarn dev` - Запуск в режиме разработки с hot-reload
- `yarn build` - Сборка проекта
- `yarn start` - Запуск собранного проекта
- `yarn prisma:generate` - Генерация Prisma клиента
- `yarn prisma:migrate` - Выполнение миграций
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
- `createdAt` - Дата создания
- `updatedAt` - Дата обновления

### Модель Notification

- `id` - UUID
- `userId` - Связь с пользователем
- `message` - Текст уведомления
- `sentAt` - Дата отправки

## Разработка

### Добавление новых команд

Откройте `src/index.ts` и добавьте новую команду:

```typescript
bot.command('mycommand', async (ctx) => {
  await ctx.reply('Ответ на команду');
});
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
