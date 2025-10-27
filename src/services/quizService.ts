import {prisma} from '../lib/prisma';

export async function createQuiz(name: string, description?: string) {
  const existingQuiz = await prisma.quiz.findUnique({where: {name}});
  
  if (existingQuiz) {
    throw new Error(`Квиз с названием "${name}" уже существует`);
  }
  
  return prisma.quiz.create({
    data: {
      name,
      description,
    },
  });
}

export async function getAllQuizzes(includeInactive = false) {
  return prisma.quiz.findMany({
    where: includeInactive ? undefined : {isActive: true},
    include: {
      _count: {
        select: {questions: true},
      },
    },
    orderBy: {createdAt: 'desc'},
  });
}

export async function getQuizByName(name: string) {
  return prisma.quiz.findUnique({
    where: {name},
    include: {
      _count: {
        select: {questions: true},
      },
    },
  });
}

export async function deleteQuiz(name: string) {
  const quiz = await prisma.quiz.findUnique({
    where: {name},
    include: {
      _count: {
        select: {questions: true},
      },
    },
  });
  
  if (!quiz) {
    throw new Error(`Квиз "${name}" не найден`);
  }
  
  await prisma.quiz.delete({where: {name}});
  
  return {quiz, questionCount: quiz._count.questions};
}

export async function createQuestion(
  quizName: string,
  questionText: string,
  options: Array<{text: string; isCorrect: boolean}>
) {
  const quiz = await prisma.quiz.findUnique({where: {name: quizName}});
  
  if (!quiz) {
    throw new Error(`Квиз "${quizName}" не найден`);
  }
  
  if (options.length !== 4) {
    throw new Error('Вопрос должен содержать ровно 4 варианта ответа');
  }
  
  const correctAnswers = options.filter(o => o.isCorrect);
  if (correctAnswers.length !== 1) {
    throw new Error('Должен быть ровно один правильный ответ');
  }
  
  const question = await prisma.quizQuestion.create({
    data: {
      quizId: quiz.id,
      questionText,
      options: {
        create: options.map(opt => ({
          optionText: opt.text,
          isCorrect: opt.isCorrect,
        })),
      },
    },
    include: {
      options: true,
    },
  });
  
  const totalQuestions = await prisma.quizQuestion.count({
    where: {quizId: quiz.id},
  });
  
  return {question, totalQuestions};
}

export async function getQuestionsByQuiz(quizName: string) {
  const quiz = await prisma.quiz.findUnique({where: {name: quizName}});
  
  if (!quiz) {
    throw new Error(`Квиз "${quizName}" не найден`);
  }
  
  return prisma.quizQuestion.findMany({
    where: {quizId: quiz.id},
    include: {
      options: true,
    },
    orderBy: {createdAt: 'asc'},
  });
}

export async function getAllQuestionsFromQuiz(quizName: string) {
  const quiz = await prisma.quiz.findUnique({where: {name: quizName}});
  
  if (!quiz) {
    throw new Error(`Квиз "${quizName}" не найден`);
  }
  
  const questions = await prisma.quizQuestion.findMany({
    where: {quizId: quiz.id},
    include: {
      options: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
  
  return questions.map((q: {id: string; questionText: string; options: Array<{id: string; optionText: string; isCorrect: boolean}>}) => ({
    id: q.id,
    questionText: q.questionText,
    options: q.options.map((o: {id: string; optionText: string; isCorrect: boolean}) => ({
      id: o.id,
      text: o.optionText,
      isCorrect: o.isCorrect,
    })),
  }));
}

export async function deleteQuestion(questionId: string) {
  const question = await prisma.quizQuestion.findUnique({
    where: {id: questionId},
    include: {
      options: true,
    },
  });
  
  if (!question) {
    throw new Error('Вопрос не найден');
  }
  
  await prisma.quizQuestion.delete({where: {id: questionId}});
  
  return question;
}
