import { Global, Module } from "@nestjs/common";
import { CacheModule } from "@nestjs/cache-manager";

import { AppConfigModule } from "../../config/app-config.module";
import { AppConfigService } from "../../config/app-config.service";
import { buildCacheManagerOptions } from "./cache-store.factory";
import { DistributedSingleFlightService } from "./distributed-single-flight.service";

@Global()
@Module({
  imports: [
    AppConfigModule,
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        buildCacheManagerOptions({
          redisUrl: config.redisUrl,
          ttlMs: config.cacheTtlMs,
        }),
    }),
  ],
  providers: [DistributedSingleFlightService],
  exports: [CacheModule, DistributedSingleFlightService],
})
export class FecaCacheModule {}
