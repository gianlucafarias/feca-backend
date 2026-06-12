import { Controller, Get, Headers, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { AccessTokenGuard } from "../common/guards/access-token.guard";
import { AutocompleteCitiesQueryDto } from "./dto/autocomplete-cities.query.dto";
import { ReverseCityQueryDto } from "./dto/reverse-city.query.dto";
import { ResolveCityQueryDto } from "./dto/resolve-city.query.dto";
import { PlacesService } from "./places.service";

@Controller("v1/cities")
@UseGuards(AccessTokenGuard)
export class CitiesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get("autocomplete")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async autocomplete(
    @Query() query: AutocompleteCitiesQueryDto,
    @Headers("x-feca-places-origin") origin?: string,
  ) {
    const cities = await this.placesService.autocompleteCities(query, origin);
    return { cities };
  }

  @Get("reverse")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async reverse(
    @Query() query: ReverseCityQueryDto,
    @Headers("x-feca-places-origin") origin?: string,
  ) {
    const city = await this.placesService.reverseGeocodeCity(
      query.lat,
      query.lng,
      origin,
    );
    return { city };
  }

  @Get("resolve")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async resolve(
    @Query() query: ResolveCityQueryDto,
    @Headers("x-feca-places-origin") origin?: string,
  ) {
    const city = await this.placesService.resolveCityByGooglePlaceId(
      query.cityGooglePlaceId,
      origin,
    );
    return { city };
  }
}
