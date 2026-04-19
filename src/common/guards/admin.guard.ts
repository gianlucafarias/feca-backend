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
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: AccessTokenPayload;
    }>();
    const email = request.user?.email;
    if (!email || !this.config.isFecaAdminEmail(email)) {
      throw new ForbiddenException("Solo administradores de la app.");
    }
    return true;
  }
}
