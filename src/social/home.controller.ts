import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { AccessTokenGuard } from "../common/guards/access-token.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AccessTokenPayload } from "../auth/auth.types";
import { ListEditorGuidesQueryDto } from "./dto/list-editor-guides.query.dto";
import { SocialService } from "./social.service";

@Controller("v1/home")
@UseGuards(AccessTokenGuard)
export class HomeController {
  constructor(private readonly socialService: SocialService) {}

  @Get("editor-guides")
  listEditorGuides(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListEditorGuidesQueryDto,
  ) {
    return this.socialService.listHomeEditorGuides(user.sub, query.limit ?? 20);
  }
}
