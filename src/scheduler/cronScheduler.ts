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
  getDelayDescription
} from '../utils/timeUtils';
import { MyContext } from '../types/context';
import { getUserMaxDelay } from '../services/userService';

const tasks = new Map<string, cron.ScheduledTask>();
const retryTimeouts = new Map<string, NodeJS.Timeout>();
const delayedTasks = new Map<string, NodeJS.Timeout>();

const RETRY_INTERVAL_MS = 15 * 60 * 1000;
const MAX_RETRIES = 3;

export async function initializeScheduler(bot: Bot<MyContext>) {
  console.log('🔄 Загрузка активных расписаний...');
  
  const schedules = await getAllActiveSchedules();
  
  for (const schedule of schedules) {
    for (const time of schedule.times) {
      registerCronTask(bot, schedule.id, schedule.userId, schedule.chatId, time);
    }
  }
  
  console.log(`✅ Загружено ${schedules.length} расписаний`);
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
  console.log(`📅 Зарегистрирована задача: ${taskKey} (${cronExpression})`);
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
  console.log(`🗑️  Удалено ${keysToDelete.length} задач для расписания ${scheduleId}`);
}

async function sendReminder(bot: Bot<MyContext>, scheduleId: string, userId: string, chatId: bigint, time: string) {
  try {
    // Для последовательного режима проверяем, есть ли уже pending напоминания
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { user: true }
    });

    if (!schedule) {
      console.error(`❌ Расписание ${scheduleId} не найдено`);
      return;
    }

    if (schedule.useSequentialDelay) {
      const hasPending = await hasPendingReminders(scheduleId);
      if (hasPending) {
        console.log(`⏭️ Пропуск отправки для расписания ${scheduleId} - есть неподтвержденные напоминания`);
        return;
      }

      // Ищем первое pending напоминание для этой последовательности
      const firstPending = await getFirstPendingReminder(scheduleId);
      if (!firstPending) {
        console.log(`⏭️ Нет pending напоминаний для расписания ${scheduleId}`);
        return;
      }

      await sendSequentialReminder(bot, firstPending);
    } else {
      // Обычный режим - создаем новое напоминание
      const sequenceOrder = schedule.times.indexOf(time);
      const reminder = await createReminder(scheduleId, sequenceOrder);
      await sendStandardReminder(bot, reminder, time);
    }
  } catch (error) {
    console.error('❌ Ошибка при отправке напоминания:', error);
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
        console.log(`⏭️  Напоминание ${reminderId} пропущено после ${MAX_RETRIES} попыток`);
        return;
      }
      
      if (reminder.messageId) {
        try {
          await bot.api.deleteMessage(chatId.toString(), reminder.messageId);
        } catch (deleteError) {
          console.warn(`⚠️  Не удалось удалить предыдущее сообщение ${reminder.messageId}:`, deleteError);
        }
      }
      
      const templateMessage = await getRandomTemplate('reminder');
      const currentTime = getCurrentTimeFormatted();
      const message = `🔔 Повторное напоминание:\n\n[${currentTime}] ${templateMessage}`;
      const keyboard = new InlineKeyboard().text('✅ Подтвердить', `confirm_reminder:${reminderId}`);
      
      const sentMessage = await bot.api.sendMessage(chatId.toString(), message, {
        reply_markup: keyboard,
      });
      
      await updateReminderMessageId(reminderId, sentMessage.message_id);
      
      scheduleRetry(bot, reminderId, userId, chatId, reminder.retryCount);
      
      console.log(`🔁 Отправлено повторное напоминание ${reminderId} (попытка ${reminder.retryCount}) в ${currentTime}`);
    } catch (error) {
      console.error('❌ Ошибка при повторной отправке напоминания:', error);
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

async function sendStandardReminder(bot: Bot<MyContext>, reminder: any, scheduledTime: string) {
  const templateMessage = await getRandomTemplate('reminder');
  const currentTime = getCurrentTimeFormatted();
  const message = `[${currentTime}] ${templateMessage}`;

  const keyboard = new InlineKeyboard().text('✅ Подтвердить', `confirm_reminder:${reminder.id}`);

  const sentMessage = await bot.api.sendMessage(reminder.schedule.chatId.toString(), message, {
    reply_markup: keyboard,
  });

  await updateReminderMessageId(reminder.id, sentMessage.message_id);

  scheduleRetry(bot, reminder.id, reminder.schedule.userId.toString(), reminder.schedule.chatId, 0);

  console.log(`📨 Отправлено стандартное напоминание ${reminder.id} пользователю ${reminder.schedule.userId} в ${currentTime}`);
}

async function sendSequentialReminder(bot: Bot<MyContext>, reminder: any) {
  const templateMessage = await getRandomTemplate('reminder');
  const currentTime = getCurrentTimeFormatted();
  const message = `[${currentTime}] ${templateMessage}`;

  const keyboard = new InlineKeyboard().text('✅ Подтвердить', `confirm_reminder:${reminder.id}`);

  const sentMessage = await bot.api.sendMessage(reminder.schedule.chatId.toString(), message, {
    reply_markup: keyboard,
  });

  await updateReminderMessageId(reminder.id, sentMessage.message_id);

  scheduleRetry(bot, reminder.id, reminder.schedule.userId.toString(), reminder.schedule.chatId, 0);

  console.log(`📨 Отправлено последовательное напоминание ${reminder.id} (порядок: ${reminder.sequenceOrder}) пользователю ${reminder.schedule.userId} в ${currentTime}`);
}

export async function scheduleNextSequentialReminder(
  bot: Bot<MyContext>,
  confirmedReminderId: string
) {
  try {
    const confirmedReminder = await prisma.reminder.findUnique({
      where: { id: confirmedReminderId },
      include: {
        schedule: {
          include: { user: true }
        }
      }
    });

    if (!confirmedReminder || !confirmedReminder.schedule.useSequentialDelay) {
      return;
    }

    const nextReminder = await getNextReminderInSequence(
      confirmedReminder.scheduleId,
      confirmedReminder.sequenceOrder
    );

    if (!nextReminder) {
      console.log(`✅ Последовательность для расписания ${confirmedReminder.scheduleId} завершена`);
      return;
    }

    const maxDelay = await getUserMaxDelay(confirmedReminder.schedule.user.telegramId);
    const scheduledTime = confirmedReminder.schedule.times[nextReminder.sequenceOrder];
    const nextNotificationTime = calculateNextNotificationTime(
      scheduledTime,
      confirmedReminder.actualConfirmedAt!,
      maxDelay
    );

    const delayMs = nextNotificationTime.getTime() - Date.now();

    if (delayMs <= 0) {
      // Если время уже прошло, отправляем сразу
      await sendSequentialReminder(bot, nextReminder);
    } else {
      // Планируем отложенную отправку
      const timeout = setTimeout(async () => {
        await sendSequentialReminder(bot, nextReminder);
      }, delayMs);

      delayedTasks.set(`${confirmedReminder.scheduleId}-${nextReminder.sequenceOrder}`, timeout);

      const delayDescription = getDelayDescription(Math.floor(delayMs / (1000 * 60)));
      console.log(`⏰ Запланировано следующее напоминание ${nextReminder.id} через ${delayDescription} в ${nextNotificationTime.toLocaleTimeString()}`);
    }
  } catch (error) {
    console.error('❌ Ошибка при планировании следующего последовательного напоминания:', error);
  }
}

export function cancelDelayedTask(scheduleId: string, sequenceOrder: number) {
  const key = `${scheduleId}-${sequenceOrder}`;
  const timeout = delayedTasks.get(key);
  if (timeout) {
    clearTimeout(timeout);
    delayedTasks.delete(key);
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

  console.log('🛑 Все задачи остановлены');
}
