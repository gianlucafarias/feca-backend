import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";
import type Redis from "ioredis";

import { AppConfigService } from "../config/app-config.service";
import { PrismaService } from "../database/prisma.service";
import { REDIS_CLIENT } from "../infrastructure/redis/redis.constants";

type HealthCheckStatus = "ok" | "down";

@Controller()
export class HealthController {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  @Get(["health", "health/live"])
  getLive() {
    return this.buildLiveResponse();
  }

  @Get("health/ready")
  async getReady() {
    const checks: Record<string, HealthCheckStatus> = {};

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.postgres = "ok";
    } catch {
      throw new ServiceUnavailableException({
        ok: false,
        service: "feca-backend",
        checks: { postgres: "down" },
        now: new Date().toISOString(),
      });
    }

    if (this.config.redisUrl) {
      try {
        if (!this.redis) {
          throw new Error("Redis client is not configured");
        }
        await this.redis.ping();
        checks.redis = "ok";
      } catch {
        throw new ServiceUnavailableException({
          ok: false,
          service: "feca-backend",
          checks: {
            postgres: checks.postgres,
            redis: "down",
          },
          now: new Date().toISOString(),
        });
      }
    }

    return {
      ...this.buildLiveResponse(),
      checks,
    };
  }

  private buildLiveResponse() {
    return {
      ok: true,
      service: "feca-backend",
      googlePlacesConfigured: Boolean(this.config.googleMapsApiKey),
      redisConfigured: Boolean(this.config.redisUrl),
      now: new Date().toISOString(),
    };
  }
}
