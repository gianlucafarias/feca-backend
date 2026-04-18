import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AccessTokenGuard } from "../common/guards/access-token.guard";
import type { AccessTokenPayload } from "../auth/auth.types";
import { AddDiaryPlaceDto } from "./dto/add-diary-place.dto";
import { CreateDiaryDto } from "./dto/create-diary.dto";
import { SearchDiariesQueryDto } from "./dto/search-diaries.query.dto";
import { SocialService } from "./social.service";

@Controller("v1/diaries")
@UseGuards(AccessTokenGuard)
export class DiariesController {
  constructor(private readonly socialService: SocialService) {}

  @Post()
  createDiary(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateDiaryDto,
  ) {
    return this.socialService.createDiary(user.sub, body);
  }

  @Get("search")
  searchDiaries(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: SearchDiariesQueryDto,
  ) {
    return this.socialService.searchPublicDiaries(user.sub, query);
  }

  @Get(":id")
  getDiary(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") diaryId: string,
  ) {
    return this.socialService.getDiary(user.sub, diaryId);
  }

  @Post(":id/places")
  addPlaceToDiary(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") diaryId: string,
    @Body() body: AddDiaryPlaceDto,
  ) {
    return this.socialService.addPlaceToDiary(user.sub, diaryId, body);
  }
}
