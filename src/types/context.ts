import {Context, SessionFlavor} from 'grammy';
import {ConversationFlavor} from '@grammyjs/conversations';

export interface SessionData {
  quizName?: string;
}

export type MyContext = Context & SessionFlavor<SessionData> & ConversationFlavor<Context & SessionFlavor<SessionData>>;
