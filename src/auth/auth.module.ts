import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { AccessTokenGuard } from "../common/guards/access-token.guard";
import { AppConfigService } from "../config/app-config.service";
import { DatabaseModule } from "../database/database.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { AuthController } from "./auth.controller";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import { GoogleIdentityService } from "./google-identity.service";

@Module({
  imports: [DatabaseModule, InfrastructureModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AppConfigService,
    AccessTokenGuard,
    AuthRepository,
    AuthService,
    GoogleIdentityService,
  ],
  exports: [AuthService, AccessTokenGuard, AppConfigService, JwtModule],
})
export class AuthModule {}
