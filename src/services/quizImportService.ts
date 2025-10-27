import { createQuiz, createQuestion } from './quizService';

interface QuizJsonFormatRu {
  тест: string;
  вопросы: Array<{
    вопрос: string;
    количество_ответов: number;
    ответы: string[];
    правильный_ответ: string;
  }>;
}

interface QuizJsonFormatEn {
  test_name: string;
  questions: Array<{
    question: string;
    options_count: number;
    options: string[];
    correct_answer: string;
  }>;
}

type QuizJsonFormat = QuizJsonFormatRu | QuizJsonFormatEn;

export async function importQuizFromJson(jsonData: QuizJsonFormat, userId: bigint) {
  let quizName: string;
  let questions: Array<{
    questionText: string;
    options: string[];
    correctAnswer: string;
  }>;

  if ('тест' in jsonData && 'вопросы' in jsonData) {
    if (!jsonData.тест) {
      throw new Error('Поле "тест" пустое');
    }
    if (!Array.isArray(jsonData.вопросы) || jsonData.вопросы.length === 0) {
      throw new Error('Поле "вопросы" должно быть массивом с хотя бы одним вопросом');
    }

    quizName = jsonData.тест;
    questions = jsonData.вопросы.map(q => ({
      questionText: q.вопрос,
      options: q.ответы,
      correctAnswer: q.правильный_ответ,
    }));
  } else if ('test_name' in jsonData && 'questions' in jsonData) {
    if (!jsonData.test_name) {
      throw new Error('Поле "test_name" пустое');
    }
    if (!Array.isArray(jsonData.questions) || jsonData.questions.length === 0) {
      throw new Error('Поле "questions" должно быть массивом с хотя бы одним вопросом');
    }

    quizName = jsonData.test_name;
    questions = jsonData.questions.map(q => ({
      questionText: q.question,
      options: q.options,
      correctAnswer: q.correct_answer,
    }));
  } else {
    throw new Error('Неверный формат JSON. Ожидается либо {тест, вопросы}, либо {test_name, questions}');
  }
  
  await createQuiz(quizName, `Импортированный квиз`);

  for (const questionData of questions) {
    const correctAnswerIndex = questionData.options.indexOf(questionData.correctAnswer);
    
    if (correctAnswerIndex === -1) {
      throw new Error(`Правильный ответ "${questionData.correctAnswer}" не найден в списке вариантов для вопроса: ${questionData.questionText}`);
    }

    const options = questionData.options.map((answer, index) => ({
      text: answer,
      isCorrect: index === correctAnswerIndex,
    }));

    await createQuestion(quizName, questionData.questionText, options);
  }

  return {
    quizName,
    questionsCount: questions.length,
  };
}
