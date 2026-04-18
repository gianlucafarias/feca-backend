import { Controller, Get, Query, UseGuards } from "@nestjs/common";

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
  async autocomplete(@Query() query: AutocompleteCitiesQueryDto) {
    const cities = await this.placesService.autocompleteCities(query);
    return { cities };
  }

  @Get("reverse")
  async reverse(@Query() query: ReverseCityQueryDto) {
    const city = await this.placesService.reverseGeocodeCity(query.lat, query.lng);
    return { city };
  }

  @Get("resolve")
  async resolve(@Query() query: ResolveCityQueryDto) {
    const city = await this.placesService.resolveCityByGooglePlaceId(
      query.cityGooglePlaceId,
    );
    return { city };
  }
}
