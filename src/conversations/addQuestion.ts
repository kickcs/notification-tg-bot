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

  await ctx.reply(`📝 Отправьте текст вопроса для квиза '${quizName}'\n\nДля отмены используйте /cancel`);

  const questionCtx = await conversation.waitFor('message:text');
  
  if (questionCtx.message?.text === '/cancel') {
    await ctx.reply('❌ Добавление вопроса отменено');
    return;
  }

  const questionText = questionCtx.message?.text;
  if (!questionText) {
    await ctx.reply('❌ Текст вопроса не получен');
    return;
  }

  const options: string[] = [];
  
  for (let i = 1; i <= 4; i++) {
    await ctx.reply(`📝 Отправьте вариант ответа ${i} (всего нужно 4 варианта)`);
    
    const optionCtx = await conversation.waitFor('message:text');
    
    if (optionCtx.message?.text === '/cancel') {
      await ctx.reply('❌ Добавление вопроса отменено');
      return;
    }

    const optionText = optionCtx.message?.text;
    if (!optionText) {
      await ctx.reply('❌ Вариант ответа не получен');
      return;
    }

    options.push(optionText);
  }

  let message = '📋 Варианты ответов:\n\n';
  options.forEach((opt, i) => {
    message += `${i + 1}. ${opt}\n`;
  });
  message += '\n📝 Введите номер правильного ответа (1-4)';

  await ctx.reply(message);

  let correctIndex: number | null = null;

  while (correctIndex === null) {
    const correctCtx = await conversation.waitFor('message:text');
    
    if (correctCtx.message?.text === '/cancel') {
      await ctx.reply('❌ Добавление вопроса отменено');
      return;
    }

    const input = correctCtx.message?.text;
    if (!input) {
      await ctx.reply('❌ Номер не получен');
      continue;
    }

    const parsed = parseInt(input);
    
    if (isNaN(parsed) || parsed < 1 || parsed > 4) {
      await ctx.reply('❌ Введите число от 1 до 4');
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

    await ctx.reply(
      `✅ Вопрос добавлен в квиз '${quizName}'!\n\n` +
      `📊 Всего вопросов: ${totalQuestions}`
    );
  } catch (error) {
    console.error('Ошибка при создании вопроса:', error);
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
    await ctx.reply(`❌ ${errorMessage}`);
  }
}
