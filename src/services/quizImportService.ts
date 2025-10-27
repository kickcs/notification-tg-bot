import { createQuiz, createQuestion } from './quizService';

interface QuizJsonFormat {
  test_name: string;
  questions: Array<{
    question: string;
    options_count: number;
    options: string[];
    correct_answer: string;
  }>;
}

export async function importQuizFromJson(jsonData: QuizJsonFormat, userId: bigint) {
  if (!jsonData.test_name) {
    throw new Error('Поле "test_name" не найдено или пустое');
  }

  if (!Array.isArray(jsonData.questions) || jsonData.questions.length === 0) {
    throw new Error('Поле "questions" должно быть массивом с хотя бы одним вопросом');
  }

  const quizName = jsonData.test_name;
  
  await createQuiz(quizName, `Импортированный квиз`);

  for (const questionData of jsonData.questions) {
    const correctAnswerIndex = questionData.options.indexOf(questionData.correct_answer);
    
    if (correctAnswerIndex === -1) {
      throw new Error(`Правильный ответ "${questionData.correct_answer}" не найден в списке вариантов для вопроса: ${questionData.question}`);
    }

    const options = questionData.options.map((answer, index) => ({
      text: answer,
      isCorrect: index === correctAnswerIndex,
    }));

    await createQuestion(quizName, questionData.question, options);
  }

  return {
    quizName,
    questionsCount: jsonData.questions.length,
  };
}
