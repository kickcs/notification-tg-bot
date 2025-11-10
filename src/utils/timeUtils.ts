export function validateTime(time: string): boolean {
  const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
  return timeRegex.test(time);
}

export function parseTimes(input: string): string[] {
  return input.split(',').map(t => t.trim()).filter(t => t.length > 0);
}

export function validateTimes(times: string[]): { valid: boolean; invalidTimes: string[] } {
  const invalidTimes = times.filter(time => !validateTime(time));
  return {
    valid: invalidTimes.length === 0,
    invalidTimes,
  };
}

export function timeToCron(time: string): string {
  const [hours, minutes] = time.split(':');
  return `${minutes} ${hours} * * *`;
}

export function formatTimes(times: string[]): string {
  return times.join(', ');
}

export function getCurrentTimeFormatted(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function calculateDelayAmount(actualConfirmedAt: Date, scheduledTime: string): number {
  const [hours, minutes] = scheduledTime.split(':').map(Number);

  const scheduledDate = new Date();
  scheduledDate.setHours(hours, minutes, 0, 0);

  // Если scheduledTime в прошлом относительно фактического времени подтверждения, добавляем день
  if (scheduledDate < actualConfirmedAt) {
    scheduledDate.setDate(scheduledDate.getDate() + 1);
  }

  const diffMs = actualConfirmedAt.getTime() - scheduledDate.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  // console.log(`[DEBUG] calculateDelayAmount: scheduled=${scheduledTime}, confirmed=${actualConfirmedAt.toLocaleTimeString()}, scheduledDate=${scheduledDate.toLocaleString()}, delay=${diffMinutes}min`);

  return Math.max(0, diffMinutes);
}

export function addDelayToTime(scheduledTime: string, delayMinutes: number): Date {
  const [hours, minutes] = scheduledTime.split(':').map(Number);

  const scheduledDate = new Date();
  scheduledDate.setHours(hours, minutes, 0, 0);

  scheduledDate.setMinutes(scheduledDate.getMinutes() + delayMinutes);

  return scheduledDate;
}

export function calculateNextNotificationTime(
  scheduledTime: string,
  actualConfirmedAt: Date,
  maxDelayMinutes: number
): Date {
  const actualDelay = calculateDelayAmount(actualConfirmedAt, scheduledTime);
  const cappedDelay = Math.min(actualDelay, maxDelayMinutes);

  return addDelayToTime(scheduledTime, cappedDelay);
}

// Функция для расчета задержки уведомления в последовательном режиме
export function calculateSequentialDelay(actualConfirmedAt: Date, scheduledTime: string): number {
  const [hours, minutes] = scheduledTime.split(':').map(Number);

  const scheduledDate = new Date();
  scheduledDate.setHours(hours, minutes, 0, 0);
  // Используем ту же дату, что и у подтверждения, но с временем из расписания
  scheduledDate.setFullYear(actualConfirmedAt.getFullYear(), actualConfirmedAt.getMonth(), actualConfirmedAt.getDate());

  // Если запланированное время еще не наступило сегодня, используем вчерашний день
  if (scheduledDate > actualConfirmedAt) {
    scheduledDate.setDate(scheduledDate.getDate() - 1);
  }

  const diffMs = actualConfirmedAt.getTime() - scheduledDate.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  return Math.max(0, diffMinutes);
}

// Новая функция для расчета времени следующего уведомления в последовательном режиме
export function calculateNextSequentialNotificationTime(
  previousScheduledTime: string,
  nextScheduledTime: string,
  actualConfirmedAt: Date,
  maxDelayMinutes: number
): Date {
  // Рассчитываем задержку предыдущего уведомления через специальную функцию
  const previousDelay = calculateSequentialDelay(actualConfirmedAt, previousScheduledTime);
  const cappedDelay = Math.min(previousDelay, maxDelayMinutes);

  // Добавляем эту же задержку ко времени следующего уведомления
  return addDelayToTime(nextScheduledTime, cappedDelay);
}

export function isTimeWithinMaxDelay(
  actualTime: Date,
  scheduledTime: string,
  maxDelayMinutes: number
): boolean {
  const delay = calculateDelayAmount(actualTime, scheduledTime);
  return delay <= maxDelayMinutes;
}

export function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function getDelayDescription(delayMinutes: number): string {
  if (delayMinutes < 60) {
    return `${delayMinutes} минут`;
  } else if (delayMinutes < 1440) { // Less than 24 hours
    const hours = Math.floor(delayMinutes / 60);
    const minutes = delayMinutes % 60;
    if (minutes === 0) {
      return `${hours} час${hours > 1 ? 'а' : ''}`;
    }
    return `${hours} час${hours > 1 ? 'а' : ''} ${minutes} минут`;
  } else {
    const days = Math.floor(delayMinutes / 1440);
    const hours = Math.floor((delayMinutes % 1440) / 60);
    if (hours === 0) {
      return `${days} день${days > 1 ? '' : ''}`;
    }
    return `${days} день${days > 1 ? '' : ''} ${hours} час${hours > 1 ? 'а' : ''}`;
  }
}
