import { CacheModule } from "@nestjs/cache-manager";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import type { AppEnvironment } from "./config/env.validation";
import { validateEnv } from "./config/env.validation";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { InfrastructureModule } from "./infrastructure/infrastructure.module";
import { PlacesModule } from "./places/places.module";
import { SocialModule } from "./social/social.module";
import { VisitsModule } from "./visits/visits.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnvironment, true>) => ({
        ttl: config.get("CACHE_TTL_MS", { infer: true }),
        max: config.get("CACHE_MAX_ITEMS", { infer: true }),
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnvironment, true>) => [
        {
          ttl: config.get("RATE_LIMIT_TTL", { infer: true }),
          limit: config.get("RATE_LIMIT_LIMIT", { infer: true }),
        },
      ],
    }),
    AuthModule,
    InfrastructureModule,
    HealthModule,
    PlacesModule,
    SocialModule,
    VisitsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
