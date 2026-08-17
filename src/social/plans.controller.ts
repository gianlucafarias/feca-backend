import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AccessTokenGuard } from "../common/guards/access-token.guard";
import type { AccessTokenPayload } from "../auth/auth.types";
import { CreatePlanDto } from "./dto/create-plan.dto";
import { CreatePlanMessageDto } from "./dto/create-plan-message.dto";
import { DiscoverPlansQueryDto } from "./dto/discover-plans.query.dto";
import { ListPlanMessagesQueryDto } from "./dto/list-plan-messages.query.dto";
import { UpdatePlanDto } from "./dto/update-plan.dto";
import { UpdatePlanRsvpDto } from "./dto/update-plan-rsvp.dto";
import { PlansService } from "./plans.service";

@Controller("v1/plans")
@UseGuards(AccessTokenGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get("discover")
  discover(@CurrentUser() user: AccessTokenPayload, @Query() query: DiscoverPlansQueryDto) {
    return this.plansService.discover(user.sub, query);
  }

  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() body: CreatePlanDto) {
    return this.plansService.create(user.sub, body);
  }

  @Get(":id")
  get(@CurrentUser() user: AccessTokenPayload, @Param("id") groupId: string) {
    return this.plansService.get(user.sub, groupId);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") groupId: string,
    @Body() body: UpdatePlanDto,
  ) {
    return this.plansService.update(user.sub, groupId, body);
  }

  @Post(":id/join")
  join(@CurrentUser() user: AccessTokenPayload, @Param("id") groupId: string) {
    return this.plansService.join(user.sub, groupId);
  }

  @Post(":id/leave")
  leave(@CurrentUser() user: AccessTokenPayload, @Param("id") groupId: string) {
    return this.plansService.leave(user.sub, groupId);
  }

  @Get(":id/join-requests")
  listJoinRequests(@CurrentUser() user: AccessTokenPayload, @Param("id") groupId: string) {
    return this.plansService.listJoinRequests(user.sub, groupId);
  }

  @Post(":id/join-requests/:membershipId/approve")
  approveJoinRequest(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") groupId: string,
    @Param("membershipId") membershipId: string,
  ) {
    return this.plansService.decideJoinRequest(user.sub, groupId, membershipId, true);
  }

  @Post(":id/join-requests/:membershipId/reject")
  rejectJoinRequest(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") groupId: string,
    @Param("membershipId") membershipId: string,
  ) {
    return this.plansService.decideJoinRequest(user.sub, groupId, membershipId, false);
  }

  @Post(":id/join-request/cancel")
  cancelJoinRequest(@CurrentUser() user: AccessTokenPayload, @Param("id") groupId: string) {
    return this.plansService.cancelJoinRequest(user.sub, groupId);
  }

  @Post(":id/events/:eventId/rsvp")
  setRsvp(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") groupId: string,
    @Param("eventId") eventId: string,
    @Body() body: UpdatePlanRsvpDto,
  ) {
    return this.plansService.setRsvp(user.sub, groupId, eventId, body);
  }

  @Get(":id/messages")
  listMessages(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") groupId: string,
    @Query() query: ListPlanMessagesQueryDto,
  ) {
    return this.plansService.listMessages(user.sub, groupId, query);
  }

  @Post(":id/messages")
  sendMessage(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") groupId: string,
    @Body() body: CreatePlanMessageDto,
  ) {
    return this.plansService.sendMessage(user.sub, groupId, body);
  }

  @Delete(":id/messages/:messageId")
  deleteMessage(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") groupId: string,
    @Param("messageId") messageId: string,
  ) {
    return this.plansService.deleteMessage(user.sub, groupId, messageId);
  }
}
