import {type Conversation} from '@grammyjs/conversations';
import {createQuestion, getAllQuizzes} from '../services/quizService';
import {MyContext} from '../types/context';

export async function addQuestionConversation(conversation: Conversation<MyContext, MyContext>, ctx: MyContext) {
  const quizName = await conversation.external((ctx) => ctx.session?.quizName);

  if (!quizName) {
    await ctx.reply('❌ Ошибка: название квиза не передано');
    return;
  }
  
  await conversation.external((ctx) => {
    if (ctx.session) {
      delete ctx.session.quizName;
    }
  });

  const quizzes = await getAllQuizzes(true);
  const foundQuiz = quizzes.find((q: {name: string}) => q.name === quizName);

  if (!foundQuiz) {
    await ctx.reply(`❌ Квиз '${quizName}' не найден`);
    return;
  }

  const initialMsg = await ctx.reply(`📝 Отправьте текст вопроса для квиза '${quizName}'\n\nДля отмены используйте /cancel`);

  const questionCtx = await conversation.waitFor('message:text');
  
  try {
    await ctx.api.deleteMessage(ctx.chat!.id, questionCtx.message!.message_id);
  } catch (error) {
    console.error('Не удалось удалить сообщение:', error);
  }
  
  if (questionCtx.message?.text === '/cancel') {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      initialMsg.message_id,
      '❌ Добавление вопроса отменено'
    );
    return;
  }

  const questionText = questionCtx.message?.text;
  if (!questionText) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      initialMsg.message_id,
      '❌ Текст вопроса не получен'
    );
    return;
  }

  const options: string[] = [];
  
  for (let i = 1; i <= 4; i++) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      initialMsg.message_id,
      `📝 Отправьте вариант ответа ${i} (всего нужно 4 варианта)\n\n` +
      `Вопрос: ${questionText}`
    );
    
    const optionCtx = await conversation.waitFor('message:text');
    
    try {
      await ctx.api.deleteMessage(ctx.chat!.id, optionCtx.message!.message_id);
    } catch (error) {
      console.error('Не удалось удалить сообщение:', error);
    }
    
    if (optionCtx.message?.text === '/cancel') {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        initialMsg.message_id,
        '❌ Добавление вопроса отменено'
      );
      return;
    }

    const optionText = optionCtx.message?.text;
    if (!optionText) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        initialMsg.message_id,
        '❌ Вариант ответа не получен'
      );
      return;
    }

    options.push(optionText);
  }

  let message = '📋 Варианты ответов:\n\n';
  options.forEach((opt, i) => {
    message += `${i + 1}. ${opt}\n`;
  });
  message += '\n\n📝 Введите номер правильного ответа (1-4)';

  await ctx.api.editMessageText(
    ctx.chat!.id,
    initialMsg.message_id,
    message
  );

  let correctIndex: number | null = null;

  while (correctIndex === null) {
    const correctCtx = await conversation.waitFor('message:text');
    
    try {
      await ctx.api.deleteMessage(ctx.chat!.id, correctCtx.message!.message_id);
    } catch (error) {
      console.error('Не удалось удалить сообщение:', error);
    }
    
    if (correctCtx.message?.text === '/cancel') {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        initialMsg.message_id,
        '❌ Добавление вопроса отменено'
      );
      return;
    }

    const input = correctCtx.message?.text;
    if (!input) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        initialMsg.message_id,
        message + '\n\n❌ Номер не получен. Попробуйте снова:'
      );
      continue;
    }

    const parsed = parseInt(input);
    
    if (isNaN(parsed) || parsed < 1 || parsed > 4) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        initialMsg.message_id,
        message + '\n\n❌ Введите число от 1 до 4:'
      );
      continue;
    }

    correctIndex = parsed;
  }

  try {
    const optionsData = options.map((opt, i) => ({
      text: opt,
      isCorrect: i === correctIndex - 1,
    }));

    const {question, totalQuestions} = await createQuestion(
      quizName,
      questionText,
      optionsData
    );

    await ctx.api.editMessageText(
      ctx.chat!.id,
      initialMsg.message_id,
      `✅ Вопрос добавлен в квиз '${quizName}'!\n\n` +
      `📊 Всего вопросов: ${totalQuestions}`
    );
    
    await ctx.api.editMessageReplyMarkup(
      ctx.chat!.id,
      initialMsg.message_id,
      {
        reply_markup: {
          inline_keyboard: [
            [{text: '➕ Добавить еще вопрос', callback_data: `add_question:${quizName}`}],
            [{text: '📋 Список вопросов', callback_data: `list_questions:${quizName}`}],
            [{text: '✅ Завершить добавление', callback_data: `finish_adding:${quizName}`}],
          ],
        },
      }
    );
  } catch (error) {
    console.error('Ошибка при создании вопроса:', error);
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
    await ctx.api.editMessageText(
      ctx.chat!.id,
      initialMsg.message_id,
      `❌ ${errorMessage}`
    );
  }
}
