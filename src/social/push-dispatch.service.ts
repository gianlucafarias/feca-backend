import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { AppConfigService } from "../config/app-config.service";
import { PrismaService } from "../database/prisma.service";
import { serializeNotification } from "../lib/api-presenters";

const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const EXPO_CHANNEL_ID = "feca-default";
const MAX_SEND_BATCH_SIZE = 100;
const MAX_RECEIPT_BATCH_SIZE = 300;
const MAX_SEND_ATTEMPTS = 5;

const deliveryInclude = Prisma.validator<Prisma.PushDeliveryInclude>()({
  installation: {
    select: {
      disabledAt: true,
      id: true,
      platform: true,
      revokedAt: true,
      token: true,
      userId: true,
    },
  },
  notification: {
    include: {
      actor: {
        select: {
          avatarUrl: true,
          city: true,
          displayName: true,
          id: true,
          username: true,
        },
      },
    },
  },
});

type DeliveryRow = Prisma.PushDeliveryGetPayload<{
  include: typeof deliveryInclude;
}>;

type ExpoPushTicket =
  | {
      id: string;
      status: "ok";
    }
  | {
      details?: {
        error?: string;
      };
      message?: string;
      status: "error";
    };

type ExpoPushSendResponse = {
  data?: ExpoPushTicket | ExpoPushTicket[];
  errors?: Array<{ code?: string; message?: string }>;
};

type ExpoPushReceipt = {
  details?: {
    error?: string;
  };
  message?: string;
  status: "ok" | "error";
};

type ExpoPushReceiptsResponse = {
  data?: Record<string, ExpoPushReceipt>;
  errors?: Array<{ code?: string; message?: string }>;
};

@Injectable()
export class PushDispatchService {
  private readonly logger = new Logger(PushDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async dispatchPending(limit = 100) {
    const deliveries = await this.prisma.pushDelivery.findMany({
      where: {
        scheduledFor: {
          lte: new Date(),
        },
        status: "pending",
      },
      include: deliveryInclude,
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
      take: limit,
    });

    if (deliveries.length === 0) {
      return {
        cancelled: 0,
        failed: 0,
        processed: 0,
        ticketed: 0,
      };
    }

    const inactiveDeliveries = deliveries.filter(
      (delivery) =>
        delivery.installation.disabledAt !== null ||
        delivery.installation.revokedAt !== null ||
        !delivery.installation.token,
    );
    const activeDeliveries = deliveries.filter(
      (delivery) => !inactiveDeliveries.some((entry) => entry.id === delivery.id),
    );

    let cancelled = 0;
    if (inactiveDeliveries.length > 0) {
      const result = await this.prisma.pushDelivery.updateMany({
        where: {
          id: {
            in: inactiveDeliveries.map((delivery) => delivery.id),
          },
        },
        data: {
          failedAt: new Date(),
          lastError: "Installation is inactive",
          status: "cancelled",
        },
      });
      cancelled = result.count;
    }

    if (activeDeliveries.length === 0) {
      return {
        cancelled,
        failed: 0,
        processed: deliveries.length,
        ticketed: 0,
      };
    }

    const unreadCounts = await this.prisma.notification.groupBy({
      by: ["userId"],
      where: {
        readAt: null,
        userId: {
          in: Array.from(
            new Set(activeDeliveries.map((delivery) => delivery.notification.userId)),
          ),
        },
      },
      _count: {
        _all: true,
      },
    });

    const unreadCountByUserId = new Map(
      unreadCounts.map((row) => [row.userId, row._count._all]),
    );

    let ticketed = 0;
    let failed = 0;

    for (const batch of chunk(activeDeliveries, MAX_SEND_BATCH_SIZE)) {
      const sendAt = new Date();
      const messages = batch.map((delivery) => {
        const presentation = serializeNotification(delivery.notification);

        return {
          badge: unreadCountByUserId.get(delivery.notification.userId),
          body: presentation.body,
          channelId: EXPO_CHANNEL_ID,
          data: {
            deepLink: presentation.deepLink,
            notificationId: presentation.id,
            type: presentation.type,
          },
          priority: "high",
          sound: "default",
          title: presentation.title,
          to: delivery.installation.token,
        };
      });

      try {
        const response = await this.postExpo<ExpoPushSendResponse>(
          EXPO_PUSH_SEND_URL,
          messages,
        );
        const tickets = normalizeExpoTickets(response.data);

        if (tickets.length !== batch.length) {
          throw new Error("Expo push tickets count mismatch");
        }

        for (let index = 0; index < batch.length; index += 1) {
          const delivery = batch[index]!;
          const ticket = tickets[index]!;
          const attemptCount = delivery.attemptCount + 1;

          if (ticket.status === "ok") {
            await this.prisma.pushDelivery.update({
              where: { id: delivery.id },
              data: {
                attemptCount,
                expoTicketId: ticket.id,
                failedAt: null,
                lastError: null,
                sentAt: sendAt,
                status: "ticketed",
              },
            });
            ticketed += 1;
            continue;
          }

          const errorCode = ticket.details?.error;
          const message = buildExpoErrorMessage(ticket.message, errorCode);
          const nextStatus =
            isPermanentExpoError(errorCode) || attemptCount >= MAX_SEND_ATTEMPTS
              ? "failed"
              : "pending";

          await this.prisma.pushDelivery.update({
            where: { id: delivery.id },
            data: {
              attemptCount,
              failedAt: nextStatus === "failed" ? sendAt : null,
              lastError: message,
              sentAt: nextStatus === "failed" ? sendAt : null,
              status: nextStatus,
            },
          });

          if (shouldDisableInstallation(errorCode)) {
            await this.disableInstallation(delivery.installation.id, sendAt);
          }

          if (nextStatus === "failed") {
            failed += 1;
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Expo push send failed";
        this.logger.error(`Expo push send batch failed: ${message}`);

        for (const delivery of batch) {
          const attemptCount = delivery.attemptCount + 1;
          const nextStatus =
            attemptCount >= MAX_SEND_ATTEMPTS ? "failed" : "pending";

          await this.prisma.pushDelivery.update({
            where: { id: delivery.id },
            data: {
              attemptCount,
              failedAt: nextStatus === "failed" ? sendAt : null,
              lastError: message,
              sentAt: nextStatus === "failed" ? sendAt : null,
              status: nextStatus,
            },
          });

          if (nextStatus === "failed") {
            failed += 1;
          }
        }
      }
    }

    return {
      cancelled,
      failed,
      processed: deliveries.length,
      ticketed,
    };
  }

  async syncReceipts(limit = 300) {
    const deliveries = await this.prisma.pushDelivery.findMany({
      where: {
        expoTicketId: {
          not: null,
        },
        status: "ticketed",
      },
      include: {
        installation: {
          select: {
            id: true,
          },
        },
      },
      orderBy: [{ sentAt: "asc" }, { createdAt: "asc" }],
      take: limit,
    });

    if (deliveries.length === 0) {
      return {
        checked: 0,
        delivered: 0,
        failed: 0,
      };
    }

    let delivered = 0;
    let failed = 0;

    for (const batch of chunk(deliveries, MAX_RECEIPT_BATCH_SIZE)) {
      const receiptIds = batch
        .map((delivery) => delivery.expoTicketId)
        .filter((id): id is string => Boolean(id));

      if (receiptIds.length === 0) {
        continue;
      }

      try {
        const response = await this.postExpo<ExpoPushReceiptsResponse>(
          EXPO_PUSH_RECEIPTS_URL,
          { ids: receiptIds },
        );
        const receipts = response.data ?? {};
        const handledAt = new Date();

        for (const delivery of batch) {
          const receiptId = delivery.expoTicketId;
          if (!receiptId) {
            continue;
          }

          const receipt = receipts[receiptId];
          if (!receipt) {
            continue;
          }

          if (receipt.status === "ok") {
            await this.prisma.pushDelivery.update({
              where: { id: delivery.id },
              data: {
                deliveredAt: handledAt,
                failedAt: null,
                lastError: null,
                status: "delivered",
              },
            });
            delivered += 1;
            continue;
          }

          const errorCode = receipt.details?.error;
          await this.prisma.pushDelivery.update({
            where: { id: delivery.id },
            data: {
              failedAt: handledAt,
              lastError: buildExpoErrorMessage(receipt.message, errorCode),
              status: "failed",
            },
          });

          if (shouldDisableInstallation(errorCode)) {
            await this.disableInstallation(delivery.installation.id, handledAt);
          }

          failed += 1;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Expo receipt sync failed";
        this.logger.error(`Expo push receipt sync failed: ${message}`);
      }
    }

    return {
      checked: deliveries.length,
      delivered,
      failed,
    };
  }

  private async postExpo<T>(url: string, body: unknown) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.config.expoAccessToken) {
      headers.Authorization = `Bearer ${this.config.expoAccessToken}`;
    }

    const response = await fetch(url, {
      body: JSON.stringify(body),
      headers,
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Expo API responded ${response.status}`);
    }

    return (await response.json()) as T;
  }

  private async disableInstallation(installationId: string, at: Date) {
    await this.prisma.pushInstallation.updateMany({
      where: {
        disabledAt: null,
        id: installationId,
      },
      data: {
        disabledAt: at,
      },
    });
  }
}

function normalizeExpoTickets(data?: ExpoPushSendResponse["data"]) {
  if (!data) {
    return [];
  }

  return Array.isArray(data) ? data : [data];
}

function buildExpoErrorMessage(message?: string, code?: string) {
  if (message && code) {
    return `${code}: ${message}`;
  }

  return code ?? message ?? "Unknown Expo push error";
}

function isPermanentExpoError(errorCode?: string) {
  return errorCode === "DeviceNotRegistered" || errorCode === "MessageTooBig";
}

function shouldDisableInstallation(errorCode?: string) {
  return errorCode === "DeviceNotRegistered";
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
