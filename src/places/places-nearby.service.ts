import { Inject, Injectable, Logger } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import type { Cache } from "cache-manager";

import { AppConfigService } from "../config/app-config.service";
import {
  type GooglePlaceSummary,
  GooglePlacesClient,
  type NearbyPlaceView,
} from "../infrastructure/google-places/google-places.client";
import { CitiesRepository } from "../infrastructure/repositories/cities.repository";
import { PlaceCurationRepository } from "../infrastructure/repositories/place-curation.repository";
import { PlacesRepository } from "../infrastructure/repositories/places.repository";
import { SocialRepository } from "../infrastructure/repositories/social.repository";
import { exploreReasonLine } from "../lib/explore-intent-score";
import {
  resolveGoogleTypesForNearbyPool,
  resolveNearbyGooglePoolProfile,
} from "../lib/infer-google-place-types";
import { inferNearbyExploreIntent } from "../lib/infer-nearby-intent";
import {
  rankNearbyPlaceResults,
  type NearbyScoreBreakdown,
} from "../lib/nearby-ranking";
import { ExploreContextQueryDto } from "./dto/explore-context.query.dto";
import { GetNearbyPlacesQueryDto } from "./dto/get-nearby-places.query.dto";
import { RAW_GOOGLE_CANDIDATES_TTL_MS } from "./places.constants";
import { PlacesGoogleCacheService } from "./places-google-cache.service";
import {
  type NearbyQueryResolved,
  mapStoredPlaceToNearby,
} from "./places-nearby.helpers";
import { PlacesCitiesService } from "./places-cities.service";
import { PlacesNearbyPoolService } from "./places-nearby-pool.service";
import { PlacesNearbyPresentationService } from "./places-nearby-presentation.service";

@Injectable()
export class PlacesNearbyService {
  private readonly logger = new Logger(PlacesNearbyService.name);

  constructor(
    private readonly placesRepository: PlacesRepository,
    private readonly socialRepository: SocialRepository,
    private readonly placeCurationRepository: PlaceCurationRepository,
    private readonly google: GooglePlacesClient,
    private readonly config: AppConfigService,
    private readonly googleCache: PlacesGoogleCacheService,
    private readonly poolService: PlacesNearbyPoolService,
    private readonly presentationService: PlacesNearbyPresentationService,
    private readonly placesCitiesService: PlacesCitiesService,
    private readonly citiesRepository: CitiesRepository,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async nearby(
    userId: string,
    input: GetNearbyPlacesQueryDto,
    origin?: string,
  ): Promise<{
    places: NearbyPlaceView[];
    debugScores?: NearbyScoreBreakdown[];
  }> {
    const coords = await this.resolveViewerCoordinates(
      userId,
      input.lat,
      input.lng,
    );
    if (!coords) {
      return { places: [] };
    }

    const resolved: NearbyQueryResolved = {
      ...input,
      lat: coords.lat,
      lng: coords.lng,
    };

    if (process.env.FECA_DEBUG_CITY === "1") {
      this.logger.log(
        JSON.stringify({
          tag: "places.nearby",
          userId,
          queryLat: input.lat ?? null,
          queryLng: input.lng ?? null,
          resolvedLat: resolved.lat,
          resolvedLng: resolved.lng,
        }),
      );
    }

    const signals = await this.socialRepository.getUserRecommendationSignals(userId);
    const curationCityId = await this.resolveCurationCityId(
      signals.cityId,
      resolved.lat,
      resolved.lng,
      input.cityGooglePlaceId,
      origin,
    );
    const recommendationSignals = {
      ...signals,
      cityId: curationCityId ?? signals.cityId,
    };

    if (process.env.FECA_DEBUG_CITY === "1") {
      this.logger.log(
        JSON.stringify({
          tag: "places.nearby.curation_city",
          userId,
          profileCityId: signals.cityId,
          curationCityId,
          cityGooglePlaceId: input.cityGooglePlaceId ?? null,
        }),
      );
    }

    const query = resolved.query?.trim();
    const poolFetchLimit = 30;
    const candidateLimit = query ? resolved.limit : poolFetchLimit;

    const inferredIntent =
      resolved.intent ?? inferNearbyExploreIntent(signals.outingPreferences);
    const poolProfile = resolved.type
      ? null
      : resolveNearbyGooglePoolProfile({
          tastePreferenceIds: recommendationSignals.tastePreferenceIds,
          outingPreferences: recommendationSignals.outingPreferences,
          inferredIntent,
          explicitIntent: resolved.intent,
        });
    const googleTypes = resolveGoogleTypesForNearbyPool({
      explicitType: resolved.type,
      profile: poolProfile ?? "default",
    });

    const finalizeNearby = async (googlePool: GooglePlaceSummary[]) => {
      const hiddenGoogleIds =
        await this.placesRepository.getHiddenGooglePlaceIds();
      const visiblePool = googlePool.filter(
        (place) => !hiddenGoogleIds.has(place.googlePlaceId),
      );

      const candidates = query
        ? visiblePool
        : await this.poolService.buildNearbyCandidatePool(
            userId,
            resolved,
            recommendationSignals,
            visiblePool,
          );

      const visibleCandidates = candidates.filter(
        (place) => !hiddenGoogleIds.has(place.googlePlaceId),
      );

      if (visibleCandidates.length === 0) {
        return { places: [] as NearbyPlaceView[] };
      }

      const googleIds = visibleCandidates.map((p) => p.googlePlaceId);
      const [
        overlay,
        viewerRadar,
        fecaQualityByGoogleId,
        adminSignals,
        cityPickRows,
        curatedGoogleIdsForCity,
      ] = await Promise.all([
        this.socialRepository.getNearbyNetworkSignalsForGooglePlaces(
          userId,
          googleIds,
        ),
        this.socialRepository.getViewerRadarVisitOverlay(userId, googleIds),
        this.placesRepository.getFecaQualityByGooglePlaceIds(googleIds),
        this.placeCurationRepository.getActiveBoostsForGooglePlaceIds(
          googleIds,
          recommendationSignals.cityId,
        ),
        recommendationSignals.cityId
          ? this.placeCurationRepository.listCityPickPlacesInRadius(
              recommendationSignals.cityId,
              resolved.lat,
              resolved.lng,
              this.config.googlePlacesRadiusMeters,
              8,
            )
          : Promise.resolve([]),
        recommendationSignals.cityId
          ? this.placeCurationRepository.listCuratedGoogleIdsForCity(
              recommendationSignals.cityId,
            )
          : Promise.resolve(new Set<string>()),
      ]);

      let work = visibleCandidates;
      if (resolved.variant === "home_open_now") {
        work = visibleCandidates.filter((p) => p.openNow === true);
        if (work.length === 0) {
          return { places: [] };
        }
      }
      if (resolved.variant === "home_friends_liked") {
        work = candidates.filter(
          (p) => (overlay.boosts.get(p.googlePlaceId) ?? 0) > 0,
        );
        if (work.length === 0) {
          return { places: [] };
        }
      }

      work = work.filter((p) => {
        const st = viewerRadar.get(p.googlePlaceId);
        return st?.kind !== "exclude_from_radar";
      });
      if (work.length === 0) {
        return { places: [] };
      }

      const cityPickPlaces = cityPickRows
        .map((row) => mapStoredPlaceToNearby(row.place))
        .filter((place) => !hiddenGoogleIds.has(place.googlePlaceId));

      const ranking = query
        ? { places: work.slice(0, resolved.limit) }
        : rankNearbyPlaceResults(userId, resolved, work, {
            tastePreferenceIds: recommendationSignals.tastePreferenceIds,
            importedPlaceCategoryIds:
              recommendationSignals.importedPlaceCategoryIds,
            likedVisitedPlaceCategoryIds:
              recommendationSignals.likedVisitedPlaceCategoryIds,
            dislikedVisitedPlaceCategoryIds:
              recommendationSignals.dislikedVisitedPlaceCategoryIds,
            outingPreferences: recommendationSignals.outingPreferences,
            inferredIntent,
            explicitExploreIntent: resolved.intent,
            likedNearbyGooglePlaceIds: new Set(
              recommendationSignals.likedNearbyGooglePlaceIds,
            ),
            fecaQualityByGoogleId,
            adminBoostByGoogleId: adminSignals.boosts,
            curatedGoogleIds: curatedGoogleIdsForCity,
            cityPickPlaces,
            networkBoostByGoogleId: overlay.boosts,
            debugScores: input.debugScores === true,
          });

      const priorityPhotoGoogleIds = new Set<string>([
        ...curatedGoogleIdsForCity,
        ...adminSignals.cityPickGoogleIds,
      ]);
      const rankedWithPhotos =
        await this.presentationService.hydrateMissingNearbyPhotos(
          ranking.places,
          {
            origin,
            priorityGoogleIds: priorityPhotoGoogleIds,
          },
        );

      const places = await this.presentationService.presentNearbyPlaces(
        userId,
        rankedWithPhotos,
        {
          chips: overlay.chips,
          friendRows: overlay.friendRows,
          photoLimit: this.presentationService.getNearbyPhotoLimit(),
          priorityPhotoGoogleIds,
          viewerRadar,
          cityId: recommendationSignals.cityId,
        },
      );

      return {
        places,
        ...(ranking.debugScores ? { debugScores: ranking.debugScores } : {}),
      };
    };

    if (query) {
      const includePhotos = this.googleCache.shouldIncludeNearbyPhotos();
      const cacheKey = this.poolService.buildNearbyQueryCacheKey(
        resolved,
        includePhotos,
      );
      const cached = await this.cacheManager.get<GooglePlaceSummary[]>(cacheKey);
      if (cached != null) {
        this.googleCache.traceGoogleCache("searchText", {
          cache: "hit",
          key: cacheKey,
          origin,
        });
        return finalizeNearby(cached);
      }

      if (this.googleCache.shouldUseGooglePlaces()) {
        try {
          const sanitized = await this.googleCache.runSingleFlight(
            cacheKey,
            async () => {
              this.googleCache.traceGoogleCache("searchText", {
                cache: "miss",
                key: cacheKey,
                origin,
                singleFlight: "leader",
              });

              const places = await this.google.searchText(
                {
                  includeEnterpriseFields: resolved.variant === "home_open_now",
                  includePhotos,
                  lat: resolved.lat,
                  lng: resolved.lng,
                  limit: candidateLimit,
                  query,
                  type: resolved.type,
                },
                {
                  cache: "miss",
                  key: cacheKey,
                  origin,
                  singleFlight: "leader",
                },
              );

              const raw = places.filter(
                (place) =>
                  Boolean(place.googlePlaceId) &&
                  Number.isFinite(place.lat) &&
                  Number.isFinite(place.lng),
              );
              await this.cacheManager.set(
                cacheKey,
                raw,
                RAW_GOOGLE_CANDIDATES_TTL_MS,
              );
              return raw;
            },
            () => {
              this.googleCache.traceGoogleCache("searchText", {
                cache: "miss_joined",
                key: cacheKey,
                origin,
                singleFlight: "joined",
              });
            },
          );
          return finalizeNearby(sanitized);
        } catch (error) {
          this.logger.error("Places nearby failed", error);
        }
      }

      return this.placesRepository
        .listNearbyPlaces(
          resolved.lat,
          resolved.lng,
          undefined,
          candidateLimit,
          this.config.googlePlacesRadiusMeters,
        )
        .then((places) => places.map((place) => mapStoredPlaceToNearby(place, query)))
        .then((rows) => finalizeNearby(rows));
    }

    const needsOpeningHours = resolved.variant === "home_open_now";
    const includePhotos = this.googleCache.shouldIncludeNearbyPhotos();
    const poolKey = this.poolService.buildNearbyPoolCacheKey(
      {
        ...resolved,
        poolProfile: resolved.type ?? poolProfile ?? "default",
      },
      needsOpeningHours,
      includePhotos,
    );
    const cachedPool = await this.cacheManager.get<GooglePlaceSummary[]>(poolKey);
    if (cachedPool != null) {
      this.googleCache.traceGoogleCache("nearbySearch", {
        cache: "hit",
        key: poolKey,
        origin,
      });
      return finalizeNearby(cachedPool);
    }

    if (this.googleCache.shouldUseGooglePlaces()) {
      try {
        const sanitized = await this.googleCache.runSingleFlight(
          poolKey,
          async () => {
            this.googleCache.traceGoogleCache("nearbySearch", {
              cache: "miss",
              key: poolKey,
              origin,
              singleFlight: "leader",
            });

            const places = await this.poolService.fetchNearbyGooglePool(
              userId,
              resolved,
              needsOpeningHours,
              includePhotos,
              googleTypes,
            );
            const raw = places.filter(
              (place) =>
                Boolean(place.googlePlaceId) &&
                Number.isFinite(place.lat) &&
                Number.isFinite(place.lng),
            );
            await this.cacheManager.set(
              poolKey,
              raw,
              RAW_GOOGLE_CANDIDATES_TTL_MS,
            );
            return raw;
          },
          () => {
            this.googleCache.traceGoogleCache("nearbySearch", {
              cache: "miss_joined",
              key: poolKey,
              origin,
              singleFlight: "joined",
            });
          },
        );
        return finalizeNearby(sanitized);
      } catch (error) {
        this.logger.error("Places nearby failed", error);
      }
    }

    return this.placesRepository
      .listNearbyPlaces(
        resolved.lat,
        resolved.lng,
        undefined,
        poolFetchLimit,
        this.config.googlePlacesRadiusMeters,
      )
      .then((places) => places.map((place) => mapStoredPlaceToNearby(place)))
      .then((rows) => finalizeNearby(rows));
  }

  async exploreContext(
    userId: string,
    input: ExploreContextQueryDto,
    origin?: string,
  ) {
    const variant = input.intent === "open_now" ? "home_open_now" : undefined;
    const result = await this.nearby(
      userId,
      {
        lat: input.lat,
        lng: input.lng,
        cityGooglePlaceId: input.cityGooglePlaceId,
        limit: input.limit,
        intent: input.intent,
        variant,
      },
      origin ?? "explore_context",
    );

    return {
      places: result.places.map((place) => ({
        ...place,
        reason: exploreReasonLine(input.intent, place),
      })),
    };
  }

  private async resolveViewerCoordinates(
    userId: string,
    lat?: number,
    lng?: number,
  ): Promise<{ lat: number; lng: number } | null> {
    const latOk = typeof lat === "number" && Number.isFinite(lat);
    const lngOk = typeof lng === "number" && Number.isFinite(lng);
    if (latOk && lngOk) {
      return { lat, lng };
    }

    return this.socialRepository.getUserCoordinates(userId);
  }

  private async resolveCurationCityId(
    profileCityId: string | null,
    lat: number,
    lng: number,
    cityGooglePlaceId: string | undefined,
    origin?: string,
  ): Promise<string | null> {
    const trimmedGooglePlaceId = cityGooglePlaceId?.trim();
    if (trimmedGooglePlaceId) {
      try {
        const city =
          await this.placesCitiesService.getOrCreateCityRecordByGooglePlaceId(
            trimmedGooglePlaceId,
            origin,
          );
        return city.id;
      } catch {
        const city =
          await this.citiesRepository.findCityByGooglePlaceId(
            trimmedGooglePlaceId,
          );
        if (city) {
          return city.id;
        }
      }
    }

    if (profileCityId) {
      return profileCityId;
    }

    try {
      const city = await this.placesCitiesService.getOrCreateCityRecordFromCoordinates(
        lat,
        lng,
        origin,
      );
      return city.id;
    } catch {
      const nearest = await this.citiesRepository.findNearestCityByCoordinates(
        lat,
        lng,
      );
      return nearest?.id ?? null;
    }
  }
}
