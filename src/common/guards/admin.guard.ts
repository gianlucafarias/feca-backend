import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import { AuthRepository } from "../../auth/auth.repository";
import type { AccessTokenPayload } from "../../auth/auth.types";
import { AppConfigService } from "../../config/app-config.service";

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly config: AppConfigService,
    private readonly authRepository: AuthRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AccessTokenPayload;
    }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("Solo administradores de la app.");
    }

    if (this.config.isFecaAdminEmail(user.email)) {
      return true;
    }

    const adminOverride = await this.authRepository.findUserAdminOverride(user.sub);
    if (adminOverride?.isAdminOverride) {
      return true;
    }

    throw new ForbiddenException("Solo administradores de la app.");
  }
}
