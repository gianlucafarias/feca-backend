import { Test } from "@nestjs/testing";
import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AppConfigService } from "../../src/config/app-config.service";
import { PrismaService } from "../../src/database/prisma.service";
import { HealthController } from "../../src/health/health.controller";
import { REDIS_CLIENT } from "../../src/infrastructure/redis/redis.constants";

describe("HealthController", () => {
  const prismaMock = {
    $queryRaw: vi.fn(),
  };

  async function createController(config: Partial<AppConfigService> = {}) {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: AppConfigService,
          useValue: {
            googleMapsApiKey: "test-key",
            redisUrl: undefined,
            ...config,
          },
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: REDIS_CLIENT,
          useValue: null,
        },
      ],
    }).compile();

    return moduleRef.get(HealthController);
  }

  it("returns live health for /health and /health/live", async () => {
    const controller = await createController();
    const response = controller.getLive();

    expect(response.ok).toBe(true);
    expect(response.service).toBe("feca-backend");
    expect(response.googlePlacesConfigured).toBe(true);
    expect(response.redisConfigured).toBe(false);
    expect(typeof response.now).toBe("string");
  });

  it("returns ready health when postgres responds", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    const controller = await createController();

    await expect(controller.getReady()).resolves.toMatchObject({
      ok: true,
      checks: { postgres: "ok" },
    });
  });

  it("throws service unavailable when postgres is down", async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error("connection refused"));
    const controller = await createController();

    await expect(controller.getReady()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("checks redis when configured", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    const redisMock = { ping: vi.fn().mockResolvedValue("PONG") };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: AppConfigService,
          useValue: {
            googleMapsApiKey: "test-key",
            redisUrl: "redis://localhost:6379",
          },
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: REDIS_CLIENT,
          useValue: redisMock,
        },
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    await expect(controller.getReady()).resolves.toMatchObject({
      ok: true,
      checks: { postgres: "ok", redis: "ok" },
    });
    expect(redisMock.ping).toHaveBeenCalledOnce();
  });
});
