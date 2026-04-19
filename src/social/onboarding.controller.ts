import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AccessTokenGuard } from "../common/guards/access-token.guard";
import type { AccessTokenPayload } from "../auth/auth.types";
import { SuggestedOnboardingUsersQueryDto } from "./dto/suggested-onboarding-users.query.dto";
import { SocialService } from "./social.service";

@Controller("v1/onboarding")
@UseGuards(AccessTokenGuard)
export class OnboardingController {
  constructor(private readonly socialService: SocialService) {}

  @Get("suggested-users")
  listSuggestedUsers(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: SuggestedOnboardingUsersQueryDto,
  ) {
    return this.socialService.listSuggestedOnboardingUsers(user.sub, query);
  }
}
