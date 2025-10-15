import { Bot } from 'grammy';
import { config } from './config';
import { prisma } from './lib/prisma';

const bot = new Bot(config.botToken);

bot.command('start', async (ctx) => {
  const telegramId = ctx.from?.id;
  const username = ctx.from?.username;
  const firstName = ctx.from?.first_name;
  const lastName = ctx.from?.last_name;

  if (!telegramId) {
    return ctx.reply('Ошибка: не удалось получить ваш ID');
  }

  try {
    const user = await prisma.user.upsert({
      where: { telegramId },
      update: {
        username,
        firstName,
        lastName,
      },
      create: {
        telegramId,
        username,
        firstName,
        lastName,
      },
    });

    await ctx.reply(
      `Добро пожаловать! Вы успешно зарегистрированы.\n\nВаш ID: ${user.id}`
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
      where: { telegramId },
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
      where: { telegramId },
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

bot.on('message', async (ctx) => {
  await ctx.reply(
    'Доступные команды:\n' +
    '/start - Регистрация\n' +
    '/notify <сообщение> - Создать уведомление\n' +
    '/history - Показать историю уведомлений'
  );
});

async function start() {
  try {
    await prisma.$connect();
    console.log('✅ Подключено к базе данных');
    
    bot.start();
    console.log('✅ Бот запущен');
  } catch (error) {
    console.error('❌ Ошибка при запуске:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\n⏹️  Остановка бота...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⏹️  Остановка бота...');
  await prisma.$disconnect();
  process.exit(0);
});

start();
