import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AccessTokenGuard } from "../common/guards/access-token.guard";
import { AppConfigService } from "../config/app-config.service";
import type { AccessTokenPayload } from "./auth.types";
import { AuthService } from "./auth.service";
import { GoogleMobileAuthDto } from "./dto/google-mobile-auth.dto";
import { RefreshSessionDto } from "./dto/refresh-session.dto";
import { UpdateMeDto } from "./dto/update-me.dto";

const WEB_REFRESH_COOKIE = "feca_refresh";

@Controller("v1")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Post("auth/google/mobile")
  async authenticateWithGoogle(@Body() body: GoogleMobileAuthDto) {
    return this.authService.authenticateWithGoogle(body.idToken);
  }

  /**
   * Browser auth uses the same Google identity contract as mobile, but keeps
   * the rotating refresh token in an HttpOnly cookie shared by feca.cc and
   * api.feca.cc. The access token is intentionally returned to the browser
   * only for in-memory use.
   */
  @Post("auth/google/web")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async authenticateWithGoogleWeb(
    @Body() body: GoogleMobileAuthDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.authenticateWithGoogle(body.idToken);
    this.setWebRefreshCookie(response, result.session.refreshToken, result.session.refreshTokenExpiresAt);

    return {
      isNewUser: result.isNewUser,
      session: withoutRefreshToken(result.session),
    };
  }

  @Post("auth/refresh")
  async refresh(@Body() body: RefreshSessionDto) {
    const session = await this.authService.refreshSession(body.refreshToken);
    return { session };
  }

  @Post("auth/refresh/web")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async refreshWeb(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = readCookie(request, WEB_REFRESH_COOKIE);
    if (!refreshToken) {
      throw new UnauthorizedException("No active web session");
    }

    const session = await this.authService.refreshSession(refreshToken);
    this.setWebRefreshCookie(response, session.refreshToken, session.refreshTokenExpiresAt);
    return { session: withoutRefreshToken(session) };
  }

  @Post("auth/logout")
  async logout(@Body() body: RefreshSessionDto) {
    await this.authService.logout(body.refreshToken);
    return {};
  }

  @Post("auth/logout/web")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutWeb(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = readCookie(request, WEB_REFRESH_COOKIE);
    try {
      if (refreshToken) {
        await this.authService.logout(refreshToken);
      }
    } finally {
      this.clearWebRefreshCookie(response);
    }
  }

  @Get("me")
  @UseGuards(AccessTokenGuard)
  getMe(@CurrentUser() user: AccessTokenPayload) {
    return this.authService.getMe(user.sub);
  }

  @Patch("me")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(AccessTokenGuard)
  updateMe(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UpdateMeDto,
  ) {
    return this.authService.updateMe(user.sub, body);
  }

  /** Elimina el usuario y datos asociados (cascada en base de datos). Irreversible. */
  @Delete("me")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard)
  deleteMe(@CurrentUser() user: AccessTokenPayload) {
    return this.authService.deleteMyAccount(user.sub);
  }

  private setWebRefreshCookie(
    response: Response,
    refreshToken: string,
    expiresAt: string,
  ) {
    const expires = new Date(expiresAt);
    response.cookie(WEB_REFRESH_COOKIE, refreshToken, {
      domain: this.config.nodeEnv === "production" ? ".feca.cc" : undefined,
      expires,
      httpOnly: true,
      path: "/v1/auth",
      sameSite: "lax",
      secure: this.config.nodeEnv === "production",
    });
  }

  private clearWebRefreshCookie(response: Response) {
    response.clearCookie(WEB_REFRESH_COOKIE, {
      domain: this.config.nodeEnv === "production" ? ".feca.cc" : undefined,
      httpOnly: true,
      path: "/v1/auth",
      sameSite: "lax",
      secure: this.config.nodeEnv === "production",
    });
  }
}

function withoutRefreshToken<T extends { refreshToken: string }>(session: T) {
  const { refreshToken: _refreshToken, ...safeSession } = session;
  return safeSession;
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return undefined;
  }

  for (const chunk of cookieHeader.split(";")) {
    const separator = chunk.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const key = chunk.slice(0, separator).trim();
    if (key !== name) {
      continue;
    }
    try {
      return decodeURIComponent(chunk.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }

  return undefined;
}
