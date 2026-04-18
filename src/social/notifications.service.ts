import { Injectable, NotFoundException } from "@nestjs/common";
import {
  NotificationEntityType,
  NotificationType,
  Prisma,
} from "@prisma/client";

import { serializeNotification } from "../lib/api-presenters";
import { NotificationsRepository } from "../infrastructure/repositories/notifications.repository";
import { ListNotificationsQueryDto } from "./dto/list-notifications.query.dto";

type PublishNotificationInput = {
  actorId?: string;
  entity?: {
    id: string;
    type: NotificationEntityType;
  };
  payload?: Record<string, unknown>;
  recipientIds: string[];
  type: NotificationType;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationsRepository: NotificationsRepository,
  ) {}

  async listMyNotifications(userId: string, query: ListNotificationsQueryDto) {
    const result = await this.notificationsRepository.listForUser(userId, query);

    return {
      notifications: result.notifications.map(serializeNotification),
      total: result.total,
      unreadTotal: result.unreadTotal,
    };
  }

  async markMyNotificationRead(userId: string, notificationId: string) {
    const found = await this.notificationsRepository.markRead(
      userId,
      notificationId,
    );

    if (!found) {
      throw new NotFoundException("Notification not found");
    }

    return {};
  }

  async markAllMyNotificationsRead(userId: string) {
    const updatedCount = await this.notificationsRepository.markAllRead(userId);

    return {
      updatedCount,
    };
  }

  async publish(input: PublishNotificationInput) {
    const recipientIds = Array.from(
      new Set(
        input.recipientIds.filter(
          (recipientId) =>
            Boolean(recipientId) &&
            (!input.actorId || recipientId !== input.actorId),
        ),
      ),
    );

    if (recipientIds.length === 0) {
      return { count: 0 };
    }

    const payload = normalizeNotificationPayload(input.payload);

    return this.notificationsRepository.createMany(
      recipientIds.map((recipientId) => ({
        actorId: input.actorId,
        entityId: input.entity?.id,
        entityType: input.entity?.type,
        payload,
        type: input.type,
        userId: recipientId,
      })),
    );
  }
}

function normalizeNotificationPayload(
  payload?: Record<string, unknown>,
): Prisma.InputJsonValue | undefined {
  if (!payload) {
    return undefined;
  }

  const entries = Object.entries(payload).filter(([, value]) => value !== undefined);

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries) as Prisma.InputJsonValue;
}
