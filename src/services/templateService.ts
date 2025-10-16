import { prisma } from '../lib/prisma';

const MAX_MESSAGE_LENGTH = 4096;

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

export async function createTemplate(type: 'reminder' | 'reward', content: string) {
  if (!content || content.trim().length === 0) {
    throw new Error('Содержимое шаблона не может быть пустым');
  }

  if (content.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Содержимое шаблона не может превышать ${MAX_MESSAGE_LENGTH} символов`);
  }

  return prisma.messageTemplate.create({
    data: {
      type,
      content: content.trim(),
      isActive: true,
    },
  });
}

export async function deleteTemplate(id: string) {
  const template = await prisma.messageTemplate.findUnique({
    where: { id },
  });

  if (!template) {
    throw new Error('Шаблон не найден');
  }

  return prisma.messageTemplate.delete({
    where: { id },
  });
}

export async function getAllTemplates(type?: 'reminder' | 'reward') {
  return prisma.messageTemplate.findMany({
    where: type ? { type } : undefined,
    orderBy: [
      { type: 'asc' },
      { createdAt: 'desc' },
    ],
  });
}
