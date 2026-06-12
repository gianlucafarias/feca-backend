import { Inject, Injectable } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import type { Cache } from "cache-manager";

import { AppConfigService } from "../config/app-config.service";
import {
  type GoogleCitySummary,
  GooglePlacesClient,
  type GooglePlacesMethod,
  type GooglePlaceDetailView,
} from "../infrastructure/google-places/google-places.client";
import { DistributedSingleFlightService } from "../infrastructure/cache/distributed-single-flight.service";
import {
  CITY_LOOKUP_TTL_MS,
  PLACE_DETAIL_TTL_MS,
} from "./places.constants";

@Injectable()
export class PlacesGoogleCacheService {
  private autocompleteCacheVersion = 1;

  constructor(
    private readonly google: GooglePlacesClient,
    private readonly config: AppConfigService,
    private readonly singleFlight: DistributedSingleFlightService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  getAutocompleteCacheVersion() {
    return this.autocompleteCacheVersion;
  }

  bumpAutocompleteCacheNamespace() {
    this.autocompleteCacheVersion += 1;
  }

  shouldUseGooglePlaces() {
    return this.google.isEnabled && !this.config.googlePlacesLocalOnly;
  }

  shouldIncludePlaceDetailPhotos() {
    return this.config.googlePlacePhotosDetailEnabled;
  }

  shouldIncludeNearbyPhotos() {
    return (
      this.config.googlePlacePhotosHomeEnabled &&
      this.config.googlePlacePhotosHomeLimit > 0
    );
  }

  buildStoredCityCacheKey(cityGooglePlaceId: string) {
    return `places:city:place:${cityGooglePlaceId}`;
  }

  buildReverseCityCacheKey(lat: number, lng: number) {
    return `places:city:reverse:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  }

  buildPlaceDetailCacheKey(placeId: string) {
    const photoTier = this.shouldIncludePlaceDetailPhotos() ? "photos" : "nophotos";
    return `places:detail:v3:${placeId}:${photoTier}:hours`;
  }

  getCachedReverseGeocodeCity(
    lat: number,
    lng: number,
    origin?: string,
  ): Promise<GoogleCitySummary | null> {
    const cacheKey = this.buildReverseCityCacheKey(lat, lng);
    return this.getCachedGoogleValue<GoogleCitySummary | null>({
      allowNull: true,
      cacheKey,
      method: "reverseGeocodeCity",
      origin,
      ttl: CITY_LOOKUP_TTL_MS,
      load: () =>
        this.google.reverseGeocodeCity(lat, lng, {
          cache: "miss",
          key: cacheKey,
          origin,
          singleFlight: "leader",
        }),
    });
  }

  getCachedPlaceDetailView(
    placeId: string,
    origin?: string,
  ): Promise<GooglePlaceDetailView> {
    const cacheKey = this.buildPlaceDetailCacheKey(placeId);
    return this.getCachedGoogleValue<GooglePlaceDetailView>({
      cacheKey,
      method: "getPlaceDetailView",
      origin,
      ttl: PLACE_DETAIL_TTL_MS,
      load: () =>
        this.google.getPlaceDetailView(placeId, {
          includePhotos: this.shouldIncludePlaceDetailPhotos(),
          trace: {
            cache: "miss",
            key: cacheKey,
            origin,
            singleFlight: "leader",
          },
        }),
    });
  }

  async getCachedGoogleValue<T>(options: {
    allowNull?: boolean;
    cacheKey: string;
    method: GooglePlacesMethod;
    origin?: string;
    ttl: number;
    load: () => Promise<T>;
  }): Promise<T> {
    const cached = await this.cacheManager.get<T>(options.cacheKey);
    if (
      typeof cached !== "undefined" &&
      (options.allowNull === true || cached !== null)
    ) {
      this.traceGoogleCache(options.method, {
        cache: "hit",
        key: options.cacheKey,
        origin: options.origin,
      });
      return cached as T;
    }

    return this.runSingleFlight(
      options.cacheKey,
      async () => {
        this.traceGoogleCache(options.method, {
          cache: "miss",
          key: options.cacheKey,
          origin: options.origin,
          singleFlight: "leader",
        });
        const value = await options.load();
        await this.cacheManager.set(options.cacheKey, value, options.ttl);
        return value;
      },
      () => {
        this.traceGoogleCache(options.method, {
          cache: "miss_joined",
          key: options.cacheKey,
          origin: options.origin,
          singleFlight: "joined",
        });
      },
    );
  }

  traceGoogleCache(
    method: GooglePlacesMethod,
    trace: Parameters<GooglePlacesClient["traceCacheEvent"]>[0]["trace"],
  ) {
    this.google.traceCacheEvent({ method, trace });
  }

  async runSingleFlight<T>(
    key: string,
    load: () => Promise<T>,
    onJoined?: () => void,
  ) {
    return this.singleFlight.run(key, load, {
      onJoined,
      readCached: async () => {
        const cached = await this.cacheManager.get<T>(key);
        return cached === null || typeof cached === "undefined"
          ? undefined
          : cached;
      },
    });
  }

  async setCachedValue<T>(key: string, value: T, ttl: number) {
    await this.cacheManager.set(key, value, ttl);
  }
}
