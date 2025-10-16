import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Начало заполнения базы данных...');

  const reminderTemplates = [
    '⏰ Выпей таблеточки, моя мармеладочка.',
    '💊 Я хотю, чтобы ты была здорова, не забывай выпить таблеточки.',
    '🔔 Моя хорошая, сейчас тебе нужно выпить таблеточку.',
    '⚕️ Сейчас самая красивая девушка на планете должна выпить таблеточку.',
    '📋 Если бы существовали битвы между таблеточками, ты бы ее проиграла. Уничтожь ее.',
  ];

  const rewardTemplates = [
    '✅ Ты самая лучшая! Я горжусь тобой, моя мармеладочка.',
    '🎉 Ты победила таблеточку, теперь она внутри тебя работает на твое здоровье.',
    '👍 Самая красивая девушка на планете заботится о себе. Я доволен',
    '⭐ Я так рад, что ты выпила таблеточку.',
    '💪 Ты самая-самая, я люблю тебя.',
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
