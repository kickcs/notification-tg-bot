export interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuizQuestionData {
  id: string;
  questionText: string;
  options: QuizOption[];
}

export interface QuizSession {
  userId: bigint;
  chatId: bigint;
  quizName: string;
  questions: QuizQuestionData[];
  currentIndex: number;
  correctCount: number;
  incorrectCount: number;
}
