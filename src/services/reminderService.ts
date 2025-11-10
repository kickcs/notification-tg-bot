import { prisma } from '../lib/prisma';

export async function createReminder(scheduleId: string, sequenceOrder: number = 0) {
  return await prisma.reminder.create({
    data: {
      scheduleId,
      status: 'pending',
      retryCount: 0,
      sequenceOrder,
    },
  });
}

export async function confirmReminder(reminderId: string, delayMinutes?: number) {
  const now = new Date();

  await prisma.reminder.update({
    where: { id: reminderId },
    data: {
      status: 'confirmed',
      actualConfirmedAt: now,
      delayMinutes,
    },
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

export async function updateReminderMessageId(reminderId: string, messageId: number) {
  return await prisma.reminder.update({
    where: { id: reminderId },
    data: { messageId },
  });
}

export async function hasPendingReminders(scheduleId: string): Promise<boolean> {
  const count = await prisma.reminder.count({
    where: {
      scheduleId,
      status: 'pending',
    },
  });

  return count > 0;
}

export async function hasUnconfirmedReminders(scheduleId: string): Promise<boolean> {
  const count = await prisma.reminder.count({
    where: {
      scheduleId,
      status: {
        in: ['pending', 'processing'],
      },
    },
  });

  return count > 0;
}

export async function hasSentButUnconfirmedReminders(scheduleId: string): Promise<boolean> {
  const count = await prisma.reminder.count({
    where: {
      scheduleId,
      status: 'pending',
      messageId: {
        not: null,
      },
    },
  });

  return count > 0;
}

export async function getFirstPendingReminder(scheduleId: string) {
  return await prisma.reminder.findFirst({
    where: {
      scheduleId,
      status: 'pending',
    },
    orderBy: {
      sequenceOrder: 'asc',
    },
    include: {
      schedule: {
        include: {
          user: true,
        },
      },
    },
  });
}

export async function getNextReminderInSequence(scheduleId: string, currentSequenceOrder: number) {
  return await prisma.reminder.findFirst({
    where: {
      scheduleId,
      sequenceOrder: {
        gt: currentSequenceOrder,
      },
      status: 'pending',
    },
    orderBy: {
      sequenceOrder: 'asc',
    },
    include: {
      schedule: {
        include: {
          user: true,
        },
      },
    },
  });
}

export async function markReminderAsSequenceCancelled(reminderId: string) {
  return await prisma.reminder.update({
    where: { id: reminderId },
    data: { status: 'cancelled' },
  });
}

export async function cancelAllPendingRemindersInSchedule(scheduleId: string) {
  return await prisma.reminder.updateMany({
    where: {
      scheduleId,
      status: 'pending',
    },
    data: { status: 'cancelled' },
  });
}

export async function createRemindersForSchedule(scheduleId: string, times: string[]) {
  const reminders = [];

  for (let i = 0; i < times.length; i++) {
    const reminder = await createReminder(scheduleId, i);
    reminders.push(reminder);
  }

  return reminders;
}

export async function getScheduleReminders(scheduleId: string) {
  return await prisma.reminder.findMany({
    where: { scheduleId },
    orderBy: { sequenceOrder: 'asc' },
    include: {
      confirmations: true,
    },
  });
}
