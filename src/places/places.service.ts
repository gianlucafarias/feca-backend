import { Injectable } from "@nestjs/common";

import type { AccessTokenPayload } from "../auth/auth.types";
import type { GooglePlaceDetailView } from "../infrastructure/google-places/google-places.client";
import type { NearbyPlaceView } from "../infrastructure/google-places/google-places.client";
import type { NearbyScoreBreakdown } from "../lib/nearby-ranking";
import type { CityRecord } from "../types";
import { AutocompleteCitiesQueryDto } from "./dto/autocomplete-cities.query.dto";
import { ExploreContextQueryDto } from "./dto/explore-context.query.dto";
import { AutocompletePlacesQueryDto } from "./dto/autocomplete-places.query.dto";
import { CreateManualPlaceDto } from "./dto/create-manual-place.dto";
import { GetNearbyPlacesQueryDto } from "./dto/get-nearby-places.query.dto";
import { ResolvePlaceDto } from "./dto/resolve-place.dto";
import { PlacesAutocompleteService } from "./places-autocomplete.service";
import { PlacesCitiesService } from "./places-cities.service";
import { PlacesNearbyService } from "./places-nearby.service";
import { PlacesProfileService } from "./places-profile.service";

@Injectable()
export class PlacesService {
  constructor(
    private readonly autocompleteService: PlacesAutocompleteService,
    private readonly citiesService: PlacesCitiesService,
    private readonly profileService: PlacesProfileService,
    private readonly nearbyService: PlacesNearbyService,
  ) {}

  autocomplete(input: AutocompletePlacesQueryDto, origin?: string) {
    return this.autocompleteService.autocomplete(input, origin);
  }

  autocompleteCities(input: AutocompleteCitiesQueryDto, origin?: string) {
    return this.citiesService.autocompleteCities(input, origin);
  }

  reverseGeocodeCity(lat: number, lng: number, origin?: string) {
    return this.citiesService.reverseGeocodeCity(lat, lng, origin);
  }

  resolveCityByGooglePlaceId(cityGooglePlaceId: string, origin?: string) {
    return this.citiesService.resolveCityByGooglePlaceId(cityGooglePlaceId, origin);
  }

  getOrCreateCityRecordByGooglePlaceId(
    cityGooglePlaceId: string,
    origin?: string,
  ): Promise<CityRecord> {
    return this.citiesService.getOrCreateCityRecordByGooglePlaceId(
      cityGooglePlaceId,
      origin,
    );
  }

  getOrCreateCityRecordFromCoordinates(
    lat: number,
    lng: number,
    origin?: string,
  ): Promise<CityRecord> {
    return this.citiesService.getOrCreateCityRecordFromCoordinates(lat, lng, origin);
  }

  resolve(input: ResolvePlaceDto, origin?: string) {
    return this.profileService.resolve(input, origin);
  }

  createManualPlace(input: CreateManualPlaceDto, origin?: string) {
    return this.profileService.createManualPlace(input, origin);
  }

  getPlaceProfile(
    viewer: AccessTokenPayload,
    googlePlaceId: string,
    origin?: string,
  ): Promise<
    GooglePlaceDetailView & {
      social?: Record<string, unknown>;
      hiddenFromApp?: boolean;
    }
  > {
    return this.profileService.getPlaceProfile(viewer, googlePlaceId, origin);
  }

  nearby(
    userId: string,
    input: GetNearbyPlacesQueryDto,
    origin?: string,
  ): Promise<{
    places: NearbyPlaceView[];
    debugScores?: NearbyScoreBreakdown[];
  }> {
    return this.nearbyService.nearby(userId, input, origin);
  }

  exploreContext(userId: string, input: ExploreContextQueryDto, origin?: string) {
    return this.nearbyService.exploreContext(userId, input, origin);
  }
}
