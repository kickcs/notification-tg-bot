import { prisma } from '../lib/prisma';

export async function createReminder(scheduleId: string) {
  return await prisma.reminder.create({
    data: {
      scheduleId,
      status: 'pending',
      retryCount: 0,
    },
  });
}

export async function confirmReminder(reminderId: string) {
  await prisma.reminder.update({
    where: { id: reminderId },
    data: { status: 'confirmed' },
  });

  await prisma.confirmation.create({
    data: {
      reminderId,
    },
  });
}

export async function markReminderAsMissed(reminderId: string) {
  return await prisma.reminder.update({
    where: { id: reminderId },
    data: { status: 'missed' },
  });
}

export async function incrementRetryCount(reminderId: string) {
  const reminder = await prisma.reminder.findUnique({
    where: { id: reminderId },
  });

  if (!reminder) {
    throw new Error('Reminder not found');
  }

  return await prisma.reminder.update({
    where: { id: reminderId },
    data: { retryCount: reminder.retryCount + 1 },
  });
}

export async function getReminder(reminderId: string) {
  return await prisma.reminder.findUnique({
    where: { id: reminderId },
    include: {
      schedule: {
        include: {
          user: true,
        },
      },
    },
  });
}
