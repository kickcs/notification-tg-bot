import {type Conversation} from '@grammyjs/conversations';
import {createQuiz} from '../services/quizService';
import {MyContext} from '../types/context';

export async function createQuizConversation(conversation: Conversation<MyContext, MyContext>, ctx: MyContext) {
  const initialMsg = await ctx.reply('📝 Введите название квиза\n\nДля отмены используйте /cancel');

  const nameCtx = await conversation.waitFor('message:text');
  
  try {
    await ctx.api.deleteMessage(ctx.chat!.id, nameCtx.message!.message_id);
  } catch (error) {
    console.error('Не удалось удалить сообщение:', error);
  }
  
  if (nameCtx.message?.text === '/cancel') {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      initialMsg.message_id,
      '❌ Создание квиза отменено'
    );
    return;
  }

  const name = nameCtx.message?.text;
  if (!name) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      initialMsg.message_id,
      '❌ Название не получено'
    );
    return;
  }

  await ctx.api.editMessageText(
    ctx.chat!.id,
    initialMsg.message_id,
    `📝 Введите описание квиза (или отправьте "-" чтобы пропустить)\n\n` +
    `Название: ${name}`
  );

  const descCtx = await conversation.waitFor('message:text');
  
  try {
    await ctx.api.deleteMessage(ctx.chat!.id, descCtx.message!.message_id);
  } catch (error) {
    console.error('Не удалось удалить сообщение:', error);
  }
  
  if (descCtx.message?.text === '/cancel') {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      initialMsg.message_id,
      '❌ Создание квиза отменено'
    );
    return;
  }

  const description = descCtx.message?.text;
  const finalDescription = description === '-' ? undefined : description;

  try {
    const quiz = await createQuiz(name, finalDescription);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      initialMsg.message_id,
      `✅ Квиз '${quiz.name}' создан!\n\n` +
      `Добавьте вопросы с помощью /addquestion ${quiz.name}`
    );
    
    await ctx.api.editMessageReplyMarkup(
      ctx.chat!.id,
      initialMsg.message_id,
      {
        reply_markup: {
          inline_keyboard: [
            [{text: '➕ Добавить вопрос', callback_data: `add_question:${quiz.name}`}],
          ],
        },
      }
    );
  } catch (error) {
    console.error('Ошибка при создании квиза:', error);
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
    await ctx.api.editMessageText(
      ctx.chat!.id,
      initialMsg.message_id,
      `❌ ${errorMessage}`
    );
  }
}
