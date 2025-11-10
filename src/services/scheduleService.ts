import {prisma} from '../lib/prisma';

export async function createSchedule(userId: string, chatId: bigint, times: string[], useSequentialDelay: boolean = false) {
    const existingSchedule = await prisma.schedule.findFirst({
        where: {
            userId,
            chatId,
            isActive: true,
        },
    });

    if (existingSchedule) {
        throw new Error('У вас уже есть активное расписание в этой группе');
    }

    return await prisma.schedule.create({
        data: {
            userId,
            chatId,
            times,
            useSequentialDelay,
            isActive: true,
        },
    });
}

export async function getActiveSchedule(userId: string, chatId: bigint) {
    return await prisma.schedule.findFirst({
        where: {
            userId,
            chatId,
            isActive: true,
        },
    });
}

export async function getAllActiveSchedules() {
    return await prisma.schedule.findMany({
        where: {
            isActive: true,
        },
        include: {
            user: true,
        },
    });
}

export async function updateSchedule(scheduleId: string, times: string[]) {
    return await prisma.schedule.update({
        where: {id: scheduleId},
        data: {
            times,
            updatedAt: new Date(),
        },
    });
}

export async function updateScheduleSequentialMode(scheduleId: string, useSequentialDelay: boolean) {
    const schedule = await prisma.schedule.findUnique({
        where: {id: scheduleId},
        include: {
            user: true,
        },
    });

    if (!schedule) {
        throw new Error('Расписание не найдено');
    }

    const updatedSchedule = await prisma.schedule.update({
        where: {id: scheduleId},
        data: {
            useSequentialDelay,
            updatedAt: new Date(),
        },
    });

    // Если включаем последовательный режим, создаем все напоминания заранее
    if (useSequentialDelay && !schedule.useSequentialDelay) {
        const {createRemindersForSchedule} = await import('./reminderService');
        await createRemindersForSchedule(scheduleId, schedule.times);
    }

    return updatedSchedule;
}

export async function deleteSchedule(scheduleId: string) {
    return await prisma.schedule.update({
        where: {id: scheduleId},
        data: {
            isActive: false,
        },
    });
}

export async function getUserSchedules(userId: string) {
    return await prisma.schedule.findMany({
        where: {
            userId,
            isActive: true,
        },
    });
}
