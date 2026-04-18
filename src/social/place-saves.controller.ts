import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AccessTokenGuard } from "../common/guards/access-token.guard";
import type { AccessTokenPayload } from "../auth/auth.types";
import { SocialService } from "./social.service";

@Controller("v1/places")
@UseGuards(AccessTokenGuard)
export class PlaceSavesController {
  constructor(private readonly socialService: SocialService) {}

  @Get(":googlePlaceId/saved")
  getPlaceSaved(
    @CurrentUser() user: AccessTokenPayload,
    @Param("googlePlaceId") googlePlaceId: string,
  ) {
    return this.socialService.getPlaceSaved(user.sub, googlePlaceId);
  }

  @Post(":googlePlaceId/save")
  savePlace(
    @CurrentUser() user: AccessTokenPayload,
    @Param("googlePlaceId") googlePlaceId: string,
  ) {
    return this.socialService.savePlace(user.sub, googlePlaceId);
  }

  @Delete(":googlePlaceId/save")
  unsavePlace(
    @CurrentUser() user: AccessTokenPayload,
    @Param("googlePlaceId") googlePlaceId: string,
  ) {
    return this.socialService.unsavePlace(user.sub, googlePlaceId);
  }
}
