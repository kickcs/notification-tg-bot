/**
 * Utility functions for handling different types of IDs in the application
 */

/**
 * Converts Telegram user ID (number) to BigInt for database operations
 */
export function toBigIntTelegramId(telegramId: number | string): bigint {
  if (typeof telegramId === 'bigint') {
    return telegramId;
  }
  return BigInt(telegramId);
}

/**
 * Converts BigInt to string for display purposes
 */
export function telegramIdToString(telegramId: bigint): string {
  return telegramId.toString();
}

/**
 * Validates if a value is a valid Telegram user ID
 */
export function isValidTelegramId(telegramId: any): telegramId is number | string | bigint {
  if (telegramId === null || telegramId === undefined) {
    return false;
  }
  try {
    BigInt(telegramId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates if a value is a valid database ID (string)
 */
export function isValidDatabaseId(id: any): id is string {
  return typeof id === 'string' && id.length > 0;
}

/**
 * Type guard to check if object has valid schedule data with chatId
 */
export function hasValidSchedule(obj: any): obj is { schedule: { chatId: bigint | string | number, userId?: string | bigint, [key: string]: any }, id?: string, sequenceOrder?: number, [key: string]: any } {
  return obj &&
         obj.schedule &&
         obj.schedule.chatId !== undefined &&
         obj.schedule.chatId !== null;
}

/**
 * Type guard to check if object has valid chatId
 */
export function hasValidChatId(obj: any): obj is { chatId: bigint | string | number, userId?: string | bigint, [key: string]: any } {
  return obj &&
         obj.chatId !== undefined &&
         obj.chatId !== null;
}

/**
 * Safely convert chatId to string for API calls
 */
export function chatIdToString(chatId: bigint | string | number): string {
  return chatId.toString();
}