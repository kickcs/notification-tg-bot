import { createQuiz, createQuestion } from './quizService';

interface QuizJsonFormat {
  тест: string;
  вопросы: Array<{
    вопрос: string;
    количество_ответов: number;
    ответы: string[];
    правильный_ответ: string;
  }>;
}

export async function importQuizFromJson(jsonData: QuizJsonFormat, userId: bigint) {
  const quizName = jsonData.тест;
  
  await createQuiz(quizName, `Импортированный квиз`, userId);

  for (const questionData of jsonData.вопросы) {
    const correctAnswerIndex = questionData.ответы.indexOf(questionData.правильный_ответ);
    
    if (correctAnswerIndex === -1) {
      throw new Error(`Правильный ответ "${questionData.правильный_ответ}" не найден в списке вариантов для вопроса: ${questionData.вопрос}`);
    }

    const options = questionData.ответы.map((answer, index) => ({
      text: answer,
      isCorrect: index === correctAnswerIndex,
    }));

    await createQuestion(quizName, questionData.вопрос, options);
  }

  return {
    quizName,
    questionsCount: jsonData.вопросы.length,
  };
}
