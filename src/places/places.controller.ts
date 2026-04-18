import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";

import type { AccessTokenPayload } from "../auth/auth.types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AccessTokenGuard } from "../common/guards/access-token.guard";
import { AutocompletePlacesQueryDto } from "./dto/autocomplete-places.query.dto";
import { CreateManualPlaceDto } from "./dto/create-manual-place.dto";
import { GetNearbyPlacesQueryDto } from "./dto/get-nearby-places.query.dto";
import { ResolvePlaceDto } from "./dto/resolve-place.dto";
import { PlacesService } from "./places.service";

@Controller("v1/places")
@UseGuards(AccessTokenGuard)
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get("autocomplete")
  autocomplete(@Query() query: AutocompletePlacesQueryDto) {
    return this.placesService.autocomplete(query);
  }

  @Post("resolve")
  async resolve(@Body() body: ResolvePlaceDto) {
    const place = await this.placesService.resolve(body);
    return { place };
  }

  @Post("manual")
  async manual(@Body() body: CreateManualPlaceDto) {
    const place = await this.placesService.createManualPlace(body);
    return { place };
  }

  @Get("nearby")
  async nearby(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: GetNearbyPlacesQueryDto,
  ) {
    const places = await this.placesService.nearby(user.sub, query);
    return { places };
  }

  @Get(":googlePlaceId")
  async getById(
    @CurrentUser() user: AccessTokenPayload,
    @Param("googlePlaceId") googlePlaceId: string,
  ) {
    const place = await this.placesService.getPlaceProfile(user.sub, googlePlaceId);
    return { place };
  }
}
