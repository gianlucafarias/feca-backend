import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import type { AccessTokenPayload } from "../auth/auth.types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AccessTokenGuard } from "../common/guards/access-token.guard";
import { ExploreContextQueryDto } from "./dto/explore-context.query.dto";
import { PlacesService } from "./places.service";

@Controller("v1/explore")
@UseGuards(AccessTokenGuard)
export class ExploreController {
  constructor(private readonly placesService: PlacesService) {}

  @Get("context")
  getExploreContext(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ExploreContextQueryDto,
  ) {
    return this.placesService.exploreContext(user.sub, query);
  }
}
