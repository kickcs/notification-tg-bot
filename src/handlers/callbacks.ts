import { Bot, Context } from 'grammy';
import { confirmReminder, getReminder } from '../services/reminderService';
import { getRandomTemplate } from '../services/templateService';
import { cancelRetry } from '../scheduler/cronScheduler';
import { getSession, updateSession, deleteSession } from '../services/quizSessionManager';
import { MyContext } from '../types/context';

export function registerCallbacks(bot: Bot<MyContext>) {
  bot.callbackQuery(/^confirm_reminder:(.+)$/, handleConfirmReminder);
  bot.callbackQuery(/^qa:(.+):(.+)$/, handleQuizAnswer);
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
    
    try {
      await ctx.deleteMessage();
    } catch (error) {
      console.error('Не удалось удалить сообщение:', error);
      try {
        await ctx.editMessageText('✅ Подтверждено!');
        await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
      } catch (editError) {
        console.error('Не удалось отредактировать сообщение:', editError);
      }
    }
    
    await ctx.reply(rewardMessage);

    console.log(`✅ Напоминание ${reminderId} подтверждено пользователем ${userId}`);
  } catch (error) {
    console.error('Ошибка при подтверждении напоминания:', error);
    await ctx.answerCallbackQuery({ text: 'Произошла ошибка' });
  }
}

async function handleQuizAnswer(ctx: Context) {
  const match = ctx.callbackQuery?.data?.match(/^qa:(.+):(.+)$/);
  
  if (!match) {
    return ctx.answerCallbackQuery({ text: 'Ошибка: некорректные данные' });
  }

  const sessionKey = match[1];
  const optionIndex = parseInt(match[2]);
  const userId = ctx.from?.id;

  if (!userId) {
    return ctx.answerCallbackQuery({ text: 'Ошибка: не удалось получить ваш ID' });
  }

  const [sessionUserId, sessionChatId] = sessionKey.split('_');
  
  if (BigInt(userId) !== BigInt(sessionUserId)) {
    return ctx.answerCallbackQuery({ 
      text: 'Это не ваш квиз',
      show_alert: true 
    });
  }

  const session = getSession(BigInt(sessionUserId), BigInt(sessionChatId));

  if (!session) {
    return ctx.answerCallbackQuery({ text: 'Сессия квиза не найдена' });
  }

  const currentQuestion = session.questions[session.currentIndex];
  const selectedOption = currentQuestion.options[optionIndex];

  if (!selectedOption) {
    return ctx.answerCallbackQuery({ text: 'Ошибка: вариант ответа не найден' });
  }

  const isCorrect = selectedOption.isCorrect;
  const correctOption = currentQuestion.options.find(opt => opt.isCorrect);

  try {
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
  } catch (error) {
    console.error('Не удалось убрать кнопки:', error);
  }

  if (isCorrect) {
    updateSession(BigInt(sessionUserId), BigInt(sessionChatId), {
      correctCount: session.correctCount + 1,
    });
    await ctx.answerCallbackQuery({ text: '✅ Правильно!' });
    await ctx.reply('✅ Правильно!');
  } else {
    updateSession(BigInt(sessionUserId), BigInt(sessionChatId), {
      incorrectCount: session.incorrectCount + 1,
    });
    await ctx.answerCallbackQuery({ text: '❌ Неправильно' });
    await ctx.reply(`❌ Неправильно!\n\nПравильный ответ: ${correctOption?.text}`);
  }

  const updatedSession = getSession(BigInt(sessionUserId), BigInt(sessionChatId));

  if (!updatedSession) {
    return;
  }

  if (updatedSession.currentIndex + 1 < updatedSession.questions.length) {
    updateSession(BigInt(sessionUserId), BigInt(sessionChatId), {
      currentIndex: updatedSession.currentIndex + 1,
    });

    await sendNextQuestion(ctx, BigInt(sessionUserId), BigInt(sessionChatId));
  } else {
    await showFinalStatistics(ctx, updatedSession);
    deleteSession(BigInt(sessionUserId), BigInt(sessionChatId));
  }
}

async function sendNextQuestion(ctx: Context, userId: bigint, chatId: bigint) {
  const session = getSession(userId, chatId);

  if (!session) {
    return;
  }

  const question = session.questions[session.currentIndex];
  const questionNumber = session.currentIndex + 1;
  const totalQuestions = session.questions.length;

  const keyboard = {
    inline_keyboard: question.options.map((opt, index) => [{
      text: opt.text,
      callback_data: `qa:${userId}_${chatId}:${index}`,
    }]),
  };

  await ctx.reply(
    `📝 Вопрос ${questionNumber}/${totalQuestions}\n\n` +
    `${question.questionText}`,
    {reply_markup: keyboard}
  );
}

async function showFinalStatistics(ctx: Context, session: {
  quizName: string;
  questions: unknown[];
  correctCount: number;
  incorrectCount: number;
}) {
  const totalQuestions = session.questions.length;
  const percentage = Math.round((session.correctCount / totalQuestions) * 100);

  let message = '🎉 Квиз завершен!\n\n';
  message += `📊 Результаты квиза "${session.quizName}":\n\n`;
  message += `✅ Правильно: ${session.correctCount}\n`;
  message += `❌ Неправильно: ${session.incorrectCount}\n`;
  message += `📊 Результат: ${percentage}%\n\n`;

  if (percentage === 100) {
    message += '🏆 Идеально! Все ответы верны!';
  } else if (percentage >= 80) {
    message += '🎉 Отличный результат!';
  } else if (percentage >= 60) {
    message += '👍 Хороший результат!';
  } else if (percentage >= 40) {
    message += '💪 Неплохо! Попробуйте еще раз!';
  } else {
    message += '📚 Попробуйте еще раз!';
  }

  await ctx.reply(message);
}
