import { Context, NextFunction } from 'grammy';
import { config } from '../config';

export async function isAdmin(ctx: Context, next: NextFunction) {
  const telegramId = ctx.from?.id;

  if (!telegramId) {
    await ctx.reply('❌ Ошибка: не удалось определить пользователя');
    return;
  }

  if (!config.adminTelegramId) {
    await ctx.reply('❌ Административные функции не настроены');
    return;
  }

  if (BigInt(telegramId) !== config.adminTelegramId) {
    await ctx.reply('❌ У вас нет прав для выполнения этой команды');
    return;
  }

  await next();
}
