import { Controller, Get, Headers, Query, UseGuards } from "@nestjs/common";

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
  async autocomplete(
    @Query() query: AutocompleteCitiesQueryDto,
    @Headers("x-feca-places-origin") origin?: string,
  ) {
    const cities = await this.placesService.autocompleteCities(query, origin);
    return { cities };
  }

  @Get("reverse")
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
