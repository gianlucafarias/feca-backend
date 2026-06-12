import { Module } from "@nestjs/common";

import { AppConfigModule } from "../config/app-config.module";
import { DatabaseModule } from "../database/database.module";
import { RedisModule } from "../infrastructure/redis/redis.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [AppConfigModule, DatabaseModule, RedisModule],
  controllers: [HealthController],
})
export class HealthModule {}
