import {
  MiddlewareConsumer,
  Module,
  NestModule,
} from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import type Redis from "ioredis";

import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { HttpMetricsInterceptor } from "./common/metrics/http-metrics.interceptor";
import { HttpMetricsService } from "./common/metrics/http-metrics.service";
import { RequestContextMiddleware } from "./common/request-context/request-context.middleware";
import { AppConfigModule } from "./config/app-config.module";
import { AppConfigService } from "./config/app-config.service";
import type { AppEnvironment } from "./config/env.validation";
import { validateEnv } from "./config/env.validation";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { GoogleDataPortabilityModule } from "./google-data-portability/google-data-portability.module";
import { HealthModule } from "./health/health.module";
import { FecaCacheModule } from "./infrastructure/cache/feca-cache.module";
import { InfrastructureModule } from "./infrastructure/infrastructure.module";
import { QueueModule } from "./infrastructure/queue/queue.module";
import { REDIS_CLIENT } from "./infrastructure/redis/redis.constants";
import { RedisModule } from "./infrastructure/redis/redis.module";
import { PlacesModule } from "./places/places.module";
import { SocialModule } from "./social/social.module";
import { VisitsModule } from "./visits/visits.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    AppConfigModule,
    RedisModule,
    QueueModule,
    FecaCacheModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService, REDIS_CLIENT],
      useFactory: (config: AppConfigService, redis: Redis | null) => {
        const options = {
          throttlers: [
            {
              ttl: config.rateLimitTtl,
              limit: config.rateLimitLimit,
            },
          ],
        };

        if (redis) {
          return {
            ...options,
            storage: new ThrottlerStorageRedisService(redis),
          };
        }

        return options;
      },
    }),
    AdminModule,
    AuthModule,
    GoogleDataPortabilityModule,
    InfrastructureModule,
    HealthModule,
    PlacesModule,
    SocialModule,
    VisitsModule,
  ],
  providers: [
    HttpMetricsService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes("*");
  }
}
