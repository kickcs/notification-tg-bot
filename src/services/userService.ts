import { prisma } from '../lib/prisma';

export interface UserSettings {
  maxDelayMinutes: number;
  sequentialMode: boolean;
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      maxDelayMinutes: true,
      sequentialMode: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  return {
    maxDelayMinutes: user.maxDelayMinutes,
    sequentialMode: user.sequentialMode,
  };
}

export async function updateUserSettings(
  userId: string,
  settings: Partial<UserSettings>
): Promise<UserSettings> {
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: settings,
    select: {
      maxDelayMinutes: true,
      sequentialMode: true,
    },
  });

  return {
    maxDelayMinutes: updatedUser.maxDelayMinutes,
    sequentialMode: updatedUser.sequentialMode,
  };
}

export async function getUserByTelegramId(telegramId: bigint): Promise<UserSettings> {
  const user = await prisma.user.findUnique({
    where: { telegramId },
    select: {
      id: true,
      maxDelayMinutes: true,
      sequentialMode: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  return {
    maxDelayMinutes: user.maxDelayMinutes,
    sequentialMode: user.sequentialMode,
  };
}

export async function updateUserByTelegramId(
  telegramId: bigint,
  settings: Partial<UserSettings>
): Promise<UserSettings> {
  const updatedUser = await prisma.user.update({
    where: { telegramId },
    data: settings,
    select: {
      maxDelayMinutes: true,
      sequentialMode: true,
    },
  });

  return {
    maxDelayMinutes: updatedUser.maxDelayMinutes,
    sequentialMode: updatedUser.sequentialMode,
  };
}

export async function getUserMaxDelay(telegramId: bigint): Promise<number> {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { maxDelayMinutes: true },
    });

    return user?.maxDelayMinutes ?? 60; // Default value
  } catch (error) {
    console.error('Error getting user max delay:', error);
    return 60; // Default value on error
  }
}

export async function updateUserMaxDelay(telegramId: bigint, maxDelayMinutes: number): Promise<void> {
  await prisma.user.update({
    where: { telegramId },
    data: { maxDelayMinutes },
  });
}

export async function getUserSequentialMode(telegramId: bigint): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { sequentialMode: true },
    });

    return user?.sequentialMode ?? false; // Default value
  } catch (error) {
    console.error('Error getting user sequential mode:', error);
    return false; // Default value on error
  }
}

export async function updateUserSequentialMode(telegramId: bigint, sequentialMode: boolean): Promise<void> {
  await prisma.user.update({
    where: { telegramId },
    data: { sequentialMode },
  });
}