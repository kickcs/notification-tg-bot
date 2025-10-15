import {Bot, Context} from 'grammy';
import {formatTimes, parseTimes, validateTimes} from '../utils/timeUtils';
import {createSchedule, deleteSchedule, getActiveSchedule, updateSchedule} from '../services/scheduleService';
import {registerCronTask, unregisterCronTasks} from '../scheduler/cronScheduler';
import {getBotInstance} from '../lib/bot';

export function registerCommands(bot: Bot) {
    bot.command('setreminder', handleSetReminder);
    bot.command('myreminders', handleMyReminders);
    bot.command('editreminder', handleEditReminder);
    bot.command('deletereminder', handleDeleteReminder);
    bot.command('help', handleHelp);
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
    await ctx.reply(
        '📚 Доступные команды:\n\n' +
        '🔹 /setreminder <время> - Создать расписание напоминаний\n' +
        '   Пример: /setreminder 09:00,14:00,21:00\n\n' +
        '🔹 /myreminders - Показать текущее расписание\n\n' +
        '🔹 /editreminder <время> - Изменить расписание\n' +
        '   Пример: /editreminder 10:00,16:00\n\n' +
        '🔹 /deletereminder - Удалить расписание\n\n' +
        '🔹 /help - Показать эту справку\n\n' +
        '💡 Формат времени: HH:MM (24-часовой)\n' +
        '💡 Несколько времен указывайте через запятую'
    );
}
