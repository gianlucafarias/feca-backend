import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { AppConfigService } from "../../config/app-config.service";
import type { AccessTokenPayload } from "../../auth/auth.types";

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AccessTokenPayload;
    }>();
    const header = request.headers.authorization;

    if (!header || Array.isArray(header)) {
      throw new UnauthorizedException("Missing Authorization header");
    }

    const [type, token] = header.split(" ");

    if (type !== "Bearer" || !token) {
      throw new UnauthorizedException("Invalid Authorization header");
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        {
          secret: this.config.authJwtAccessSecret,
        },
      );

      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid access token");
    }
  }
}
