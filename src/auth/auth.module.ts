import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { AccessTokenGuard } from "../common/guards/access-token.guard";
import { DatabaseModule } from "../database/database.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { AuthController } from "./auth.controller";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import { GoogleIdentityService } from "./google-identity.service";

@Module({
  imports: [DatabaseModule, InfrastructureModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AccessTokenGuard, AuthRepository, AuthService, GoogleIdentityService],
  exports: [AuthService, AccessTokenGuard, AuthRepository, JwtModule],
})
export class AuthModule {}
