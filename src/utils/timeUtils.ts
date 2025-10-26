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
