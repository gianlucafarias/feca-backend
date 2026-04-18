import { Body, Controller, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AccessTokenGuard } from "../common/guards/access-token.guard";
import type { AccessTokenPayload } from "../auth/auth.types";
import { CreateVisitDto } from "./dto/create-visit.dto";
import { VisitsService } from "./visits.service";

@Controller("v1/visits")
@UseGuards(AccessTokenGuard)
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateVisitDto,
  ) {
    return this.visitsService.create(user.sub, body);
  }
}
