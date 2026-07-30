import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import type { AccessTokenPayload } from "../../auth/auth.types";
import { AppConfigService } from "../../config/app-config.service";

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly config: AppConfigService,
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

    throw new ForbiddenException("Solo administradores de la app.");
  }
}
