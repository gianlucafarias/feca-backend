import { describe, expect, it, vi } from "vitest";

import type { AppConfigService } from "../config/app-config.service";
import type { PrismaService } from "../database/prisma.service";
import type { QueueService } from "../infrastructure/queue/queue.service";
import { PushDispatchService } from "./push-dispatch.service";

function buildService(input?: {
  stalledPending?: number;
  staleTicketed?: number;
}) {
  const stalledPending = input?.stalledPending ?? 0;
  const staleTicketed = input?.staleTicketed ?? 0;
  const prisma = {
    pushDelivery: {
      count: vi
        .fn()
        .mockResolvedValueOnce(stalledPending)
        .mockResolvedValueOnce(staleTicketed),
      findFirst: vi
        .fn()
        .mockResolvedValueOnce({
          scheduledFor: new Date("2026-07-30T09:00:00.000Z"),
        })
        .mockResolvedValueOnce({
          deliveredAt: new Date("2026-07-30T09:05:00.000Z"),
        }),
      groupBy: vi.fn().mockResolvedValue([
        { _count: { _all: 3 }, status: "pending" },
        { _count: { _all: 8 }, status: "delivered" },
      ]),
    },
  } as unknown as PrismaService;

  return new PushDispatchService(
    prisma,
    {} as AppConfigService,
    {} as QueueService,
  );
}

describe("PushDispatchService.getOperationalStatus", () => {
  it("reports delivery counts and timestamps", async () => {
    const service = buildService();

    await expect(
      service.getOperationalStatus(new Date("2026-07-30T10:00:00.000Z")),
    ).resolves.toEqual({
      counts: {
        cancelled: 0,
        delivered: 8,
        failed: 0,
        pending: 3,
        ticketed: 0,
      },
      healthy: true,
      latestDeliveredAt: "2026-07-30T09:05:00.000Z",
      oldestPendingAt: "2026-07-30T09:00:00.000Z",
      staleTicketed: 0,
      stalledPending: 0,
      thresholds: {
        pendingMinutes: 20,
        ticketHours: 24,
      },
    });
  });

  it("becomes unhealthy for stalled pending or stale ticketed deliveries", async () => {
    const service = buildService({
      stalledPending: 1,
      staleTicketed: 2,
    });

    await expect(service.getOperationalStatus()).resolves.toMatchObject({
      healthy: false,
      staleTicketed: 2,
      stalledPending: 1,
    });
  });
});
