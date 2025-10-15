import cron from 'node-cron';
import { Bot, InlineKeyboard } from 'grammy';
import { getAllActiveSchedules } from '../services/scheduleService';
import { createReminder, incrementRetryCount, markReminderAsMissed } from '../services/reminderService';
import { getRandomTemplate } from '../services/templateService';
import { timeToCron } from '../utils/timeUtils';

const tasks = new Map<string, cron.ScheduledTask>();
const retryTimeouts = new Map<string, NodeJS.Timeout>();

const RETRY_INTERVAL_MS = 15 * 60 * 1000;
const MAX_RETRIES = 3;

export async function initializeScheduler(bot: Bot) {
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
  bot: Bot,
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
    await sendReminder(bot, scheduleId, userId, chatId);
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

async function sendReminder(bot: Bot, scheduleId: string, userId: string, chatId: bigint) {
  try {
    const reminder = await createReminder(scheduleId);
    const message = await getRandomTemplate('reminder');
    
    const keyboard = new InlineKeyboard().text('✅ Подтвердить', `confirm_reminder:${reminder.id}`);
    
    await bot.api.sendMessage(chatId.toString(), message, {
      reply_markup: keyboard,
    });
    
    scheduleRetry(bot, reminder.id, userId, chatId, 0);
    
    console.log(`📨 Отправлено напоминание ${reminder.id} пользователю ${userId}`);
  } catch (error) {
    console.error('❌ Ошибка при отправке напоминания:', error);
  }
}

function scheduleRetry(bot: Bot, reminderId: string, userId: string, chatId: bigint, currentRetry: number) {
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
      
      const message = await getRandomTemplate('reminder');
      const keyboard = new InlineKeyboard().text('✅ Подтвердить', `confirm_reminder:${reminderId}`);
      
      await bot.api.sendMessage(chatId.toString(), `🔔 Повторное напоминание:\n\n${message}`, {
        reply_markup: keyboard,
      });
      
      scheduleRetry(bot, reminderId, userId, chatId, reminder.retryCount);
      
      console.log(`🔁 Отправлено повторное напоминание ${reminderId} (попытка ${reminder.retryCount})`);
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

export function stopAllTasks() {
  for (const task of tasks.values()) {
    task.stop();
  }
  tasks.clear();
  
  for (const timeout of retryTimeouts.values()) {
    clearTimeout(timeout);
  }
  retryTimeouts.clear();
  
  console.log('🛑 Все задачи остановлены');
}
