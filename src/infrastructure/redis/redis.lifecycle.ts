import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import Redis from "ioredis";

import { AppConfigService } from "../../config/app-config.service";
import { writeStructuredLog } from "../../common/logging/structured-logger";
import { REDIS_CLIENT } from "./redis.constants";

@Injectable()
export class RedisLifecycleService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
    private readonly config: AppConfigService,
  ) {}

  async onModuleInit() {
    if (!this.redis) {
      return;
    }

    try {
      await this.redis.connect();
      writeStructuredLog("info", "redis_connected", {
        redisConfigured: true,
        nodeEnv: this.config.nodeEnv,
      });
    } catch (error) {
      writeStructuredLog("error", "redis_connect_failed", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async onModuleDestroy() {
    if (!this.redis) {
      return;
    }

    await this.redis.quit();
  }
}
