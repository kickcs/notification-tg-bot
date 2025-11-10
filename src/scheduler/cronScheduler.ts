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
  getDelayDescription
} from '../utils/timeUtils';
import { MyContext } from '../types/context';
import { hasValidSchedule, hasValidChatId, chatIdToString } from '../utils/idUtils';
import { getUserMaxDelay } from '../services/userService';

const tasks = new Map<string, cron.ScheduledTask>();
const retryTimeouts = new Map<string, NodeJS.Timeout>();
const delayedTasks = new Map<string, NodeJS.Timeout>();

const RETRY_INTERVAL_MS = 15 * 60 * 1000;
const MAX_RETRIES = 3;
const MAX_DELAYED_TASKS = 1000; // Предотвращение memory leak

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
    console.log(`🔍 Проверка напоминания для расписания ${scheduleId} в ${time}`);

    // Для последовательного режима проверяем, есть ли уже pending напоминания
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { user: true }
    });

    if (!schedule) {
      console.error(`❌ Расписание ${scheduleId} не найдено`);
      return;
    }

    console.log(`📋 Расписание ${scheduleId} found. useSequentialDelay: ${schedule.useSequentialDelay}, sequentialMode: ${schedule.user.sequentialMode}`);

    if (schedule.useSequentialDelay) {
      // В последовательном режиме проверяем только ОТПРАВЛЕННЫЕ но неподтвержденные напоминания
      const hasSentButNotConfirmed = await hasSentButUnconfirmedReminders(scheduleId);
      if (hasSentButNotConfirmed) {
        console.log(`⏭️ Пропуск отправки для расписания ${scheduleId} - есть отправленные но неподтвержденные напоминания`);
        return;
      }

      // Ищем первое pending напоминание для этой последовательности
      const firstPending = await getFirstPendingReminder(scheduleId);
      if (!firstPending) {
        console.log(`⏭️ Нет pending напоминаний для расписания ${scheduleId}`);
        return;
      }

      console.log(`📤 Отправка последовательного напоминания ${firstPending.id} для расписания ${scheduleId}`);
      await sendSequentialReminder(bot, firstPending);
    } else {
      // Обычный режим - создаем новое напоминание
      const sequenceOrder = schedule.times.indexOf(time);
      const reminder = await createReminder(scheduleId, sequenceOrder);
      await sendStandardReminder(bot, reminder, time, schedule);
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

async function sendStandardReminder(bot: Bot<MyContext>, reminder: any, scheduledTime: string, schedule: any) {
  // Validate schedule data
  if (!hasValidChatId(schedule)) {
    console.error(`❌ Расписание не содержит chatId для напоминания ${reminder.id}`);
    return;
  }

  if (!schedule.userId) {
    console.error(`❌ Расписание не содержит userId для напоминания ${reminder.id}`);
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

  console.log(`📨 Отправлено стандартное напоминание ${reminder.id} пользователю ${schedule.userId} в ${currentTime}`);
}

async function sendSequentialReminder(bot: Bot<MyContext>, reminder: any) {
  console.log(`📤 Отправка последовательного напоминания ${reminder.id} со статусом ${reminder.status}`);

  // Validate reminder has schedule data
  if (!hasValidSchedule(reminder)) {
    console.error(`❌ Напоминание ${reminder.id} не содержит данных о расписании или chatId`);
    return;
  }

  if (!reminder.id) {
    console.error(`❌ Напоминание не содержит id`);
    return;
  }

  if (!reminder.schedule.userId) {
    console.error(`❌ Напоминание ${reminder.id} не содержит userId в расписании`);
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

  console.log(`📨 Отправлено последовательное напоминание ${reminder.id} (порядок: ${reminder.sequenceOrder || 0}) пользователю ${reminder.schedule.userId} в ${currentTime}`);
}

export async function scheduleNextSequentialReminder(
  bot: Bot<MyContext>,
  confirmedReminderId: string
) {
  console.log(`🔄 Планирование следующего последовательного напоминания после подтверждения ${confirmedReminderId}`);

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
        console.log(`✅ Последовательность для расписания ${confirmedReminder.scheduleId} завершена`);
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
      console.error(`❌ Не найдено время для sequenceOrder ${confirmedReminder.sequenceOrder} или ${nextReminder.sequenceOrder} в расписании ${schedule.id}`);
      await prisma.reminder.update({
        where: { id: nextReminder.id },
        data: { status: 'pending' } // Возвращаем в pending, т.к. не смогли обработать
      });
      return;
    }

    const nextNotificationTime = calculateNextSequentialNotificationTime(
      currentScheduledTime,
      nextScheduledTime,
      confirmedReminder.actualConfirmedAt!,
      maxDelay
    );

    // Логирование расчетов для отладки
    const currentDelay = calculateDelayAmount(confirmedReminder.actualConfirmedAt!, currentScheduledTime);
    const cappedDelay = Math.min(currentDelay, maxDelay);
    const now = new Date();
    const delayMs = nextNotificationTime.getTime() - now.getTime();

    console.log(`⏰ Расчет времени для последовательного режима:`);
    console.log(`   📅 Предыдущее время: ${currentScheduledTime}`);
    console.log(`   📅 Следующее время: ${nextScheduledTime}`);
    console.log(`   ✅ Время подтверждения: ${confirmedReminder.actualConfirmedAt!.toLocaleTimeString()}`);
    console.log(`   📊 Задержка предыдущего: ${currentDelay} мин`);
    console.log(`   📊 Ограниченная задержка: ${cappedDelay} мин (макс: ${maxDelay})`);
    console.log(`   📅 Расчетное время: ${nextNotificationTime.toLocaleTimeString()}`);
    console.log(`   📅 Текущее время: ${now.toLocaleTimeString()}`);
    console.log(`   ⏱️  Задержка отправки: ${Math.floor(delayMs / 1000)} сек`);

    if (delayMs <= 0) {
      // Если время уже прошло, отправляем сразу
      console.log(`   🚀 Отправка сразу (время уже прошло)`);
      await sendSequentialReminder(bot, nextReminder);
    } else {
      // Планируем отложенную отправку
      console.log(`   ⏳ Планирование отложенной отправки`);
      const timeout = setTimeout(async () => {
        try {
          console.log(`   ⏰ Отложенное напоминание ${nextReminder.id} готово к отправке`);
          await sendSequentialReminder(bot, nextReminder);
        } catch (error) {
          console.error('❌ Ошибка при отправке отложенного напоминания:', error);
          // Возвращаем в pending статус при ошибке
          await prisma.reminder.update({
            where: { id: nextReminder.id },
            data: { status: 'pending' }
          });
        }
      }, delayMs);

      setDelayedTaskWithCleanup(`${schedule.id}-${nextReminder.sequenceOrder}`, timeout);

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

  console.log('🛑 Все задачи остановлены');
}
