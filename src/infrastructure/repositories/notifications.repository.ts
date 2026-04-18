import { Injectable } from "@nestjs/common";
import {
  NotificationEntityType,
  NotificationType,
  Prisma,
} from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";

const notificationActorSelect = Prisma.validator<Prisma.UserSelect>()({
  avatarUrl: true,
  city: true,
  displayName: true,
  id: true,
  username: true,
});

const notificationInclude = Prisma.validator<Prisma.NotificationInclude>()({
  actor: {
    select: notificationActorSelect,
  },
});

export type NotificationRow = Prisma.NotificationGetPayload<{
  include: typeof notificationInclude;
}>;

export type CreateNotificationInput = {
  actorId?: string;
  entityId?: string;
  entityType?: NotificationEntityType;
  payload?: Prisma.InputJsonValue;
  type: NotificationType;
  userId: string;
};

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createMany(input: CreateNotificationInput[]) {
    if (input.length === 0) {
      return { count: 0 };
    }

    return this.prisma.notification.createMany({
      data: input.map((item) => ({
        actorId: item.actorId ?? null,
        entityId: item.entityId ?? null,
        entityType: item.entityType ?? null,
        payload: item.payload ?? Prisma.JsonNull,
        type: item.type,
        userId: item.userId,
      })),
    });
  }

  async listForUser(
    userId: string,
    input: { limit: number; offset: number; unreadOnly?: boolean },
  ) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(input.unreadOnly ? { readAt: null } : {}),
    };

    const unreadWhere: Prisma.NotificationWhereInput = {
      userId,
      readAt: null,
    };

    const [notifications, total, unreadTotal] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        include: notificationInclude,
        orderBy: [{ createdAt: "desc" }],
        skip: input.offset,
        take: input.limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: unreadWhere }),
    ]);

    return {
      notifications,
      total,
      unreadTotal,
    };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
      select: {
        id: true,
        readAt: true,
      },
    });

    if (!notification) {
      return false;
    }

    if (!notification.readAt) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          readAt: new Date(),
        },
      });
    }

    return true;
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        readAt: null,
        userId,
      },
      data: {
        readAt: new Date(),
      },
    });

    return result.count;
  }
}
