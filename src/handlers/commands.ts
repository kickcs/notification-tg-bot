import {Bot, Context} from 'grammy';
import {formatTimes, parseTimes, validateTimes} from '../utils/timeUtils';
import {createSchedule, deleteSchedule, getActiveSchedule, updateSchedule} from '../services/scheduleService';
import {registerCronTask, unregisterCronTasks} from '../scheduler/cronScheduler';
import {getBotInstance} from '../lib/bot';
import {isAdmin} from '../middleware/isAdmin';
import {createTemplate, deleteTemplate, getAllTemplates} from '../services/templateService';
import {config} from '../config';
import {
    createQuiz,
    getAllQuizzes,
    deleteQuiz,
    createQuestion,
    getQuestionsByQuiz,
    deleteQuestion,
    getAllQuestionsFromQuiz,
} from '../services/quizService';
import {
    createSession,
    getSession,
    updateSession,
    deleteSession,
    hasActiveSession,
    createQuestionAdditionState,
    getQuestionAdditionState,
    updateQuestionAdditionState,
    deleteQuestionAdditionState,
    hasQuestionAdditionState,
} from '../services/quizSessionManager';

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
    bot.command('setstatus', isAdmin, handleSetStatus);
    bot.command('clearstatus', isAdmin, handleClearStatus);

    bot.command('createquiz', isAdmin, handleCreateQuiz);
    bot.command('listquizzes', handleListQuizzes);
    bot.command('deletequiz', isAdmin, handleDeleteQuiz);
    bot.command('addquestion', isAdmin, handleAddQuestion);
    bot.command('listquestions', isAdmin, handleListQuestions);
    bot.command('deletequestion', isAdmin, handleDeleteQuestion);
    bot.command('startquiz', handleStartQuiz);
    bot.command('cancelquiz', handleCancelQuiz);

    bot.on('message:text', handleTextMessage);
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
        '🎯 Квиз-викторина:\n\n' +
        '🔹 /listquizzes - Показать все доступные квизы\n' +
        '🔹 /startquiz <название> - Начать квиз\n' +
        '   Пример: /startquiz Медицина\n\n' +
        '🔹 /cancelquiz - Отменить текущий квиз\n\n' +
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
            '   Пример: /listmessages reminder\n\n' +
            '🔸 /setstatus <telegramId> <статус> - Установить статус пользователю\n' +
            '   Пример: /setstatus 1248835061 Самая милая кошечка ❤️\n\n' +
            '🔸 /clearstatus <telegramId> - Удалить статус пользователя\n' +
            '   Пример: /clearstatus 1248835061\n\n' +
            '🎯 Управление квизами:\n\n' +
            '🔸 /createquiz <название> - Создать новый квиз\n' +
            '   Пример: /createquiz Медицина\n\n' +
            '🔸 /deletequiz <название> - Удалить квиз\n' +
            '   Пример: /deletequiz Медицина\n\n' +
            '🔸 /addquestion <название_квиза> - Добавить вопрос в квиз\n' +
            '   Пример: /addquestion Медицина\n\n' +
            '🔸 /listquestions <название_квиза> - Показать вопросы квиза\n' +
            '   Пример: /listquestions Медицина\n\n' +
            '🔸 /deletequestion <id> - Удалить вопрос\n' +
            '   Пример: /deletequestion abc-123-def';
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

    try {
        const {prisma} = await import('../lib/prisma');
        const user = await prisma.user.findUnique({where: {telegramId: BigInt(telegramId)}});

        let message = `👤 Ваша информация:\n\n`;
        message += `🆔 Telegram ID: ${telegramId}\n\n`;

        if (user?.customStatus) {
            message += `✨ Статус: ${user.customStatus}\n\n`;
        } else if (!config.adminTelegramId) {
            message += '⚠️ Административные функции не настроены\n';
            message += 'ADMIN_TELEGRAM_ID не установлен в конфигурации';
        } else if (BigInt(telegramId) === config.adminTelegramId) {
            message += '👑 Статус: Администратор\n\n';
        } else {
            message += '👤 Статус: Обычный пользователь\n\n';
        }

        if (config.adminTelegramId && BigInt(telegramId) === config.adminTelegramId) {
            message += 'У вас есть доступ к административным командам:\n';
            message += '• /addreminder - добавить шаблон напоминания\n';
            message += '• /addreward - добавить шаблон награды\n';
            message += '• /deletemessage - удалить шаблон\n';
            message += '• /listmessages - показать все шаблоны\n';
            message += '• /setstatus - установить статус пользователю\n';
            message += '• /clearstatus - удалить статус пользователя';
        } else if (!user?.customStatus) {
            message += 'Вы можете использовать основные команды бота.\n';
            message += 'Используйте /help для просмотра доступных команд.';
        }

        await ctx.reply(message);
    } catch (error) {
        console.error('Ошибка при получении информации о пользователе:', error);
        await ctx.reply('❌ Произошла ошибка при получении информации');
    }
}

async function handleSetStatus(ctx: Context) {
    const input = ctx.match?.toString().trim();

    if (!input) {
        return ctx.reply(
            '⚠️ Использование: /setstatus <telegramId> <статус>\n\n' +
            'Пример: /setstatus 1248835061 Самая милая кошечка ❤️'
        );
    }

    const parts = input.split(' ');
    if (parts.length < 2) {
        return ctx.reply(
            '⚠️ Укажите Telegram ID и статус\n\n' +
            'Пример: /setstatus 1248835061 Самая милая кошечка ❤️'
        );
    }

    const targetTelegramId = parts[0];
    const status = parts.slice(1).join(' ');

    if (!/^\d+$/.test(targetTelegramId)) {
        return ctx.reply('❌ Telegram ID должен содержать только цифры');
    }

    try {
        const {prisma} = await import('../lib/prisma');
        const user = await prisma.user.findUnique({
            where: {telegramId: BigInt(targetTelegramId)}
        });

        if (!user) {
            return ctx.reply(`❌ Пользователь с ID ${targetTelegramId} не найден`);
        }

        await prisma.user.update({
            where: {telegramId: BigInt(targetTelegramId)},
            data: {customStatus: status}
        });

        await ctx.reply(`✅ Статус установлен для пользователя ${targetTelegramId}\n\n📝 Статус: ${status}`);
    } catch (error) {
        console.error('Ошибка при установке статуса:', error);
        await ctx.reply('❌ Произошла ошибка при установке статуса');
    }
}

async function handleClearStatus(ctx: Context) {
    const input = ctx.match?.toString().trim();

    if (!input) {
        return ctx.reply(
            '⚠️ Использование: /clearstatus <telegramId>\n\n' +
            'Пример: /clearstatus 1248835061'
        );
    }

    const targetTelegramId = input;

    if (!/^\d+$/.test(targetTelegramId)) {
        return ctx.reply('❌ Telegram ID должен содержать только цифры');
    }

    try {
        const {prisma} = await import('../lib/prisma');
        const user = await prisma.user.findUnique({
            where: {telegramId: BigInt(targetTelegramId)}
        });

        if (!user) {
            return ctx.reply(`❌ Пользователь с ID ${targetTelegramId} не найден`);
        }

        if (!user.customStatus) {
            return ctx.reply(`⚠️ У пользователя ${targetTelegramId} нет кастомного статуса`);
        }

        await prisma.user.update({
            where: {telegramId: BigInt(targetTelegramId)},
            data: {customStatus: null}
        });

        await ctx.reply(`✅ Статус удален для пользователя ${targetTelegramId}`);
    } catch (error) {
        console.error('Ошибка при удалении статуса:', error);
        await ctx.reply('❌ Произошла ошибка при удалении статуса');
    }
}

async function handleCreateQuiz(ctx: Context) {
    const input = ctx.match?.toString().trim();

    if (!input) {
        return ctx.reply(
            '⚠️ Использование: /createquiz <название>\n\n' +
            'Пример: /createquiz Медицина'
        );
    }

    try {
        const quiz = await createQuiz(input);
        await ctx.reply(
            `✅ Квиз '${quiz.name}' создан!\n\n` +
            `Добавьте вопросы с помощью /addquestion ${quiz.name}`
        );
    } catch (error) {
        console.error('Ошибка при создании квиза:', error);
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        await ctx.reply(`❌ ${errorMessage}`);
    }
}

async function handleListQuizzes(ctx: Context) {
    const telegramId = ctx.from?.id;
    const isAdminUser = telegramId && config.adminTelegramId && BigInt(telegramId) === config.adminTelegramId;

    try {
        const quizzes = await getAllQuizzes(!isAdminUser);

        if (quizzes.length === 0) {
            return ctx.reply('📭 Квизы не найдены');
        }

        let message = '📋 Список квизов:\n\n';

        quizzes.forEach((quiz, index) => {
            const status = isAdminUser ? (quiz.isActive ? '✅' : '❌') : '';
            message += `${index + 1}. ${status} ${quiz.name}\n`;
            message += `   📝 Вопросов: ${quiz._count.questions}\n`;
            if (quiz.description) {
                message += `   ℹ️ ${quiz.description}\n`;
            }
            message += '\n';
        });

        message += `📊 Всего: ${quizzes.length} квизов`;

        await ctx.reply(message);
    } catch (error) {
        console.error('Ошибка при получении списка квизов:', error);
        await ctx.reply('❌ Произошла ошибка при получении списка квизов');
    }
}

async function handleDeleteQuiz(ctx: Context) {
    const input = ctx.match?.toString().trim();

    if (!input) {
        return ctx.reply(
            '⚠️ Использование: /deletequiz <название>\n\n' +
            'Пример: /deletequiz Медицина'
        );
    }

    try {
        const {quiz, questionCount} = await deleteQuiz(input);
        await ctx.reply(
            `✅ Квиз '${quiz.name}' удален вместе с ${questionCount} вопросами`
        );
    } catch (error) {
        console.error('Ошибка при удалении квиза:', error);
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        await ctx.reply(`❌ ${errorMessage}`);
    }
}

async function handleAddQuestion(ctx: Context) {
    const telegramId = ctx.from?.id;
    const input = ctx.match?.toString().trim();

    if (!telegramId) {
        return ctx.reply('❌ Не удалось получить информацию о пользователе');
    }

    if (!input) {
        return ctx.reply(
            '⚠️ Использование: /addquestion <название_квиза>\n\n' +
            'Пример: /addquestion Медицина'
        );
    }

    try {
        const quiz = await getAllQuizzes(true);
        const foundQuiz = quiz.find(q => q.name === input);

        if (!foundQuiz) {
            return ctx.reply(`❌ Квиз '${input}' не найден`);
        }

        createQuestionAdditionState({
            userId: BigInt(telegramId),
            quizName: input,
            options: [],
            step: 'question',
        });

        await ctx.reply(`📝 Отправьте текст вопроса для квиза '${input}'\n\nДля отмены используйте /cancel`);
    } catch (error) {
        console.error('Ошибка при начале добавления вопроса:', error);
        await ctx.reply('❌ Произошла ошибка');
    }
}

async function handleTextMessage(ctx: Context) {
    const telegramId = ctx.from?.id;
    const text = ctx.message?.text;

    if (!telegramId || !text) {
        return;
    }

    if (text === '/cancel') {
        if (hasQuestionAdditionState(BigInt(telegramId))) {
            deleteQuestionAdditionState(BigInt(telegramId));
            return ctx.reply('❌ Добавление вопроса отменено');
        }
        return;
    }

    const state = getQuestionAdditionState(BigInt(telegramId));

    if (!state) {
        return;
    }

    if (state.step === 'question') {
        updateQuestionAdditionState(BigInt(telegramId), {
            questionText: text,
            step: 'options',
        });
        return ctx.reply('📝 Отправьте вариант ответа 1 (всего нужно 4 варианта)');
    }

    if (state.step === 'options') {
        const newOptions = [...state.options, text];
        updateQuestionAdditionState(BigInt(telegramId), {
            options: newOptions,
        });

        if (newOptions.length < 4) {
            return ctx.reply(`📝 Отправьте вариант ответа ${newOptions.length + 1} (всего нужно 4 варианта)`);
        }

        let message = '📋 Варианты ответов:\n\n';
        newOptions.forEach((opt, i) => {
            message += `${i + 1}. ${opt}\n`;
        });
        message += '\n📝 Введите номер правильного ответа (1-4)';

        updateQuestionAdditionState(BigInt(telegramId), {
            step: 'correct_answer',
        });

        return ctx.reply(message);
    }

    if (state.step === 'correct_answer') {
        const correctIndex = parseInt(text);

        if (isNaN(correctIndex) || correctIndex < 1 || correctIndex > 4) {
            return ctx.reply('❌ Введите число от 1 до 4');
        }

        try {
            const options = state.options.map((opt, i) => ({
                text: opt,
                isCorrect: i === correctIndex - 1,
            }));

            const {question, totalQuestions} = await createQuestion(
                state.quizName,
                state.questionText!,
                options
            );

            deleteQuestionAdditionState(BigInt(telegramId));

            await ctx.reply(
                `✅ Вопрос добавлен в квиз '${state.quizName}'!\n\n` +
                `📊 Всего вопросов: ${totalQuestions}`
            );
        } catch (error) {
            console.error('Ошибка при создании вопроса:', error);
            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
            await ctx.reply(`❌ ${errorMessage}`);
            deleteQuestionAdditionState(BigInt(telegramId));
        }
    }
}

async function handleListQuestions(ctx: Context) {
    const input = ctx.match?.toString().trim();

    if (!input) {
        return ctx.reply(
            '⚠️ Использование: /listquestions <название_квиза>\n\n' +
            'Пример: /listquestions Медицина'
        );
    }

    try {
        const questions = await getQuestionsByQuiz(input);

        if (questions.length === 0) {
            return ctx.reply(
                `📭 В квизе '${input}' пока нет вопросов.\n\n` +
                `Добавьте вопросы с помощью /addquestion ${input}`
            );
        }

        const maxToShow = 20;
        const questionsToShow = questions.slice(0, maxToShow);

        let message = `📋 Вопросы квиза '${input}':\n\n`;

        questionsToShow.forEach((q, index) => {
            message += `${index + 1}. ${q.questionText}\n`;
            message += `   🆔 ${q.id}\n`;
            q.options.forEach((opt, i) => {
                const marker = opt.isCorrect ? '✅' : '  ';
                message += `   ${marker} ${i + 1}) ${opt.optionText}\n`;
            });
            message += '\n';
        });

        if (questions.length > maxToShow) {
            message += `\n📊 Показано ${maxToShow} из ${questions.length} вопросов`;
        } else {
            message += `📊 Всего: ${questions.length} вопросов`;
        }

        await ctx.reply(message);
    } catch (error) {
        console.error('Ошибка при получении вопросов:', error);
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        await ctx.reply(`❌ ${errorMessage}`);
    }
}

async function handleDeleteQuestion(ctx: Context) {
    const input = ctx.match?.toString().trim();

    if (!input) {
        return ctx.reply(
            '⚠️ Использование: /deletequestion <id>\n\n' +
            'Пример: /deletequestion abc-123-def\n\n' +
            'Используйте /listquestions для просмотра ID вопросов'
        );
    }

    try {
        const question = await deleteQuestion(input);
        await ctx.reply(
            `✅ Вопрос удален!\n\n` +
            `📝 ${question.questionText}`
        );
    } catch (error) {
        console.error('Ошибка при удалении вопроса:', error);
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        await ctx.reply(`❌ ${errorMessage}`);
    }
}

async function handleStartQuiz(ctx: Context) {
    const telegramId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    const input = ctx.match?.toString().trim();

    if (!telegramId || !chatId) {
        return ctx.reply('❌ Не удалось получить информацию');
    }

    if (!input) {
        return ctx.reply(
            '⚠️ Использование: /startquiz <название>\n\n' +
            'Пример: /startquiz Медицина\n\n' +
            'Используйте /listquizzes для просмотра доступных квизов'
        );
    }

    if (hasActiveSession(BigInt(telegramId), BigInt(chatId))) {
        return ctx.reply(
            '⚠️ У вас уже есть активный квиз.\n\n' +
            'Завершите его или используйте /cancelquiz'
        );
    }

    try {
        const questions = await getAllQuestionsFromQuiz(input);

        if (questions.length === 0) {
            return ctx.reply(`❌ Квиз '${input}' пока не содержит вопросов`);
        }

        createSession({
            userId: BigInt(telegramId),
            chatId: BigInt(chatId),
            quizName: input,
            questions,
            currentIndex: 0,
            correctCount: 0,
            incorrectCount: 0,
        });

        await sendQuizQuestion(ctx, BigInt(telegramId), BigInt(chatId));
    } catch (error) {
        console.error('Ошибка при запуске квиза:', error);
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        await ctx.reply(`❌ ${errorMessage}`);
    }
}

async function sendQuizQuestion(ctx: Context, userId: bigint, chatId: bigint) {
    const session = getSession(userId, chatId);

    if (!session) {
        return;
    }

    const question = session.questions[session.currentIndex];
    const questionNumber = session.currentIndex + 1;
    const totalQuestions = session.questions.length;

    const keyboard = {
        inline_keyboard: question.options.map(opt => [{
            text: opt.text,
            callback_data: `quiz_answer:${userId}_${chatId}:${opt.id}`,
        }]),
    };

    await ctx.reply(
        `📝 Вопрос ${questionNumber}/${totalQuestions}\n\n` +
        `${question.questionText}`,
        {reply_markup: keyboard}
    );
}

async function handleCancelQuiz(ctx: Context) {
    const telegramId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!telegramId || !chatId) {
        return ctx.reply('❌ Не удалось получить информацию');
    }

    if (!hasActiveSession(BigInt(telegramId), BigInt(chatId))) {
        return ctx.reply('⚠️ У вас нет активного квиза');
    }

    deleteSession(BigInt(telegramId), BigInt(chatId));
    await ctx.reply('❌ Квиз отменен. Вы можете начать новый с помощью /startquiz');
}
