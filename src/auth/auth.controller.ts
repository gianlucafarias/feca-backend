import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AccessTokenGuard } from "../common/guards/access-token.guard";
import type { AccessTokenPayload } from "./auth.types";
import { AuthService } from "./auth.service";
import { GoogleMobileAuthDto } from "./dto/google-mobile-auth.dto";
import { RefreshSessionDto } from "./dto/refresh-session.dto";
import { UpdateMeDto } from "./dto/update-me.dto";

@Controller("v1")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("auth/google/mobile")
  async authenticateWithGoogle(@Body() body: GoogleMobileAuthDto) {
    return this.authService.authenticateWithGoogle(body.idToken);
  }

  @Post("auth/refresh")
  async refresh(@Body() body: RefreshSessionDto) {
    const session = await this.authService.refreshSession(body.refreshToken);
    return { session };
  }

  @Post("auth/logout")
  async logout(@Body() body: RefreshSessionDto) {
    await this.authService.logout(body.refreshToken);
    return {};
  }

  @Get("me")
  @UseGuards(AccessTokenGuard)
  getMe(@CurrentUser() user: AccessTokenPayload) {
    return this.authService.getMe(user.sub);
  }

  @Patch("me")
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
}
