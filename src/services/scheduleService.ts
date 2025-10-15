import {prisma} from '../lib/prisma';

export async function createSchedule(userId: string, chatId: bigint, times: string[]) {
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
