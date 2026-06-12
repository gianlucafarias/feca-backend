import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AccessTokenGuard } from "../common/guards/access-token.guard";
import type { AccessTokenPayload } from "../auth/auth.types";
import { ListVisitPlaceTagsQueryDto } from "./dto/list-visit-place-tags.query.dto";
import { UpsertVisitPlaceTagDto } from "./dto/upsert-visit-place-tag.dto";
import { VisitsService } from "./visits.service";

@Controller("v1/me/visit-place-tags")
@UseGuards(AccessTokenGuard)
export class VisitPlaceTagsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Get()
  listMyVisitPlaceTags(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListVisitPlaceTagsQueryDto,
  ) {
    return this.visitsService.listMyVisitPlaceTags(user.sub, query);
  }

  @Post()
  upsertMyVisitPlaceTag(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UpsertVisitPlaceTagDto,
  ) {
    return this.visitsService.upsertMyVisitPlaceTag(user.sub, body);
  }
}
