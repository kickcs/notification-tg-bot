import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Начало заполнения базы данных...');

  const reminderTemplates = [
    '⏰ Пора принять таблетки! Не забудьте о своем здоровье.',
    '💊 Напоминание: время принять лекарство. Ваше здоровье важно!',
    '🔔 Привет! Пришло время для приема таблеток.',
    '⚕️ Не пропустите прием лекарства! Заботьтесь о себе.',
    '📋 Напоминаю: пора принять таблетки по расписанию.',
  ];

  const rewardTemplates = [
    '✅ Отлично! Вы приняли таблетки. Продолжайте в том же духе!',
    '🎉 Молодец! Регулярный прием лекарств - залог здоровья.',
    '👍 Супер! Вы не забыли про таблетки. Так держать!',
    '⭐ Прекрасно! Ваше здоровье в ваших руках.',
    '💪 Отличная работа! Вы заботитесь о своем здоровье.',
  ];

  for (const content of reminderTemplates) {
    await prisma.messageTemplate.create({
      data: {
        type: 'reminder',
        content,
        isActive: true,
      },
    });
  }

  for (const content of rewardTemplates) {
    await prisma.messageTemplate.create({
      data: {
        type: 'reward',
        content,
        isActive: true,
      },
    });
  }

  console.log(`✅ Создано ${reminderTemplates.length} шаблонов напоминаний`);
  console.log(`✅ Создано ${rewardTemplates.length} шаблонов наград`);
}

main()
  .catch((e) => {
    console.error('❌ Ошибка при заполнении базы данных:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
