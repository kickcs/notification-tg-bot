import dotenv from 'dotenv';

dotenv.config();

export const config = {
  botToken: process.env.BOT_TOKEN || '',
  databaseUrl: process.env.DATABASE_URL || '',
};

if (!config.botToken) {
  throw new Error('BOT_TOKEN не установлен в переменных окружения');
}

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL не установлен в переменных окружения');
}
