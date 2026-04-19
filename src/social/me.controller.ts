import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PaginationQueryDto } from "../common/dto/pagination-query.dto";
import { AccessTokenGuard } from "../common/guards/access-token.guard";
import { AuthService } from "../auth/auth.service";
import type { AccessTokenPayload } from "../auth/auth.types";
import { PatchMeEditorDto } from "../auth/dto/patch-me-editor.dto";
import { UpdateSocialSettingsDto } from "./dto/update-social-settings.dto";
import { ListNotificationsQueryDto } from "./dto/list-notifications.query.dto";
import { UpdateTasteDto } from "./dto/update-taste.dto";
import { NotificationsService } from "./notifications.service";
import { SocialService } from "./social.service";

@Controller("v1/me")
@UseGuards(AccessTokenGuard)
export class MeController {
  constructor(
    private readonly socialService: SocialService,
    private readonly notificationsService: NotificationsService,
    private readonly authService: AuthService,
  ) {}

  @Get("visits")
  getMyVisits(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: PaginationQueryDto,
  ) {
    return this.socialService.getMyVisits(user.sub, query);
  }

  @Get("saved")
  getMySavedPlaces(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: PaginationQueryDto,
  ) {
    return this.socialService.listSavedPlaces(user.sub, query);
  }

  @Get("notifications")
  getMyNotifications(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.listMyNotifications(user.sub, query);
  }

  @Post("notifications/read-all")
  markAllMyNotificationsRead(@CurrentUser() user: AccessTokenPayload) {
    return this.notificationsService.markAllMyNotificationsRead(user.sub);
  }

  @Post("notifications/:id/read")
  markMyNotificationRead(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") notificationId: string,
  ) {
    return this.notificationsService.markMyNotificationRead(
      user.sub,
      notificationId,
    );
  }

  @Get("groups")
  getMyGroups(@CurrentUser() user: AccessTokenPayload) {
    return this.socialService.listMyGroups(user.sub);
  }

  @Get("friends/public-group-plans")
  listPublicFriendGroupPlans(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: PaginationQueryDto,
  ) {
    return this.socialService.listPublicFriendGroupPlans(user.sub, query);
  }

  @Get("diaries")
  getMyDiaries(@CurrentUser() user: AccessTokenPayload) {
    return this.socialService.listMyDiaries(user.sub);
  }

  @Get("following")
  getMyFollowing(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: PaginationQueryDto,
  ) {
    return this.socialService.listFollowing(user.sub, query);
  }

  @Get("followers")
  getMyFollowers(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: PaginationQueryDto,
  ) {
    return this.socialService.listFollowers(user.sub, query);
  }

  @Get("settings/social")
  getMySocialSettings(@CurrentUser() user: AccessTokenPayload) {
    return this.socialService.getSocialSettings(user.sub);
  }

  @Get("taste")
  getMyTaste(@CurrentUser() user: AccessTokenPayload) {
    return this.socialService.getMyTaste(user.sub);
  }

  @Patch("taste")
  updateMyTaste(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UpdateTasteDto,
  ) {
    return this.socialService.updateMyTaste(user.sub, body);
  }

  @Patch("settings/social")
  updateMySocialSettings(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UpdateSocialSettingsDto,
  ) {
    return this.socialService.updateSocialSettings(user.sub, body);
  }

  /**
   * Preview de producto: cualquier usuario autenticado puede activar/desactivar
   * su flag editor (sin panel de admin). Sustituir por flujo restringido cuando exista.
   */
  @Patch("editor")
  patchMyEditor(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: PatchMeEditorDto,
  ) {
    return this.authService.setMyEditorFlag(user.sub, body.isEditor);
  }
}
