import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

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
  autocomplete(
    @Query() query: AutocompletePlacesQueryDto,
    @Headers("x-feca-places-origin") origin?: string,
  ) {
    return this.placesService.autocomplete(query, origin);
  }

  @Post("resolve")
  async resolve(
    @Body() body: ResolvePlaceDto,
    @Headers("x-feca-places-origin") origin?: string,
  ) {
    const place = await this.placesService.resolve(body, origin);
    return { place };
  }

  @Post("manual")
  async manual(
    @Body() body: CreateManualPlaceDto,
    @Headers("x-feca-places-origin") origin?: string,
  ) {
    const place = await this.placesService.createManualPlace(body, origin);
    return { place };
  }

  @Get("nearby")
  async nearby(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: GetNearbyPlacesQueryDto,
    @Headers("x-feca-places-origin") origin?: string,
  ) {
    const places = await this.placesService.nearby(user.sub, query, origin);
    return { places };
  }

  @Get(":googlePlaceId")
  async getById(
    @CurrentUser() user: AccessTokenPayload,
    @Param("googlePlaceId") googlePlaceId: string,
    @Headers("x-feca-places-origin") origin?: string,
  ) {
    const place = await this.placesService.getPlaceProfile(
      user.sub,
      googlePlaceId,
      origin,
    );
    return { place };
  }
}
