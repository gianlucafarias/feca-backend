import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AccessTokenGuard } from "../common/guards/access-token.guard";
import type { AccessTokenPayload } from "../auth/auth.types";
import { FeedQueryDto } from "./dto/feed-query.dto";
import { SocialService } from "./social.service";

@Controller("v1")
@UseGuards(AccessTokenGuard)
export class FeedController {
  constructor(private readonly socialService: SocialService) {}

  @Get("feed")
  getFeed(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: FeedQueryDto,
  ) {
    return this.socialService.getFeed(user.sub, query);
  }
}
