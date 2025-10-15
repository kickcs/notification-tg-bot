import { Bot } from 'grammy';
import { config } from './config';
import { prisma } from './lib/prisma';
import { registerCommands } from './handlers/commands';
import { registerCallbacks } from './handlers/callbacks';
import { initializeScheduler, stopAllTasks } from './scheduler/cronScheduler';
import { setBotInstance } from './lib/bot';

const bot = new Bot(config.botToken);
setBotInstance(bot);

bot.command('start', async (ctx) => {
  const telegramId = ctx.from?.id;
  const username = ctx.from?.username;
  const firstName = ctx.from?.first_name;
  const lastName = ctx.from?.last_name;
  const chatId = ctx.chat?.id;

  if (!telegramId) {
    return ctx.reply('Ошибка: не удалось получить ваш ID');
  }

  try {
    const user = await prisma.user.upsert({
      where: { telegramId: BigInt(telegramId) },
      update: {
        username,
        firstName,
        lastName,
        chatId: chatId ? BigInt(chatId) : null,
      },
      create: {
        telegramId: BigInt(telegramId),
        username,
        firstName,
        lastName,
        chatId: chatId ? BigInt(chatId) : null,
      },
    });

    const chatType = ctx.chat?.type;
    const isGroup = chatType === 'group' || chatType === 'supergroup';

    await ctx.reply(
      `Добро пожаловать! Вы успешно зарегистрированы.\n\n` +
      `${isGroup ? '👥 Бот готов к работе в группе!\n\n' : ''}` +
      `Используйте /help для просмотра доступных команд.`
    );
  } catch (error) {
    console.error('Ошибка при регистрации пользователя:', error);
    await ctx.reply('Произошла ошибка при регистрации');
  }
});

bot.command('notify', async (ctx) => {
  const telegramId = ctx.from?.id;
  const message = ctx.match;

  if (!telegramId) {
    return ctx.reply('Ошибка: не удалось получить ваш ID');
  }

  if (!message) {
    return ctx.reply('Использование: /notify <сообщение>');
  }

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
    });

    if (!user) {
      return ctx.reply('Вы не зарегистрированы. Используйте /start');
    }

    await prisma.notification.create({
      data: {
        userId: user.id,
        message: message.toString(),
      },
    });

    await ctx.reply('Уведомление сохранено!');
  } catch (error) {
    console.error('Ошибка при создании уведомления:', error);
    await ctx.reply('Произошла ошибка при сохранении уведомления');
  }
});

bot.command('history', async (ctx) => {
  const telegramId = ctx.from?.id;

  if (!telegramId) {
    return ctx.reply('Ошибка: не удалось получить ваш ID');
  }

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      include: {
        notifications: {
          orderBy: { sentAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!user) {
      return ctx.reply('Вы не зарегистрированы. Используйте /start');
    }

    if (user.notifications.length === 0) {
      return ctx.reply('У вас пока нет уведомлений');
    }

    const history = user.notifications
      .map((n, i) => `${i + 1}. ${n.message} (${n.sentAt.toLocaleString()})`)
      .join('\n\n');

    await ctx.reply(`Ваши последние уведомления:\n\n${history}`);
  } catch (error) {
    console.error('Ошибка при получении истории:', error);
    await ctx.reply('Произошла ошибка при получении истории');
  }
});

registerCommands(bot);
registerCallbacks(bot);

bot.on('message:text', async (ctx) => {
  if (ctx.message?.text?.startsWith('/')) {
    return;
  }
  
  await ctx.reply(
    'Доступные команды:\n' +
    '/start - Регистрация\n' +
    '/setreminder - Создать расписание напоминаний\n' +
    '/myreminders - Показать расписание\n' +
    '/help - Справка по всем командам'
  );
});

async function start() {
  try {
    await prisma.$connect();
    console.log('✅ Подключено к базе данных');
    
    await initializeScheduler(bot);
    
    bot.start();
    console.log('✅ Бот запущен');
  } catch (error) {
    console.error('❌ Ошибка при запуске:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\n⏹️  Остановка бота...');
  stopAllTasks();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⏹️  Остановка бота...');
  stopAllTasks();
  await prisma.$disconnect();
  process.exit(0);
});

start();
