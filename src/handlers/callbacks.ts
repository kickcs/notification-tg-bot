import { Bot, Context } from 'grammy';
import { confirmReminder, getReminder } from '../services/reminderService';
import { getRandomTemplate } from '../services/templateService';
import { cancelRetry } from '../scheduler/cronScheduler';
import { getSession, updateSession, deleteSession } from '../services/quizSessionManager';
import { MyContext } from '../types/context';
import { config } from '../config';
import { QuizAnswer } from '../types/quiz';

export function registerCallbacks(bot: Bot<MyContext>) {
  bot.callbackQuery(/^confirm_reminder:(.+)$/, handleConfirmReminder);
  bot.callbackQuery(/^qa:(.+):(.+)$/, handleQuizAnswer);
  bot.callbackQuery(/^add_question:(.+)$/, handleAddQuestionButton);
  bot.callbackQuery(/^list_questions:(.+)$/, handleListQuestionsButton);
  bot.callbackQuery(/^finish_adding:(.+)$/, handleFinishAddingButton);
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

  let adminMessage = `📊 Результаты квиза\n\n`;
  adminMessage += `👤 Пользователь: ${userName} ${userUsername}\n`;
  adminMessage += `🆔 ID: ${session.userId}\n`;
  adminMessage += `📝 Квиз: ${session.quizName}\n\n`;
  adminMessage += `✅ Правильно: ${session.correctCount}\n`;
  adminMessage += `❌ Неправильно: ${session.incorrectCount}\n`;
  adminMessage += `📊 Результат: ${percentage}%\n\n`;
  adminMessage += `📋 Ответы:\n\n`;

  session.answers.forEach((answer, index) => {
    const icon = answer.isCorrect ? '✅' : '❌';
    adminMessage += `${index + 1}. ${answer.questionText}\n`;
    adminMessage += `   ${icon} Выбрано: ${answer.selectedOption}\n`;
    if (!answer.isCorrect) {
      adminMessage += `   ✓ Правильно: ${answer.correctOption}\n`;
    }
    adminMessage += `\n`;
  });

  try {
    await ctx.api.sendMessage(Number(config.adminTelegramId), adminMessage);
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
