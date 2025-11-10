import { Bot, Context, InlineKeyboard } from 'grammy';
import { confirmReminder, getReminder } from '../services/reminderService';
import { getRandomTemplate } from '../services/templateService';
import { cancelRetry, scheduleNextSequentialReminder } from '../scheduler/cronScheduler';
import { getSession, updateSession, deleteSession } from '../services/quizSessionManager';
import { MyContext } from '../types/context';
import { config } from '../config';
import { QuizAnswer } from '../types/quiz';
import { calculateDelayAmount, getDelayDescription } from '../utils/timeUtils';
import { getUserMaxDelay, updateUserByTelegramId, getUserSettings, getUserByTelegramId, InvalidDelayError } from '../services/userService';
import { getBotInstance } from '../lib/bot';

export function registerCallbacks(bot: Bot<MyContext>) {
  bot.callbackQuery(/^confirm_reminder:(.+)$/, handleConfirmReminder);
  bot.callbackQuery(/^qa:(.+):(.+)$/, handleQuizAnswer);
  bot.callbackQuery(/^add_question:(.+)$/, handleAddQuestionButton);
  bot.callbackQuery(/^list_questions:(.+)$/, handleListQuestionsButton);
  bot.callbackQuery(/^finish_adding:(.+)$/, handleFinishAddingButton);
  bot.callbackQuery(/^settings_sequential:(.+)$/, handleSettingsSequential);
  bot.callbackQuery(/^settings_delay:(.+)$/, handleSettingsDelay);
  bot.callbackQuery(/^settings_back$/, handleSettingsBack);
}
async function handleConfirmReminder(ctx: MyContext) {
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

    const now = new Date();
    let delayMinutes: number | undefined;

    // Если это последовательное расписание, рассчитываем задержку
    if (reminder.schedule.useSequentialDelay) {
      const scheduledTime = reminder.schedule.times[reminder.sequenceOrder];
      const actualDelay = calculateDelayAmount(now, scheduledTime);
      const maxDelay = await getUserMaxDelay(reminder.schedule.user.telegramId);
      delayMinutes = Math.min(actualDelay, maxDelay);
    }

    await confirmReminder(reminderId, delayMinutes);
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

    // Добавляем информацию о задержке, если она есть
    let messageToSend = rewardMessage;
    if (delayMinutes && delayMinutes > 0) {
      const delayDescription = getDelayDescription(delayMinutes);
      messageToSend += `\n\n⏰ Следующее уведомление придет с задержкой в ${delayDescription}`;
    }

    await ctx.reply(messageToSend);

    // Планируем следующее последовательное уведомление
    if (reminder.schedule.useSequentialDelay) {
      await scheduleNextSequentialReminder(getBotInstance(), reminderId);
    }

    console.log(`✅ Напоминание ${reminderId} подтверждено пользователем ${userId}${delayMinutes ? ` (задержка: ${delayMinutes} мин)` : ''}`);
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

  await ctx.answerCallbackQuery();

  const answer = {
    questionText: currentQuestion.questionText,
    selectedOption: selectedOption.text,
    correctOption: correctOption?.text || '',
    isCorrect,
  };

  if (isCorrect) {
    updateSession(BigInt(sessionUserId), BigInt(sessionChatId), {
      correctCount: session.correctCount + 1,
      answers: [...session.answers, answer],
    });
  } else {
    updateSession(BigInt(sessionUserId), BigInt(sessionChatId), {
      incorrectCount: session.incorrectCount + 1,
      answers: [...session.answers, answer],
    });
  }

  const updatedSession = getSession(BigInt(sessionUserId), BigInt(sessionChatId));

  if (!updatedSession) {
    return;
  }

  if (updatedSession.currentIndex + 1 < updatedSession.questions.length) {
    updateSession(BigInt(sessionUserId), BigInt(sessionChatId), {
      currentIndex: updatedSession.currentIndex + 1,
    });

    await editToNextQuestion(ctx, BigInt(sessionUserId), BigInt(sessionChatId), isCorrect, correctOption?.text);
  } else {
    try {
      let resultText = '';
      
      if (isCorrect) {
        resultText = '✅ Правильно!';
      } else {
        resultText = `❌ Неправильно!\n\nПравильный ответ: ${correctOption?.text}`;
      }
      
      await ctx.editMessageText(resultText);
      await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
    } catch (error) {
      console.error('Не удалось отредактировать сообщение:', error);
    }
    
    await showFinalStatistics(ctx, updatedSession);
    deleteSession(BigInt(sessionUserId), BigInt(sessionChatId));
  }
}

async function editToNextQuestion(ctx: Context, userId: bigint, chatId: bigint, wasCorrect: boolean, correctAnswer?: string) {
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

  let messageText = '';
  
  if (wasCorrect) {
    messageText = `✅ Правильно!\n\n`;
  } else {
    messageText = `❌ Неправильно!\nПравильный ответ: ${correctAnswer}\n\n`;
  }
  
  messageText += `📝 Вопрос ${questionNumber}/${totalQuestions}\n\n${question.questionText}`;

  try {
    await ctx.editMessageText(messageText);
    await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
  } catch (error) {
    console.error('Не удалось отредактировать сообщение:', error);
    await ctx.reply(messageText, {reply_markup: keyboard});
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
  userId: bigint;
  quizName: string;
  questions: unknown[];
  correctCount: number;
  incorrectCount: number;
  answers: QuizAnswer[];
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

  if (config.adminTelegramId) {
    await sendResultsToAdmin(ctx, session);
  }
}

async function sendResultsToAdmin(ctx: Context, session: {
  userId: bigint;
  quizName: string;
  correctCount: number;
  incorrectCount: number;
  answers: QuizAnswer[];
}) {
  const user = ctx.from;
  const userName = user?.first_name || 'Неизвестный';
  const userUsername = user?.username ? `@${user.username}` : '';
  const totalQuestions = session.answers.length;
  const percentage = Math.round((session.correctCount / totalQuestions) * 100);

  const MAX_MESSAGE_LENGTH = 4000;

  let headerMessage = `📊 Результаты квиза\n\n`;
  headerMessage += `👤 Пользователь: ${userName} ${userUsername}\n`;
  headerMessage += `🆔 ID: ${session.userId}\n`;
  headerMessage += `📝 Квиз: ${session.quizName}\n\n`;
  headerMessage += `✅ Правильно: ${session.correctCount}\n`;
  headerMessage += `❌ Неправильно: ${session.incorrectCount}\n`;
  headerMessage += `📊 Результат: ${percentage}%\n\n`;

  try {
    await ctx.api.sendMessage(Number(config.adminTelegramId), headerMessage);

    let currentMessage = `📋 Ответы:\n\n`;
    let messageCount = 1;

    for (let index = 0; index < session.answers.length; index++) {
      const answer = session.answers[index];
      const icon = answer.isCorrect ? '✅' : '❌';
      
      let answerText = `${index + 1}. ${answer.questionText}\n`;
      answerText += `   ${icon} Выбрано: ${answer.selectedOption}\n`;
      if (!answer.isCorrect) {
        answerText += `   ✓ Правильно: ${answer.correctOption}\n`;
      }
      answerText += `\n`;

      if (currentMessage.length + answerText.length > MAX_MESSAGE_LENGTH) {
        await ctx.api.sendMessage(Number(config.adminTelegramId), currentMessage);
        messageCount++;
        currentMessage = `📋 Ответы (продолжение ${messageCount}):\n\n`;
      }

      currentMessage += answerText;
    }

    if (currentMessage.length > 20) {
      await ctx.api.sendMessage(Number(config.adminTelegramId), currentMessage);
    }
  } catch (error) {
    console.error('Не удалось отправить результаты администратору:', error);
  }
}

async function handleAddQuestionButton(ctx: MyContext) {
  const match = ctx.callbackQuery?.data?.match(/^add_question:(.+)$/);
  
  if (!match) {
    return ctx.answerCallbackQuery({ text: 'Ошибка: некорректные данные' });
  }

  const quizName = match[1];
  
  await ctx.answerCallbackQuery();
  
  try {
    await ctx.deleteMessage();
  } catch (error) {
    console.error('Не удалось удалить сообщение:', error);
  }
  
  if (!ctx.session) {
    ctx.session = {};
  }
  ctx.session.quizName = quizName;
  await ctx.conversation.enter('addQuestion');
}

async function handleListQuestionsButton(ctx: Context) {
  const match = ctx.callbackQuery?.data?.match(/^list_questions:(.+)$/);
  
  if (!match) {
    return ctx.answerCallbackQuery({ text: 'Ошибка: некорректные данные' });
  }

  const quizName = match[1];
  
  await ctx.answerCallbackQuery();
  
  try {
    await ctx.deleteMessage();
  } catch (error) {
    console.error('Не удалось удалить сообщение:', error);
  }
  
  const {getAllQuestionsFromQuiz} = await import('../services/quizService');
  
  try {
    const questions = await getAllQuestionsFromQuiz(quizName);
    
    if (questions.length === 0) {
      return ctx.reply(`📭 В квизе '${quizName}' пока нет вопросов`);
    }

    let message = `📋 Вопросы квиза '${quizName}':\n\n`;

    questions.forEach((q: {id: string; questionText: string; options: {text: string; isCorrect: boolean}[]}, index: number) => {
      message += `${index + 1}. ${q.questionText}\n`;
      q.options.forEach((opt, i) => {
        const marker = opt.isCorrect ? '✅' : '  ';
        message += `   ${marker} ${i + 1}) ${opt.text}\n`;
      });
      message += `   🆔 ID: ${q.id}\n\n`;
    });

    message += `📊 Всего: ${questions.length} вопросов`;

    await ctx.reply(message);
  } catch (error) {
    console.error('Ошибка при получении вопросов:', error);
    await ctx.reply('❌ Произошла ошибка при получении списка вопросов');
  }
}

async function handleFinishAddingButton(ctx: Context) {
  const match = ctx.callbackQuery?.data?.match(/^finish_adding:(.+)$/);

  if (!match) {
    return ctx.answerCallbackQuery({ text: 'Ошибка: некорректные данные' });
  }

  const quizName = match[1];

  await ctx.answerCallbackQuery({ text: '✅ Завершено!' });

  try {
    await ctx.editMessageText(
      `✅ Квиз '${quizName}' готов!\n\n` +
      `Используйте /startquiz ${quizName} для запуска`
    );
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
  } catch (error) {
    console.error('Не удалось отредактировать сообщение:', error);
    try {
      await ctx.deleteMessage();
      await ctx.reply(
        `✅ Квиз '${quizName}' готов!\n\n` +
        `Используйте /startquiz ${quizName} для запуска`
      );
    } catch (deleteError) {
      console.error('Не удалось удалить сообщение:', deleteError);
    }
  }
}

async function handleSettingsSequential(ctx: MyContext) {
  const match = ctx.callbackQuery?.data?.match(/^settings_sequential:(.+)$/);

  if (!match) {
    return ctx.answerCallbackQuery({ text: 'Ошибка: некорректные данные' });
  }

  const value = match[1];
  const isEnabled = value === 'true';
  const userId = ctx.from?.id;

  if (!userId) {
    return ctx.answerCallbackQuery({ text: 'Ошибка: не удалось получить ваш ID' });
  }

  try {
    await updateUserByTelegramId(BigInt(userId), { sequentialMode: isEnabled });
    await ctx.answerCallbackQuery({ text: `✅ Режим ${isEnabled ? 'включен' : 'выключен'}` });

    await showSettingsMenu(ctx);
  } catch (error) {
    console.error('Ошибка при обновлении режима последовательности:', error);
    await ctx.answerCallbackQuery({ text: 'Произошла ошибка' });
  }
}

async function handleSettingsDelay(ctx: MyContext) {
  const match = ctx.callbackQuery?.data?.match(/^settings_delay:(.+)$/);

  if (!match) {
    return ctx.answerCallbackQuery({ text: 'Ошибка: некорректные данные' });
  }

  const delayMinutes = parseInt(match[1]);
  const userId = ctx.from?.id;

  if (!userId) {
    return ctx.answerCallbackQuery({ text: 'Ошибка: не удалось получить ваш ID' });
  }

  try {
    await updateUserByTelegramId(BigInt(userId), { maxDelayMinutes: delayMinutes });
    await ctx.answerCallbackQuery({ text: `✅ Максимальная задержка установлена: ${getDelayDescription(delayMinutes)}` });

    await showSettingsMenu(ctx);
  } catch (error) {
    console.error('Ошибка при обновлении максимальной задержки:', error);

    if (error instanceof InvalidDelayError) {
      await ctx.answerCallbackQuery({
        text: `❌ Недопустимое значение задержки`,
        show_alert: true
      });
    } else {
      await ctx.answerCallbackQuery({ text: 'Произошла ошибка' });
    }
  }
}

async function handleSettingsBack(ctx: MyContext) {
  await ctx.answerCallbackQuery();
  await showSettingsMenu(ctx);
}

export async function showSettingsMenu(ctx: MyContext) {
  const userId = ctx.from?.id;

  if (!userId) {
    return ctx.reply('Ошибка: не удалось получить ваш ID');
  }

  try {
    const settings = await getUserByTelegramId(BigInt(userId));

    let message = '⚙️ *Настройки уведомлений*\n\n';
    message += `🔗 *Последовательный режим:* ${settings.sequentialMode ? '✅ Включен' : '❌ Выключен'}\n`;
    message += `⏰ *Максимальная задержка:* ${getDelayDescription(settings.maxDelayMinutes)}\n\n`;
    message += 'Выберите действие для изменения настроек:';

    const keyboard = new InlineKeyboard();

    // Кнопки для режима последовательности
    if (settings.sequentialMode) {
      keyboard.text('❌ Выключить последовательный режим', 'settings_sequential:false');
    } else {
      keyboard.text('✅ Включить последовательный режим', 'settings_sequential:true');
    }
    keyboard.row();

    // Кнопки для максимальной задержки
    const delayOptions = [15, 30, 60, 120];
    for (const delay of delayOptions) {
      const isActive = delay === settings.maxDelayMinutes;
      const prefix = isActive ? '🔘' : '⚪';
      keyboard.text(`${prefix} ${getDelayDescription(delay)}`, `settings_delay:${delay}`);

      // Разделяем кнопки по 2 в ряд
      if (delayOptions.indexOf(delay) % 2 === 1) {
        keyboard.row();
      }
    }

    await ctx.reply(message, {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    });
  } catch (error) {
    console.error('Ошибка при отображении настроек:', error);
    await ctx.reply('Произошла ошибка при загрузке настроек');
  }
}
