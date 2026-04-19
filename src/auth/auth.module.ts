import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { AccessTokenGuard } from "../common/guards/access-token.guard";
import { AdminGuard } from "../common/guards/admin.guard";
import { AppConfigService } from "../config/app-config.service";
import { DatabaseModule } from "../database/database.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { AdminController } from "./admin.controller";
import { AuthController } from "./auth.controller";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import { GoogleIdentityService } from "./google-identity.service";

@Module({
  imports: [DatabaseModule, InfrastructureModule, JwtModule.register({})],
  controllers: [AuthController, AdminController],
  providers: [
    AppConfigService,
    AccessTokenGuard,
    AdminGuard,
    AuthRepository,
    AuthService,
    GoogleIdentityService,
  ],
  exports: [AuthService, AccessTokenGuard, AdminGuard, AppConfigService, JwtModule],
})
export class AuthModule {}
