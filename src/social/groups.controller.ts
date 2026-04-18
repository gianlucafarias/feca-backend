import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AccessTokenGuard } from "../common/guards/access-token.guard";
import type { AccessTokenPayload } from "../auth/auth.types";
import { AddGroupMembersDto } from "./dto/add-group-members.dto";
import { AddGroupEventDto } from "./dto/add-group-event.dto";
import { CreateGroupDto } from "./dto/create-group.dto";
import { JoinGroupDto } from "./dto/join-group.dto";
import { UpdateGroupEventRsvpDto } from "./dto/update-group-event-rsvp.dto";
import { SocialService } from "./social.service";

@Controller("v1/groups")
@UseGuards(AccessTokenGuard)
export class GroupsController {
  constructor(private readonly socialService: SocialService) {}

  @Post()
  createGroup(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateGroupDto,
  ) {
    return this.socialService.createGroup(user.sub, body);
  }

  @Post("join")
  joinGroup(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: JoinGroupDto,
  ) {
    return this.socialService.joinGroupByCode(user.sub, body);
  }

  @Get(":id")
  getGroup(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") groupId: string,
  ) {
    return this.socialService.getGroup(user.sub, groupId);
  }

  @Post(":id/members")
  addGroupMembers(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") groupId: string,
    @Body() body: AddGroupMembersDto,
  ) {
    return this.socialService.addGroupMembers(user.sub, groupId, body);
  }

  @Post(":id/events")
  addGroupEvent(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") groupId: string,
    @Body() body: AddGroupEventDto,
  ) {
    return this.socialService.addGroupEvent(user.sub, groupId, body);
  }

  @Post(":id/events/:eventId/rsvp")
  setGroupEventRsvp(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") groupId: string,
    @Param("eventId") eventId: string,
    @Body() body: UpdateGroupEventRsvpDto,
  ) {
    return this.socialService.setGroupEventRsvp(user.sub, groupId, eventId, body);
  }
}
