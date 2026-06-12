import { Inject, Injectable, Logger } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import type { Cache } from "cache-manager";

import { AppConfigService } from "../config/app-config.service";
import { GooglePlacesClient } from "../infrastructure/google-places/google-places.client";
import { PlacesRepository } from "../infrastructure/repositories/places.repository";
import type { AutocompleteItem } from "../types";
import { AutocompletePlacesQueryDto } from "./dto/autocomplete-places.query.dto";
import { PlacesGoogleCacheService } from "./places-google-cache.service";

@Injectable()
export class PlacesAutocompleteService {
  private readonly logger = new Logger(PlacesAutocompleteService.name);

  constructor(
    private readonly placesRepository: PlacesRepository,
    private readonly google: GooglePlacesClient,
    private readonly config: AppConfigService,
    private readonly googleCache: PlacesGoogleCacheService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async autocomplete(input: AutocompletePlacesQueryDto, origin?: string) {
    const localPlaces = await this.placesRepository.searchPlaces(
      input.q,
      input.city,
      input.limit,
    );
    const localItems = localPlaces.map<AutocompleteItem>((place) => ({
      id: place.id,
      source: place.source,
      sourcePlaceId: place.sourcePlaceId,
      placeId: place.id,
      name: place.name,
      address: place.address,
      city: place.city,
      lat: place.lat,
      lng: place.lng,
      categories: place.categories,
      coverPhotoUrl: place.coverPhotoUrl,
      ratingExternal: place.ratingExternal,
      ratingCountExternal: place.ratingCountExternal,
      alreadyInFeca: true,
    }));

    if (!this.googleCache.shouldUseGooglePlaces() || input.q.trim().length < 2) {
      return this.buildAutocompletePayload(
        localItems,
        input.q,
        this.googleCache.shouldUseGooglePlaces(),
      );
    }

    const cacheKey = this.buildAutocompleteCacheKey(input);
    const cached = await this.cacheManager.get<
      ReturnType<PlacesAutocompleteService["buildAutocompletePayload"]>
    >(cacheKey);
    if (cached) {
      this.googleCache.traceGoogleCache("autocomplete", {
        cache: "hit",
        key: cacheKey,
        origin,
      });
      return cached;
    }

    try {
      return await this.googleCache.runSingleFlight(
        cacheKey,
        async () => {
          this.googleCache.traceGoogleCache("autocomplete", {
            cache: "miss",
            key: cacheKey,
            origin,
            singleFlight: "leader",
          });

          const remoteItems = await this.google.autocomplete(
            {
              query: input.q,
              lat: input.lat,
              lng: input.lng,
              sessionToken: input.sessionToken,
              limit: input.limit,
            },
            {
              cache: "miss",
              key: cacheKey,
              origin,
              singleFlight: "leader",
            },
          );

          const merged = new Map<string, AutocompleteItem>();

          for (const item of localItems) {
            merged.set(item.placeId ?? item.id, item);
          }

          for (const item of remoteItems) {
            const existing = await this.placesRepository.getPlaceBySource(
              "google",
              item.sourcePlaceId,
            );
            const key = existing?.id ?? `google:${item.sourcePlaceId}`;

            if (!merged.has(key)) {
              merged.set(key, {
                id: key,
                source: "google",
                sourcePlaceId: item.sourcePlaceId,
                placeId: existing?.id ?? undefined,
                name: item.name,
                address: item.address,
                city: input.city ?? "",
                categories: [],
                distanceMeters: item.distanceMeters,
                alreadyInFeca: Boolean(existing),
              });
            }
          }

          const hiddenGoogleIds =
            await this.placesRepository.getHiddenGooglePlaceIds();
          const visibleMerged = Array.from(merged.values()).filter((item) => {
            const googlePlaceId = item.sourcePlaceId?.trim();
            return !googlePlaceId || !hiddenGoogleIds.has(googlePlaceId);
          });

          const payload = this.buildAutocompletePayload(
            visibleMerged.slice(0, input.limit),
            input.q,
            true,
          );
          await this.cacheManager.set(cacheKey, payload, this.config.cacheTtlMs);

          return payload;
        },
        () => {
          this.googleCache.traceGoogleCache("autocomplete", {
            cache: "miss_joined",
            key: cacheKey,
            origin,
            singleFlight: "joined",
          });
        },
      );
    } catch (error) {
      this.logger.error("Places autocomplete failed", error);

      return this.buildAutocompletePayload(localItems, input.q, false);
    }
  }

  private buildAutocompletePayload(
    items: AutocompleteItem[],
    query: string,
    providerAvailable: boolean,
  ) {
    return {
      items,
      fallback: {
        allowManual: true,
        prefillName: query.trim(),
      },
      providerAvailable,
    };
  }

  private buildAutocompleteCacheKey(input: AutocompletePlacesQueryDto) {
    const lat = typeof input.lat === "number" ? input.lat.toFixed(3) : "na";
    const lng = typeof input.lng === "number" ? input.lng.toFixed(3) : "na";
    return `places:autocomplete:v${this.googleCache.getAutocompleteCacheVersion()}:${input.q.trim().toLowerCase()}:${input.city?.trim().toLowerCase() ?? ""}:${lat}:${lng}:${input.limit}`;
  }
}
