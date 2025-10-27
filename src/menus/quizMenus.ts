import {Menu} from '@grammyjs/menu';
import {getAllQuizzes, getQuestionsByQuiz} from '../services/quizService';
import {hasActiveSession} from '../services/quizSessionManager';
import {MyContext} from '../types/context';

export const quizListMenu = new Menu<MyContext>('quiz-list')
  .dynamic(async (ctx, range) => {
    const quizzes = await getAllQuizzes();
    
    if (quizzes.length === 0) {
      range.text('📭 Квизы не найдены', (ctx) => ctx.answerCallbackQuery());
      return;
    }

    for (const quiz of quizzes) {
      if (quiz._count.questions === 0) {
        continue;
      }

      const label = `${quiz.name} (${quiz._count.questions} вопр.)`;
      
      range.text(label, async (ctx) => {
        const userId = ctx.from?.id;
        const chatId = ctx.chat?.id;

        if (!userId || !chatId) {
          await ctx.answerCallbackQuery('❌ Ошибка получения данных');
          return;
        }

        if (hasActiveSession(BigInt(userId), BigInt(chatId))) {
          await ctx.answerCallbackQuery('⚠️ У вас уже есть активный квиз. Завершите его или используйте /cancelquiz');
          return;
        }

        const questions = await getQuestionsByQuiz(quiz.name);
        
        if (questions.length === 0) {
          await ctx.answerCallbackQuery(`❌ В квизе '${quiz.name}' нет вопросов`);
          return;
        }

        await ctx.answerCallbackQuery();
        await ctx.deleteMessage();

        const {startQuizWithQuestions} = await import('../handlers/commands');
        await startQuizWithQuestions(ctx, quiz.name, questions);
      }).row();
    }
  })
  .text('❌ Закрыть', (ctx) => {
    ctx.deleteMessage();
    ctx.answerCallbackQuery();
  });

export const adminQuizMenu = new Menu<MyContext>('admin-quiz-menu')
  .text('➕ Создать квиз', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('createQuiz');
  })
  .row()
  .text('📋 Список всех квизов', async (ctx) => {
    await ctx.answerCallbackQuery();
    const quizzes = await getAllQuizzes(true);
    
    if (quizzes.length === 0) {
      await ctx.reply('📭 Квизы не найдены');
      return;
    }

    let message = '📋 Список квизов:\n\n';

    quizzes.forEach((quiz: {name: string; isActive: boolean; description?: string | null; _count: {questions: number}}, index: number) => {
      const status = quiz.isActive ? '✅' : '❌';
      message += `${index + 1}. ${status} ${quiz.name}\n`;
      message += `   📝 Вопросов: ${quiz._count.questions}\n`;
      if (quiz.description) {
        message += `   ℹ️ ${quiz.description}\n`;
      }
      message += '\n';
    });

    message += `📊 Всего: ${quizzes.length} квизов`;

    await ctx.reply(message);
  })
  .row()
  .text('🗑 Удалить квиз', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '⚠️ Использование: /deletequiz <название>\n\n' +
      'Пример: /deletequiz Медицина'
    );
  })
  .row()
  .back('◀️ Назад');

export const adminQuestionMenu = new Menu<MyContext>('admin-question-menu')
  .text('➕ Добавить вопрос', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '⚠️ Использование: /addquestion <название_квиза>\n\n' +
      'Пример: /addquestion Медицина'
    );
  })
  .row()
  .text('📋 Список вопросов', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '⚠️ Использование: /listquestions <название_квиза>\n\n' +
      'Пример: /listquestions Медицина'
    );
  })
  .row()
  .text('🗑 Удалить вопрос', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '⚠️ Использование: /deletequestion <id>\n\n' +
      'Пример: /deletequestion abc-123-def'
    );
  })
  .row()
  .back('◀️ Назад');

export const adminMainMenu = new Menu<MyContext>('admin-main-menu')
  .submenu('📝 Управление квизами', 'admin-quiz-menu')
  .row()
  .submenu('❓ Управление вопросами', 'admin-question-menu')
  .row()
  .text('❌ Закрыть', (ctx) => {
    ctx.deleteMessage();
    ctx.answerCallbackQuery();
  });

adminMainMenu.register(adminQuizMenu);
adminMainMenu.register(adminQuestionMenu);
