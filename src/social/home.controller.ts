import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { AccessTokenGuard } from "../common/guards/access-token.guard";
import { ListEditorGuidesQueryDto } from "./dto/list-editor-guides.query.dto";
import { SocialService } from "./social.service";

@Controller("v1/home")
@UseGuards(AccessTokenGuard)
export class HomeController {
  constructor(private readonly socialService: SocialService) {}

  @Get("editor-guides")
  listEditorGuides(@Query() query: ListEditorGuidesQueryDto) {
    return this.socialService.listHomeEditorGuides(query.limit ?? 20);
  }
}
