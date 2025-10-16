import dotenv from 'dotenv';

dotenv.config();

export const config = {
  botToken: process.env.BOT_TOKEN || '',
  databaseUrl: process.env.DATABASE_URL || '',
  adminTelegramId: process.env.ADMIN_TELEGRAM_ID ? BigInt(process.env.ADMIN_TELEGRAM_ID) : null,
};

if (!config.botToken) {
  throw new Error('BOT_TOKEN не установлен в переменных окружения');
}

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL не установлен в переменных окружения');
}

if (!config.adminTelegramId) {
  console.warn('⚠️ ADMIN_TELEGRAM_ID не установлен - административные функции недоступны');
}
