import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AccessTokenGuard } from "../common/guards/access-token.guard";
import { PaginationQueryDto } from "../common/dto/pagination-query.dto";
import type { AccessTokenPayload } from "../auth/auth.types";
import { SearchUsersQueryDto } from "./dto/search-users.query.dto";
import { SocialService } from "./social.service";

@Controller("v1/users")
@UseGuards(AccessTokenGuard)
export class UsersController {
  constructor(private readonly socialService: SocialService) {}

  @Get("search")
  searchUsers(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: SearchUsersQueryDto,
  ) {
    return this.socialService.searchUsers(user.sub, query);
  }

  @Post(":id/follow")
  followUser(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") targetUserId: string,
  ) {
    return this.socialService.followUser(user.sub, targetUserId);
  }

  @Delete(":id/follow")
  unfollowUser(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") targetUserId: string,
  ) {
    return this.socialService.unfollowUser(user.sub, targetUserId);
  }

  @Get(":id")
  getUser(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") userId: string,
  ) {
    return this.socialService.getUserProfile(user.sub, userId);
  }

  @Get(":id/visits")
  getUserVisits(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") userId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.socialService.getUserVisits(user.sub, userId, query);
  }

  @Get(":id/diaries")
  getUserDiaries(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") userId: string,
  ) {
    return this.socialService.listUserDiaries(user.sub, userId);
  }

  @Get(":id/taste")
  getUserTaste(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") userId: string,
  ) {
    return this.socialService.getUserTaste(user.sub, userId);
  }
}
