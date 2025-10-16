import {Bot, Context} from 'grammy';
import {formatTimes, parseTimes, validateTimes} from '../utils/timeUtils';
import {createSchedule, deleteSchedule, getActiveSchedule, updateSchedule} from '../services/scheduleService';
import {registerCronTask, unregisterCronTasks} from '../scheduler/cronScheduler';
import {getBotInstance} from '../lib/bot';
import {isAdmin} from '../middleware/isAdmin';
import {createTemplate, deleteTemplate, getAllTemplates} from '../services/templateService';
import {config} from '../config';

export function registerCommands(bot: Bot) {
    bot.command('setreminder', handleSetReminder);
    bot.command('myreminders', handleMyReminders);
    bot.command('editreminder', handleEditReminder);
    bot.command('deletereminder', handleDeleteReminder);
    bot.command('help', handleHelp);
    bot.command('whoami', handleWhoami);
    
    bot.command('addreminder', isAdmin, handleAddReminder);
    bot.command('addreward', isAdmin, handleAddReward);
    bot.command('deletemessage', isAdmin, handleDeleteMessage);
    bot.command('listmessages', isAdmin, handleListMessages);
}

async function handleSetReminder(ctx: Context) {
    const telegramId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    const input = ctx.match;

    if (!telegramId || !chatId) {
        return ctx.reply('Ошибка: не удалось получить информацию о пользователе или чате');
    }

    if (!input) {
        return ctx.reply(
            '⚠️ Использование: /setreminder 09:00,14:00,21:00\n\n' +
            'Укажите время напоминаний через запятую в формате HH:MM (24-часовой формат)'
        );
    }

    const times = parseTimes(input.toString());

    if (times.length === 0) {
        return ctx.reply('⚠️ Укажите хотя бы одно время');
    }

    const validation = validateTimes(times);

    if (!validation.valid) {
        return ctx.reply(
            `⚠️ Некорректный формат времени: ${validation.invalidTimes.join(', ')}\n\n` +
            'Используйте формат HH:MM (например, 09:00, 14:30, 21:00)'
        );
    }

    try {
        const user = await ctx.api.getChat(telegramId);

        let dbUser = await ctx.api.getChat(telegramId).then(async () => {
            const {prisma} = await import('../lib/prisma');
            return prisma.user.findUnique({where: {telegramId: BigInt(telegramId)}});
        });

        if (!dbUser) {
            const {prisma} = await import('../lib/prisma');
            dbUser = await prisma.user.create({
                data: {
                    telegramId: BigInt(telegramId),
                    username: ctx.from?.username,
                    firstName: ctx.from?.first_name,
                    lastName: ctx.from?.last_name,
                    chatId: BigInt(chatId),
                },
            });
        }

        const schedule = await createSchedule(dbUser.id, BigInt(chatId), times);

        for (const time of times) {
            registerCronTask(getBotInstance(), schedule.id, dbUser.id, BigInt(chatId), time);
        }

        await ctx.reply(
            `✅ Расписание создано!\n\n` +
            `⏰ Время напоминаний: ${formatTimes(times)}\n\n` +
            `Вы будете получать напоминания о приеме таблеток в указанное время каждый день.`
        );
    } catch (error) {
        if (error instanceof Error && error.message.includes('уже есть активное расписание')) {
            return ctx.reply(
                '⚠️ У вас уже есть активное расписание в этой группе.\n\n' +
                'Используйте /editreminder для изменения или /deletereminder для удаления.'
            );
        }
        console.error('Ошибка при создании расписания:', error);
        await ctx.reply('❌ Произошла ошибка при создании расписания');
    }
}

async function handleMyReminders(ctx: Context) {
    const telegramId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!telegramId || !chatId) {
        return ctx.reply('Ошибка: не удалось получить информацию');
    }

    try {
        const {prisma} = await import('../lib/prisma');
        const user = await prisma.user.findUnique({where: {telegramId: BigInt(telegramId)}});

        if (!user) {
            return ctx.reply('Вы не зарегистрированы. Используйте /setreminder для создания расписания');
        }

        const schedule = await getActiveSchedule(user.id, BigInt(chatId));

        if (!schedule) {
            return ctx.reply(
                '📭 У вас нет активных расписаний в этой группе.\n\n' +
                'Используйте /setreminder для создания расписания'
            );
        }

        await ctx.reply(
            `📋 Ваше расписание:\n\n` +
            `⏰ Время напоминаний: ${formatTimes(schedule.times)}\n` +
            `📅 Создано: ${schedule.createdAt.toLocaleString('ru-RU')}`
        );
    } catch (error) {
        console.error('Ошибка при получении расписания:', error);
        await ctx.reply('❌ Произошла ошибка при получении расписания');
    }
}

async function handleEditReminder(ctx: Context) {
    const telegramId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    const input = ctx.match;

    if (!telegramId || !chatId) {
        return ctx.reply('Ошибка: не удалось получить информацию');
    }

    if (!input) {
        return ctx.reply(
            '⚠️ Использование: /editreminder 10:00,15:00,20:00\n\n' +
            'Укажите новое время напоминаний через запятую'
        );
    }

    const times = parseTimes(input.toString());
    const validation = validateTimes(times);

    if (!validation.valid) {
        return ctx.reply(
            `⚠️ Некорректный формат времени: ${validation.invalidTimes.join(', ')}\n\n` +
            'Используйте формат HH:MM'
        );
    }

    try {
        const {prisma} = await import('../lib/prisma');
        const user = await prisma.user.findUnique({where: {telegramId: BigInt(telegramId)}});

        if (!user) {
            return ctx.reply('Вы не зарегистрированы. Используйте /setreminder');
        }

        const schedule = await getActiveSchedule(user.id, BigInt(chatId));

        if (!schedule) {
            return ctx.reply(
                '⚠️ У вас нет активного расписания.\n\n' +
                'Используйте /setreminder для создания'
            );
        }

        unregisterCronTasks(schedule.id);

        await updateSchedule(schedule.id, times);

        for (const time of times) {
            registerCronTask(getBotInstance(), schedule.id, user.id, BigInt(chatId), time);
        }

        await ctx.reply(
            `✅ Расписание обновлено!\n\n` +
            `⏰ Новое время напоминаний: ${formatTimes(times)}`
        );
    } catch (error) {
        console.error('Ошибка при редактировании расписания:', error);
        await ctx.reply('❌ Произошла ошибка при редактировании расписания');
    }
}

async function handleDeleteReminder(ctx: Context) {
    const telegramId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!telegramId || !chatId) {
        return ctx.reply('Ошибка: не удалось получить информацию');
    }

    try {
        const {prisma} = await import('../lib/prisma');
        const user = await prisma.user.findUnique({where: {telegramId: BigInt(telegramId)}});

        if (!user) {
            return ctx.reply('Вы не зарегистрированы');
        }

        const schedule = await getActiveSchedule(user.id, BigInt(chatId));

        if (!schedule) {
            return ctx.reply('⚠️ У вас нет активных расписаний для удаления');
        }

        unregisterCronTasks(schedule.id);
        await deleteSchedule(schedule.id);

        await ctx.reply('✅ Расписание удалено. Напоминания больше не будут приходить.');
    } catch (error) {
        console.error('Ошибка при удалении расписания:', error);
        await ctx.reply('❌ Произошла ошибка при удалении расписания');
    }
}

async function handleHelp(ctx: Context) {
    const telegramId = ctx.from?.id;
    const isAdminUser = telegramId && config.adminTelegramId && BigInt(telegramId) === config.adminTelegramId;

    let helpText = '📚 Доступные команды:\n\n' +
        '🔹 /setreminder <время> - Создать расписание напоминаний\n' +
        '   Пример: /setreminder 09:00,14:00,21:00\n\n' +
        '🔹 /myreminders - Показать текущее расписание\n\n' +
        '🔹 /editreminder <время> - Изменить расписание\n' +
        '   Пример: /editreminder 10:00,16:00\n\n' +
        '🔹 /deletereminder - Удалить расписание\n\n' +
        '🔹 /whoami - Проверить свой статус и ID\n\n' +
        '🔹 /help - Показать эту справку\n\n' +
        '💡 Формат времени: HH:MM (24-часовой)\n' +
        '💡 Несколько времен указывайте через запятую';

    if (isAdminUser) {
        helpText += '\n\n' +
            '👑 Административные команды:\n\n' +
            '🔸 /addreminder <текст> - Добавить шаблон напоминания\n' +
            '   Пример: /addreminder Не забудьте принять таблетки!\n\n' +
            '🔸 /addreward <текст> - Добавить шаблон награды\n' +
            '   Пример: /addreward Отлично! Продолжайте в том же духе!\n\n' +
            '🔸 /deletemessage <id> - Удалить шаблон по ID\n' +
            '   Пример: /deletemessage abc-123-def\n\n' +
            '🔸 /listmessages [type] - Показать все шаблоны\n' +
            '   Пример: /listmessages reminder';
    }

    await ctx.reply(helpText);
}

async function handleAddReminder(ctx: Context) {
    const input = ctx.match;

    if (!input || input.toString().trim().length === 0) {
        return ctx.reply(
            '⚠️ Использование: /addreminder <текст>\n\n' +
            'Пример: /addreminder Не забудьте принять таблетки!'
        );
    }

    try {
        const template = await createTemplate('reminder', input.toString());
        await ctx.reply(
            `✅ Шаблон напоминания создан!\n\n` +
            `🆔 ID: ${template.id}\n` +
            `📝 Содержимое: ${template.content}`
        );
    } catch (error) {
        console.error('Ошибка при создании шаблона напоминания:', error);
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        await ctx.reply(`❌ Ошибка: ${errorMessage}`);
    }
}

async function handleAddReward(ctx: Context) {
    const input = ctx.match;

    if (!input || input.toString().trim().length === 0) {
        return ctx.reply(
            '⚠️ Использование: /addreward <текст>\n\n' +
            'Пример: /addreward Отлично! Продолжайте в том же духе!'
        );
    }

    try {
        const template = await createTemplate('reward', input.toString());
        await ctx.reply(
            `✅ Шаблон награды создан!\n\n` +
            `🆔 ID: ${template.id}\n` +
            `📝 Содержимое: ${template.content}`
        );
    } catch (error) {
        console.error('Ошибка при создании шаблона награды:', error);
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        await ctx.reply(`❌ Ошибка: ${errorMessage}`);
    }
}

async function handleDeleteMessage(ctx: Context) {
    const input = ctx.match;

    if (!input || input.toString().trim().length === 0) {
        return ctx.reply(
            '⚠️ Использование: /deletemessage <id>\n\n' +
            'Пример: /deletemessage abc-123-def\n\n' +
            'Используйте /listmessages для просмотра ID шаблонов'
        );
    }

    try {
        const template = await deleteTemplate(input.toString().trim());
        await ctx.reply(
            `✅ Шаблон удален!\n\n` +
            `🆔 ID: ${template.id}\n` +
            `📝 Содержимое: ${template.content}`
        );
    } catch (error) {
        console.error('Ошибка при удалении шаблона:', error);
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        await ctx.reply(`❌ Ошибка: ${errorMessage}`);
    }
}

async function handleListMessages(ctx: Context) {
    const input = ctx.match?.toString().trim();
    let type: 'reminder' | 'reward' | undefined;

    if (input === 'reminder' || input === 'reward') {
        type = input;
    }

    try {
        const templates = await getAllTemplates(type);

        if (templates.length === 0) {
            return ctx.reply('📭 Шаблоны не найдены');
        }

        const reminderTemplates = templates.filter(t => t.type === 'reminder');
        const rewardTemplates = templates.filter(t => t.type === 'reward');

        let message = '📋 Список шаблонов:\n\n';

        if (reminderTemplates.length > 0) {
            message += '⏰ Напоминания:\n';
            reminderTemplates.forEach((t, index) => {
                const status = t.isActive ? '✅' : '❌';
                const preview = t.content.length > 50 ? t.content.substring(0, 50) + '...' : t.content;
                message += `${index + 1}. ${status} ${preview}\n`;
                message += `   🆔 ${t.id}\n\n`;
            });
        }

        if (rewardTemplates.length > 0) {
            message += '🎁 Награды:\n';
            rewardTemplates.forEach((t, index) => {
                const status = t.isActive ? '✅' : '❌';
                const preview = t.content.length > 50 ? t.content.substring(0, 50) + '...' : t.content;
                message += `${index + 1}. ${status} ${preview}\n`;
                message += `   🆔 ${t.id}\n\n`;
            });
        }

        message += `\n📊 Всего: ${templates.length} шаблонов`;

        await ctx.reply(message);
    } catch (error) {
        console.error('Ошибка при получении списка шаблонов:', error);
        await ctx.reply('❌ Произошла ошибка при получении списка шаблонов');
    }
}

async function handleWhoami(ctx: Context) {
    const telegramId = ctx.from?.id;

    if (!telegramId) {
        return ctx.reply('❌ Не удалось получить информацию о пользователе');
    }

    let message = `👤 Ваша информация:\n\n`;
    message += `🆔 Telegram ID: ${telegramId}\n\n`;

    if (!config.adminTelegramId) {
        message += '⚠️ Административные функции не настроены\n';
        message += 'ADMIN_TELEGRAM_ID не установлен в конфигурации';
    } else if (BigInt(telegramId) === config.adminTelegramId) {
        message += '👑 Статус: Администратор\n\n';
        message += 'У вас есть доступ к административным командам:\n';
        message += '• /addreminder - добавить шаблон напоминания\n';
        message += '• /addreward - добавить шаблон награды\n';
        message += '• /deletemessage - удалить шаблон\n';
        message += '• /listmessages - показать все шаблоны';
    } else {
        message += '👤 Статус: Обычный пользователь\n\n';
        message += 'Вы можете использовать основные команды бота.\n';
        message += 'Используйте /help для просмотра доступных команд.';
    }

    await ctx.reply(message);
}
