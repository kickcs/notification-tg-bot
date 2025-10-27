import { createQuiz, createQuestion } from './quizService';

interface QuizJsonFormat {
  test_name: string;
  questions: Array<{
    question: string;
    number_of_answers: number;
    answers: string[];
    correct_answer: number;
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
    if (!Array.isArray(questionData.answers) || questionData.answers.length === 0) {
      throw new Error(`Вопрос "${questionData.question}" не содержит вариантов ответа`);
    }

    if (typeof questionData.correct_answer !== 'number' || 
        questionData.correct_answer < 0 || 
        questionData.correct_answer >= questionData.answers.length) {
      throw new Error(`Неверный индекс правильного ответа (${questionData.correct_answer}) для вопроса: ${questionData.question}`);
    }

    const options = questionData.answers.map((answer, index) => ({
      text: answer,
      isCorrect: index === questionData.correct_answer,
    }));

    await createQuestion(quizName, questionData.question, options);
  }

  return {
    quizName,
    questionsCount: jsonData.questions.length,
  };
}
