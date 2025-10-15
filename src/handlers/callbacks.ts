import { Bot, Context } from 'grammy';
import { confirmReminder, getReminder } from '../services/reminderService';
import { getRandomTemplate } from '../services/templateService';
import { cancelRetry } from '../scheduler/cronScheduler';

export function registerCallbacks(bot: Bot) {
  bot.callbackQuery(/^confirm_reminder:(.+)$/, handleConfirmReminder);
}

async function handleConfirmReminder(ctx: Context) {
  const match = ctx.callbackQuery?.data?.match(/^confirm_reminder:(.+)$/);
  
  if (!match) {
    return ctx.answerCallbackQuery({ text: 'Ошибка: некорректные данные' });
  }

  const reminderId = match[1];
  const userId = ctx.from?.id;

  if (!userId) {
    return ctx.answerCallbackQuery({ text: 'Ошибка: не удалось получить ваш ID' });
  }

  try {
    const reminder = await getReminder(reminderId);

    if (!reminder) {
      return ctx.answerCallbackQuery({ text: 'Напоминание не найдено' });
    }

    if (reminder.status === 'confirmed') {
      return ctx.answerCallbackQuery({ text: 'Вы уже подтвердили это напоминание' });
    }

    if (BigInt(userId) !== reminder.schedule.user.telegramId) {
      return ctx.answerCallbackQuery({ 
        text: 'Это напоминание не для вас',
        show_alert: true 
      });
    }

    await confirmReminder(reminderId);
    cancelRetry(reminderId);

    await ctx.answerCallbackQuery({ text: '✅ Подтверждено!' });

    const rewardMessage = await getRandomTemplate('reward');
    
    await ctx.reply(rewardMessage);

    console.log(`✅ Напоминание ${reminderId} подтверждено пользователем ${userId}`);
  } catch (error) {
    console.error('Ошибка при подтверждении напоминания:', error);
    await ctx.answerCallbackQuery({ text: 'Произошла ошибка' });
  }
}
