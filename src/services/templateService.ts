import { prisma } from '../lib/prisma';

export async function getRandomTemplate(type: 'reminder' | 'reward'): Promise<string> {
  const templates = await prisma.messageTemplate.findMany({
    where: {
      type,
      isActive: true,
    },
  });

  if (templates.length === 0) {
    if (type === 'reminder') {
      return '⏰ Пора принять таблетки! Не забудьте о своем здоровье.';
    } else {
      return '✅ Отлично! Вы приняли таблетки. Продолжайте в том же духе!';
    }
  }

  const randomIndex = Math.floor(Math.random() * templates.length);
  return templates[randomIndex].content;
}
