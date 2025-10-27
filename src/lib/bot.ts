import { Bot } from 'grammy';
import { MyContext } from '../types/context';

let botInstance: Bot<MyContext> | null = null;

export function setBotInstance(bot: Bot<MyContext>) {
  botInstance = bot;
}

export function getBotInstance(): Bot<MyContext> {
  if (!botInstance) {
    throw new Error('Bot instance not initialized');
  }
  return botInstance;
}