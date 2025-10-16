## Why
Администратору необходима возможность управлять шаблонами сообщений (напоминаний и наград) без прямого доступа к базе данных. Это позволит оперативно добавлять, удалять и редактировать сообщения через интерфейс бота.

## What Changes
- Добавление переменной окружения `ADMIN_TELEGRAM_ID` для идентификации администратора
- Новые команды для администратора: `/addreminder`, `/addreward`, `/deletemessage`, `/listmessages`
- Middleware для проверки прав администратора
- Функционал управления шаблонами сообщений через команды бота

## Impact
- Affected specs: `bot-commands`, `message-templates`
- Affected code: `src/config.ts`, `src/handlers/commands.ts`, `src/services/messageTemplateService.ts`
- New files: middleware для проверки администратора
