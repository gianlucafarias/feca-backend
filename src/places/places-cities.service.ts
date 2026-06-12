import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import {
  type GoogleCitySummary,
  GooglePlacesClient,
} from "../infrastructure/google-places/google-places.client";
import { CitiesRepository } from "../infrastructure/repositories/cities.repository";
import type { CityRecord } from "../types";
import { AutocompleteCitiesQueryDto } from "./dto/autocomplete-cities.query.dto";
import { AUTOCOMPLETE_CITIES_TTL_MS, CITY_LOOKUP_TTL_MS } from "./places.constants";
import { PlacesGoogleCacheService } from "./places-google-cache.service";

@Injectable()
export class PlacesCitiesService {
  private readonly logger = new Logger(PlacesCitiesService.name);

  constructor(
    private readonly citiesRepository: CitiesRepository,
    private readonly google: GooglePlacesClient,
    private readonly googleCache: PlacesGoogleCacheService,
  ) {}

  async autocompleteCities(
    input: AutocompleteCitiesQueryDto,
    origin?: string,
  ) {
    if (input.q.trim().length < 2) {
      return [];
    }

    if (!this.googleCache.shouldUseGooglePlaces()) {
      const cities = await this.citiesRepository.searchCities(
        input.q,
        input.limit,
      );
      return cities.map((city) => ({
        city: city.name,
        cityGooglePlaceId: city.googlePlaceId,
        displayName: city.displayName,
        lat: city.lat,
        lng: city.lng,
      }));
    }

    const cacheKey = this.buildCitiesAutocompleteCacheKey(input);

    try {
      return await this.googleCache.getCachedGoogleValue({
        cacheKey,
        method: "autocompleteCities",
        origin,
        ttl: AUTOCOMPLETE_CITIES_TTL_MS,
        load: () =>
          this.google.autocompleteCities(
            {
              query: input.q,
              lat: input.lat,
              lng: input.lng,
              limit: input.limit,
              sessionToken: input.sessionToken,
            },
            {
              cache: "miss",
              key: cacheKey,
              origin,
              singleFlight: "leader",
            },
          ),
      });
    } catch (error) {
      this.logger.error("City autocomplete failed", error);
      return [];
    }
  }

  async reverseGeocodeCity(lat: number, lng: number, origin?: string) {
    if (!this.googleCache.shouldUseGooglePlaces()) {
      throw new NotFoundException("City not found in local-only places mode");
    }

    const city = await this.googleCache.getCachedReverseGeocodeCity(lat, lng, origin);

    if (!city) {
      throw new NotFoundException("City not found for the provided coordinates");
    }

    return city;
  }

  async resolveCityByGooglePlaceId(cityGooglePlaceId: string, origin?: string) {
    return this.ensureStoredCityByGooglePlaceId(cityGooglePlaceId, origin).then(
      (city) => ({
        city: city.name,
        cityGooglePlaceId: city.googlePlaceId,
        displayName: city.displayName,
        lat: city.lat,
        lng: city.lng,
      }),
    );
  }

  /** Ciudad canónica persistida; usado p. ej. por el feed `mode=city` con ciudad seleccionada en el cliente. */
  async getOrCreateCityRecordByGooglePlaceId(
    cityGooglePlaceId: string,
    origin?: string,
  ): Promise<CityRecord> {
    return this.ensureStoredCityByGooglePlaceId(cityGooglePlaceId, origin);
  }

  /** Ciudad canónica a partir de coordenadas (misma lógica que lugares / perfil). */
  async getOrCreateCityRecordFromCoordinates(
    lat: number,
    lng: number,
    origin?: string,
  ): Promise<CityRecord> {
    return this.ensureStoredCityForCoordinates(lat, lng, origin);
  }

  buildCitiesAutocompleteCacheKey(input: AutocompleteCitiesQueryDto) {
    const lat = typeof input.lat === "number" ? input.lat.toFixed(3) : "na";
    const lng = typeof input.lng === "number" ? input.lng.toFixed(3) : "na";
    return `places:cities:autocomplete:${input.q.trim().toLowerCase()}:${lat}:${lng}:${input.limit}`;
  }

  async ensureStoredCityByGooglePlaceId(
    cityGooglePlaceId: string,
    origin?: string,
  ): Promise<CityRecord> {
    try {
      return await this.googleCache.getCachedGoogleValue({
        cacheKey: this.googleCache.buildStoredCityCacheKey(cityGooglePlaceId),
        method: "getCityByPlaceId",
        origin,
        ttl: CITY_LOOKUP_TTL_MS,
        load: async () => {
          const existing =
            await this.citiesRepository.findCityByGooglePlaceId(cityGooglePlaceId);

          if (existing) {
            return existing;
          }

          if (!this.googleCache.shouldUseGooglePlaces()) {
            throw new Error("City not found in local-only places mode");
          }

          const city = await this.google.getCityByPlaceId(cityGooglePlaceId, {
            cache: "miss",
            key: this.googleCache.buildStoredCityCacheKey(cityGooglePlaceId),
            origin,
            singleFlight: "leader",
          });

          return this.upsertCitySummary(city);
        },
      });
    } catch {
      throw new BadRequestException("Invalid cityGooglePlaceId");
    }
  }

  async ensureStoredCityForCoordinates(
    lat?: number,
    lng?: number,
    origin?: string,
  ): Promise<CityRecord> {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BadGatewayException("Resolved place is missing coordinates");
    }

    const resolvedLat = lat as number;
    const resolvedLng = lng as number;

    if (!this.googleCache.shouldUseGooglePlaces()) {
      throw new BadGatewayException("Local-only places mode cannot resolve city from coordinates");
    }

    let city = await this.googleCache.getCachedReverseGeocodeCity(
      resolvedLat,
      resolvedLng,
      origin,
    );

    if (!city) {
      const cacheKey = this.googleCache.buildReverseCityCacheKey(resolvedLat, resolvedLng);
      city = await this.google.reverseGeocodeCity(resolvedLat, resolvedLng, {
        cache: "skip",
        key: cacheKey,
        origin,
      });

      if (city) {
        await this.googleCache.setCachedValue(cacheKey, city, CITY_LOOKUP_TTL_MS);
      }
    }

    if (!city) {
      throw new BadGatewayException("Could not resolve city for place");
    }

    return this.upsertCitySummary(city);
  }

  upsertCitySummary(city: GoogleCitySummary): Promise<CityRecord> {
    return this.citiesRepository.upsertCity({
      displayName: city.displayName,
      googlePlaceId: city.cityGooglePlaceId,
      lat: city.lat,
      lng: city.lng,
      name: city.city,
    });
  }
}
