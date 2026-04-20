import { Injectable, NotFoundException } from "@nestjs/common";
import {
  type NotificationEntityType,
  type NotificationType,
  Prisma,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PrismaService } from "../database/prisma.service";
import { serializeNotification } from "../lib/api-presenters";
import { NotificationsRepository } from "../infrastructure/repositories/notifications.repository";
import { ListNotificationsQueryDto } from "./dto/list-notifications.query.dto";
import { UpsertPushTokenDto } from "./dto/upsert-push-token.dto";

type PublishNotificationInput = {
  actorId?: string;
  dedupeKey?: string;
  entity?: {
    id: string;
    type: NotificationEntityType;
  };
  payload?: Record<string, unknown>;
  recipientIds: string[];
  scheduledFor?: Date;
  type: NotificationType;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly prisma: PrismaService,
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

  async registerMyPushInstallation(userId: string, input: UpsertPushTokenDto) {
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.pushInstallation.updateMany({
        where: {
          installationId: {
            not: input.installationId,
          },
          provider: input.provider,
          revokedAt: null,
          token: input.token,
        },
        data: {
          revokedAt: now,
        },
      });

      await tx.pushInstallation.upsert({
        where: {
          provider_installationId: {
            installationId: input.installationId,
            provider: input.provider,
          },
        },
        update: {
          disabledAt: null,
          lastSeenAt: now,
          platform: input.platform,
          revokedAt: null,
          timezone: input.timezone,
          token: input.token,
          userId,
        },
        create: {
          installationId: input.installationId,
          lastSeenAt: now,
          platform: input.platform,
          provider: input.provider,
          timezone: input.timezone,
          token: input.token,
          userId,
        },
      });
    });

    return {};
  }

  async revokeMyPushInstallation(userId: string, installationId: string) {
    await this.prisma.pushInstallation.updateMany({
      where: {
        installationId,
        revokedAt: null,
        userId,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {};
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
      return {
        count: 0,
        deliveryCount: 0,
      };
    }

    const payload = normalizeNotificationPayload(input.payload);
    const scheduledFor = input.scheduledFor ?? new Date();

    return this.prisma.$transaction(async (tx) => {
      const existingByUserId = new Set<string>();

      if (input.dedupeKey) {
        const existing = await tx.notification.findMany({
          where: {
            dedupeKey: input.dedupeKey,
            userId: {
              in: recipientIds,
            },
          },
          select: {
            userId: true,
          },
        });

        for (const row of existing) {
          existingByUserId.add(row.userId);
        }
      }

      const candidateRecipientIds = recipientIds.filter(
        (recipientId) => !existingByUserId.has(recipientId),
      );

      if (candidateRecipientIds.length === 0) {
        return {
          count: 0,
          deliveryCount: 0,
        };
      }

      const recipients = await tx.user.findMany({
        where: {
          id: {
            in: candidateRecipientIds,
          },
        },
        select: {
          id: true,
          pushInstallations: {
            where: {
              disabledAt: null,
              revokedAt: null,
            },
            orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
            select: {
              id: true,
            },
          },
          settings: {
            select: {
              pushEnabled: true,
            },
          },
        },
      });

      const recipientsById = new Map(recipients.map((row) => [row.id, row]));

      let count = 0;
      let deliveryCount = 0;

      for (const recipientId of candidateRecipientIds) {
        const recipient = recipientsById.get(recipientId);

        if (!recipient) {
          continue;
        }

        try {
          const notification = await tx.notification.create({
            data: {
              actorId: input.actorId ?? null,
              dedupeKey: input.dedupeKey ?? null,
              entityId: input.entity?.id ?? null,
              entityType: input.entity?.type ?? null,
              payload: payload ?? Prisma.JsonNull,
              type: input.type,
              userId: recipientId,
            },
            select: {
              id: true,
            },
          });

          count += 1;

          const shouldCreatePushDeliveries =
            (recipient.settings?.pushEnabled ?? true) &&
            recipient.pushInstallations.length > 0;

          if (!shouldCreatePushDeliveries) {
            continue;
          }

          const createdDeliveries = await tx.pushDelivery.createMany({
            data: recipient.pushInstallations.map((installation) => ({
              installationId: installation.id,
              notificationId: notification.id,
              scheduledFor,
              status: "pending",
            })),
            skipDuplicates: true,
          });

          deliveryCount += createdDeliveries.count;
        } catch (error) {
          if (isNotificationDedupeConflict(error, input.dedupeKey)) {
            continue;
          }

          throw error;
        }
      }

      return {
        count,
        deliveryCount,
      };
    });
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

function isNotificationDedupeConflict(
  error: unknown,
  dedupeKey?: string,
) {
  if (!dedupeKey) {
    return false;
  }

  return (
    error instanceof PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
