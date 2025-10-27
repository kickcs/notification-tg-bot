import {type Conversation} from '@grammyjs/conversations';
import {createQuiz} from '../services/quizService';
import {MyContext} from '../types/context';

export async function createQuizConversation(conversation: Conversation<MyContext, MyContext>, ctx: MyContext) {
  await ctx.reply('📝 Введите название квиза\n\nДля отмены используйте /cancel');

  const nameCtx = await conversation.waitFor('message:text');
  if (nameCtx.message?.text === '/cancel') {
    await ctx.reply('❌ Создание квиза отменено');
    return;
  }

  const name = nameCtx.message?.text;
  if (!name) {
    await ctx.reply('❌ Название не получено');
    return;
  }

  await ctx.reply('📝 Введите описание квиза (или отправьте "-" чтобы пропустить)');

  const descCtx = await conversation.waitFor('message:text');
  
  if (descCtx.message?.text === '/cancel') {
    await ctx.reply('❌ Создание квиза отменено');
    return;
  }

  const description = descCtx.message?.text;
  const finalDescription = description === '-' ? undefined : description;

  try {
    const quiz = await createQuiz(name, finalDescription);
    await ctx.reply(
      `✅ Квиз '${quiz.name}' создан!\n\n` +
      `Добавьте вопросы с помощью /addquestion ${quiz.name}`
    );
  } catch (error) {
    console.error('Ошибка при создании квиза:', error);
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
    await ctx.reply(`❌ ${errorMessage}`);
  }
}
