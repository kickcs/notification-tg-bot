## Why
При повторной отправке напоминаний о приеме таблеток накапливаются старые сообщения, что создает беспорядок в чате. Администратор не может использовать административные команды из-за отсутствия ADMIN_TELEGRAM_ID в .env и не имеет способа узнать свой статус администратора.

## What Changes
- Система будет удалять предыдущие сообщения-напоминания при отправке повторных напоминаний
- Добавление поля messageId в модель Reminder для отслеживания отправленных сообщений
- Добавление команды `/whoami` для проверки статуса администратора и отображения telegramId
- Обновление .env с корректным ADMIN_TELEGRAM_ID

## Impact
- Affected specs: `reminder-notifications`, `bot-commands`
- Affected code:
  - `prisma/schema.prisma` - добавление поля messageId
  - `src/scheduler/cronScheduler.ts` - сохранение и удаление messageId
  - `src/handlers/commands.ts` - новая команда `/whoami`
  - `.env` - добавление ADMIN_TELEGRAM_ID
