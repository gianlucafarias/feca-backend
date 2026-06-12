import { Global, Module } from "@nestjs/common";
import Redis from "ioredis";

import { AppConfigModule } from "../../config/app-config.module";
import { AppConfigService } from "../../config/app-config.service";
import { REDIS_CLIENT } from "./redis.constants";
import { RedisLifecycleService } from "./redis.lifecycle";

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): Redis | null => {
        const redisUrl = config.redisUrl;
        if (!redisUrl) {
          return null;
        }

        return new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 2,
        });
      },
    },
    RedisLifecycleService,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
