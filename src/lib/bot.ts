import { Bot } from 'grammy';

let botInstance: Bot | null = null;

export function setBotInstance(bot: Bot) {
  botInstance = bot;
}

export function getBotInstance(): Bot {
  if (!botInstance) {
    throw new Error('Bot instance not initialized');
  }
  return botInstance;
}