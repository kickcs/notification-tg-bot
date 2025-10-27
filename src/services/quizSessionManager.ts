import {QuizSession, QuestionAdditionState} from '../types/quiz';

const activeSessions = new Map<string, QuizSession>();
const questionAdditionStates = new Map<string, QuestionAdditionState>();

function getSessionKey(userId: bigint, chatId: bigint): string {
  return `${userId}_${chatId}`;
}

export function createSession(session: QuizSession): void {
  const key = getSessionKey(session.userId, session.chatId);
  activeSessions.set(key, session);
}

export function getSession(userId: bigint, chatId: bigint): QuizSession | undefined {
  const key = getSessionKey(userId, chatId);
  return activeSessions.get(key);
}

export function updateSession(userId: bigint, chatId: bigint, updates: Partial<QuizSession>): void {
  const key = getSessionKey(userId, chatId);
  const session = activeSessions.get(key);
  
  if (session) {
    activeSessions.set(key, {...session, ...updates});
  }
}

export function deleteSession(userId: bigint, chatId: bigint): boolean {
  const key = getSessionKey(userId, chatId);
  return activeSessions.delete(key);
}

export function hasActiveSession(userId: bigint, chatId: bigint): boolean {
  const key = getSessionKey(userId, chatId);
  return activeSessions.has(key);
}

export function createQuestionAdditionState(state: QuestionAdditionState): void {
  const key = state.userId.toString();
  questionAdditionStates.set(key, state);
}

export function getQuestionAdditionState(userId: bigint): QuestionAdditionState | undefined {
  return questionAdditionStates.get(userId.toString());
}

export function updateQuestionAdditionState(userId: bigint, updates: Partial<QuestionAdditionState>): void {
  const key = userId.toString();
  const state = questionAdditionStates.get(key);
  
  if (state) {
    questionAdditionStates.set(key, {...state, ...updates});
  }
}

export function deleteQuestionAdditionState(userId: bigint): boolean {
  return questionAdditionStates.delete(userId.toString());
}

export function hasQuestionAdditionState(userId: bigint): boolean {
  return questionAdditionStates.has(userId.toString());
}
