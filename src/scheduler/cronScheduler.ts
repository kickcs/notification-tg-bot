import cron from 'node-cron';
import { Bot, InlineKeyboard } from 'grammy';
import { prisma } from '../lib/prisma';
import { getAllActiveSchedules } from '../services/scheduleService';
import {
  createReminder,
  incrementRetryCount,
  markReminderAsMissed,
  updateReminderMessageId,
  hasPendingReminders,
  hasUnconfirmedReminders,
  hasSentButUnconfirmedReminders,
  getFirstPendingReminder,
  getNextReminderInSequence,
  createRemindersForSchedule,
  getScheduleReminders
} from '../services/reminderService';
import { getRandomTemplate } from '../services/templateService';
import {
  timeToCron,
  getCurrentTimeFormatted,
  calculateDelayAmount,
  calculateNextNotificationTime,
  calculateNextSequentialNotificationTime,
  calculateSequentialDelay,
  getDelayDescription
} from '../utils/timeUtils';
import { MyContext } from '../types/context';
import { hasValidSchedule, hasValidChatId, chatIdToString } from '../utils/idUtils';
import { getUserMaxDelay } from '../services/userService';
import { logger } from '../utils/logger';

const tasks = new Map<string, cron.ScheduledTask>();
const retryTimeouts = new Map<string, NodeJS.Timeout>();
const delayedTasks = new Map<string, NodeJS.Timeout>();

const RETRY_INTERVAL_MS = 15 * 60 * 1000;
const MAX_RETRIES = 3;
const MAX_DELAYED_TASKS = 1000; // Предотвращение memory leak
const MIN_SEQUENTIAL_DELAY_MS = 1 * 60 * 1000; // 1 минута минимальная задержка между подтверждением и следующим уведомлением

// Task cleanup management
const taskTimestamps = new Map<string, number>();

function cleanupOldTasks() {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 часа

  // Очищаем старые задачи
  for (const [key, timestamp] of taskTimestamps.entries()) {
    if (now - timestamp > maxAge) {
      const timeout = delayedTasks.get(key);
      if (timeout) {
        clearTimeout(timeout);
        delayedTasks.delete(key);
      }
      taskTimestamps.delete(key);
    }
  }

  // Если все еще слишком много задач, удаляем самые старые
  if (delayedTasks.size > MAX_DELAYED_TASKS) {
    const entries = Array.from(taskTimestamps.entries())
      .sort((a, b) => a[1] - b[1]);

    const toDelete = entries.slice(0, delayedTasks.size - MAX_DELAYED_TASKS);
    for (const [key] of toDelete) {
      const timeout = delayedTasks.get(key);
      if (timeout) {
        clearTimeout(timeout);
        delayedTasks.delete(key);
      }
      taskTimestamps.delete(key);
    }
  }
}

function setDelayedTaskWithCleanup(key: string, timeout: NodeJS.Timeout) {
  cleanupOldTasks();
  delayedTasks.set(key, timeout);
  taskTimestamps.set(key, Date.now());
}

export async function initializeScheduler(bot: Bot<MyContext>) {
  logger.debug('Loading active schedules...');

  const schedules = await getAllActiveSchedules();

  for (const schedule of schedules) {
    for (const time of schedule.times) {
      registerCronTask(bot, schedule.id, schedule.userId, schedule.chatId, time);
    }
  }

  logger.info(`Loaded ${schedules.length} schedules`);
}

export function registerCronTask(
  bot: Bot<MyContext>,
  scheduleId: string,
  userId: string,
  chatId: bigint,
  time: string
) {
  const cronExpression = timeToCron(time);
  const taskKey = `${scheduleId}-${time}`;

  if (tasks.has(taskKey)) {
    return;
  }

  const task = cron.schedule(cronExpression, async () => {
    await sendReminder(bot, scheduleId, userId, chatId, time);
  });

  tasks.set(taskKey, task);
  logger.debug(`Registered cron task: ${taskKey}`);
}

export function unregisterCronTasks(scheduleId: string) {
  const keysToDelete: string[] = [];

  for (const [key, task] of tasks.entries()) {
    if (key.startsWith(`${scheduleId}-`)) {
      task.stop();
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach(key => tasks.delete(key));
  if (keysToDelete.length > 0) {
    logger.debug(`Removed ${keysToDelete.length} cron tasks for schedule ${scheduleId}`);
  }
}

async function sendReminder(bot: Bot<MyContext>, scheduleId: string, userId: string, chatId: bigint, time: string) {
  try {
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { user: true }
    });

    if (!schedule) {
      logger.error(`Schedule ${scheduleId} not found`);
      return;
    }

    if (schedule.useSequentialDelay) {
      // В последовательном режиме проверяем только ОТПРАВЛЕННЫЕ но неподтвержденные напоминания
      const hasSentButNotConfirmed = await hasSentButUnconfirmedReminders(scheduleId);
      if (hasSentButNotConfirmed) {
        logger.debug(`Skipping sequential reminder for schedule ${scheduleId} - has unconfirmed reminders`);
        return;
      }

      // Ищем первое pending напоминание для этой последовательности
      const firstPending = await getFirstPendingReminder(scheduleId);
      if (!firstPending) {
        logger.debug(`No pending reminders for schedule ${scheduleId}`);
        return;
      }

      await sendSequentialReminder(bot, firstPending);
    } else {
      // Обычный режим - создаем новое напоминание
      const sequenceOrder = schedule.times.indexOf(time);
      const reminder = await createReminder(scheduleId, sequenceOrder);
      await sendStandardReminder(bot, reminder, time, schedule);
    }
  } catch (error) {
    logger.error(`Error sending reminder: ${error}`);
  }
}

function scheduleRetry(bot: Bot<MyContext>, reminderId: string, userId: string, chatId: bigint, currentRetry: number) {
  if (currentRetry >= MAX_RETRIES) {
    return;
  }
  
  const timeout = setTimeout(async () => {
    try {
      const reminder = await incrementRetryCount(reminderId);
      
      if (reminder.status === 'confirmed') {
        cancelRetry(reminderId);
        return;
      }
      
      if (reminder.retryCount >= MAX_RETRIES) {
        await markReminderAsMissed(reminderId);
        cancelRetry(reminderId);
        logger.warn(`Reminder ${reminderId} skipped after ${MAX_RETRIES} retries`);
        return;
      }
      
      if (reminder.messageId) {
        try {
          await bot.api.deleteMessage(chatIdToString(chatId), reminder.messageId);
        } catch (deleteError) {
          console.warn(`⚠️  Не удалось удалить предыдущее сообщение ${reminder.messageId}:`, deleteError);
        }
      }
      
      const templateMessage = await getRandomTemplate('reminder');
      const currentTime = getCurrentTimeFormatted();
      const message = `🔔 Повторное напоминание:\n\n[${currentTime}] ${templateMessage}`;
      const keyboard = new InlineKeyboard().text('✅ Подтвердить', `confirm_reminder:${reminderId}`);
      
      const sentMessage = await bot.api.sendMessage(chatIdToString(chatId), message, {
        reply_markup: keyboard,
      });
      
      await updateReminderMessageId(reminderId, sentMessage.message_id);
      
      scheduleRetry(bot, reminderId, userId, chatId, reminder.retryCount);
      
      logger.debug(`Retry sent for reminder ${reminderId} (attempt ${reminder.retryCount}) at ${currentTime}`);
    } catch (error) {
      logger.error(`Error retrying reminder: ${error}`);
    }
  }, RETRY_INTERVAL_MS);
  
  retryTimeouts.set(reminderId, timeout);
}

export function cancelRetry(reminderId: string) {
  const timeout = retryTimeouts.get(reminderId);
  if (timeout) {
    clearTimeout(timeout);
    retryTimeouts.delete(reminderId);
  }
}

async function sendStandardReminder(bot: Bot<MyContext>, reminder: any, scheduledTime: string, schedule: any) {
  // Validate schedule data
  if (!hasValidChatId(schedule)) {
    logger.error(`Schedule missing chatId for reminder ${reminder.id}`);
    return;
  }

  if (!schedule.userId) {
    logger.error(`Schedule missing userId for reminder ${reminder.id}`);
    return;
  }

  const templateMessage = await getRandomTemplate('reminder');
  const currentTime = getCurrentTimeFormatted();
  const message = `[${currentTime}] ${templateMessage}`;

  const keyboard = new InlineKeyboard().text('✅ Подтвердить', `confirm_reminder:${reminder.id}`);

  const sentMessage = await bot.api.sendMessage(chatIdToString(schedule.chatId), message, {
    reply_markup: keyboard,
  });

  await updateReminderMessageId(reminder.id, sentMessage.message_id);

  scheduleRetry(bot, reminder.id, schedule.userId.toString(), BigInt(schedule.chatId), 0);

  logger.debug(`Standard reminder ${reminder.id} sent to user ${schedule.userId} at ${currentTime}`);
}

async function sendSequentialReminder(bot: Bot<MyContext>, reminder: any) {
  logger.debug(`Sending sequential reminder ${reminder.id} with status ${reminder.status}`);

  // Validate reminder has schedule data
  if (!hasValidSchedule(reminder)) {
    logger.error(`Reminder ${reminder.id} missing schedule data or chatId`);
    return;
  }

  if (!reminder.id) {
    logger.error('Reminder missing id');
    return;
  }

  if (!reminder.schedule.userId) {
    logger.error(`Reminder ${reminder.id} missing userId in schedule`);
    return;
  }

  const templateMessage = await getRandomTemplate('reminder');
  const currentTime = getCurrentTimeFormatted();
  const message = `[${currentTime}] ${templateMessage}`;

  const keyboard = new InlineKeyboard().text('✅ Подтвердить', `confirm_reminder:${reminder.id}`);

  const sentMessage = await bot.api.sendMessage(chatIdToString(reminder.schedule.chatId), message, {
    reply_markup: keyboard,
  });

  await updateReminderMessageId(reminder.id, sentMessage.message_id);

  scheduleRetry(bot, reminder.id, reminder.schedule.userId.toString(), BigInt(reminder.schedule.chatId), 0);

  logger.debug(`Sequential reminder ${reminder.id} (order: ${reminder.sequenceOrder || 0}) sent to user ${reminder.schedule.userId} at ${currentTime}`);
}

export async function scheduleNextSequentialReminder(
  bot: Bot<MyContext>,
  confirmedReminderId: string
) {
  logger.debug(`Scheduling next sequential reminder after confirmation ${confirmedReminderId}`);

  try {
    // Используем транзакцию для предотвращения race conditions
    const result = await prisma.$transaction(async (tx) => {
      const confirmedReminder = await tx.reminder.findUnique({
        where: { id: confirmedReminderId },
        include: {
          schedule: {
            include: { user: true }
          }
        }
      });

      if (!confirmedReminder || !confirmedReminder.schedule.useSequentialDelay) {
        return null;
      }

      // Ищем следующее напоминание в последовательности
      const nextReminder = await tx.reminder.findFirst({
        where: {
          scheduleId: confirmedReminder.scheduleId,
          sequenceOrder: {
            gt: confirmedReminder.sequenceOrder,
          },
          status: 'pending',
        },
        orderBy: {
          sequenceOrder: 'asc',
        },
        include: {
          schedule: {
            include: { user: true }
          }
        }
      });

      if (!nextReminder) {
        logger.debug(`Sequence completed for schedule ${confirmedReminder.scheduleId}`);
        return null;
      }

      // Помечаем как "processing" для предотвращения дублирования
      await tx.reminder.update({
        where: { id: nextReminder.id },
        data: { status: 'processing' }
      });

      return {
        reminder: nextReminder, // Возвращаем полный nextReminder с данными расписания
        schedule: nextReminder.schedule,
        confirmedReminder
      };
    });

    if (!result) {
      return;
    }

    const { reminder: nextReminder, schedule, confirmedReminder } = result;

    const maxDelay = await getUserMaxDelay(schedule.user.telegramId);
    const currentScheduledTime = schedule.times[confirmedReminder.sequenceOrder];
    const nextScheduledTime = schedule.times[nextReminder.sequenceOrder];

    if (!currentScheduledTime || !nextScheduledTime) {
      logger.error(`Time not found for sequenceOrder ${confirmedReminder.sequenceOrder} or ${nextReminder.sequenceOrder} in schedule ${schedule.id}`);
      await prisma.reminder.update({
        where: { id: nextReminder.id },
        data: { status: 'pending' } // Возвращаем в pending, т.к. не смогли обработать
      });
      return;
    }

    let nextNotificationTime = calculateNextSequentialNotificationTime(
      currentScheduledTime,
      nextScheduledTime,
      confirmedReminder.actualConfirmedAt!,
      maxDelay
    );

    // Логирование расчетов для отладки
    const currentDelay = calculateSequentialDelay(confirmedReminder.actualConfirmedAt!, currentScheduledTime);
    const cappedDelay = Math.min(currentDelay, maxDelay);
    const now = new Date();
    let delayMs = nextNotificationTime.getTime() - now.getTime();

    // Применяем минимальную задержку 1 минута
    const minDelayMs = MIN_SEQUENTIAL_DELAY_MS;
    if (delayMs > 0 && delayMs < minDelayMs) {
      logger.debug(`Applying minimum delay: ${Math.floor(minDelayMs / 1000)}s`);
      delayMs = minDelayMs;
      nextNotificationTime = new Date(now.getTime() + minDelayMs);
    }

    if (delayMs <= 0) {
      // Если время уже прошло, отправляем сразу
      logger.debug(`Sending immediately (time already passed)`);
      await sendSequentialReminder(bot, nextReminder);
    } else {
      // Планируем отложенную отправку
      const timeout = setTimeout(async () => {
        try {
          await sendSequentialReminder(bot, nextReminder);
        } catch (error) {
          logger.error(`Error sending delayed reminder: ${error}`);
          // Возвращаем в pending статус при ошибке
          await prisma.reminder.update({
            where: { id: nextReminder.id },
            data: { status: 'pending' }
          });
        }
      }, delayMs);

      setDelayedTaskWithCleanup(`${schedule.id}-${nextReminder.sequenceOrder}`, timeout);
      const delayDescription = getDelayDescription(Math.floor(delayMs / (1000 * 60)));
      logger.debug(`Scheduled next reminder ${nextReminder.id} in ${delayDescription} at ${nextNotificationTime.toLocaleTimeString()}`);
    }
  } catch (error) {
    logger.error(`Error scheduling next sequential reminder: ${error}`);
  }
}

export function cancelDelayedTask(scheduleId: string, sequenceOrder: number) {
  const key = `${scheduleId}-${sequenceOrder}`;
  const timeout = delayedTasks.get(key);
  if (timeout) {
    clearTimeout(timeout);
    delayedTasks.delete(key);
    taskTimestamps.delete(key);
  }
}

export function stopAllTasks() {
  for (const task of tasks.values()) {
    task.stop();
  }
  tasks.clear();

  for (const timeout of retryTimeouts.values()) {
    clearTimeout(timeout);
  }
  retryTimeouts.clear();

  for (const timeout of delayedTasks.values()) {
    clearTimeout(timeout);
  }
  delayedTasks.clear();

  taskTimestamps.clear();

  logger.info('All cron tasks stopped');
}
