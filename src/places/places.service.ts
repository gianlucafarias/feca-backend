import {
  BadRequestException,
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import type { Cache } from "cache-manager";

import { AppConfigService } from "../config/app-config.service";
import {
  type GoogleCitySummary,
  type FecaPlaceReview,
  GooglePlacesClient,
  type GooglePlacesMethod,
  type GooglePlaceDetailView,
  type GooglePlaceSummary,
  type NearbyPlaceView,
} from "../infrastructure/google-places/google-places.client";
import { CitiesRepository } from "../infrastructure/repositories/cities.repository";
import { PlacesRepository } from "../infrastructure/repositories/places.repository";
import { SocialRepository } from "../infrastructure/repositories/social.repository";
import { rankCandidatesWithRotation } from "../lib/dynamic-ranking";
import { distanceInMeters } from "../lib/geo";
import type { NearbyFriendSocialRow } from "../lib/nearby-network-chips";
import { buildNearbyOpeningChip } from "../lib/nearby-opening-chip";
import { utcWeekBucketId } from "../lib/ranking-time-seed";
import { scoreOutingAgainstIntent } from "../lib/outing-preferences";
import { scoreTasteAgainstPlace } from "../lib/taste-place-score";
import type { AutocompleteItem, CityRecord, PlaceRecord } from "../types";
import { AutocompleteCitiesQueryDto } from "./dto/autocomplete-cities.query.dto";
import { ExploreContextQueryDto } from "./dto/explore-context.query.dto";
import { AutocompletePlacesQueryDto } from "./dto/autocomplete-places.query.dto";
import { CreateManualPlaceDto } from "./dto/create-manual-place.dto";
import type { ExploreIntent } from "./explore-context";
import { GetNearbyPlacesQueryDto } from "./dto/get-nearby-places.query.dto";
import { ResolvePlaceDto } from "./dto/resolve-place.dto";

/** Query de nearby/explore con lat/lng ya resueltos (perfil o query). */
type NearbyQueryResolved = Omit<GetNearbyPlacesQueryDto, "lat" | "lng"> & {
  lat: number;
  lng: number;
};

type ExploreContextResolved = Omit<ExploreContextQueryDto, "lat" | "lng"> & {
  lat: number;
  lng: number;
};

const RAW_GOOGLE_CANDIDATES_TTL_MS = 5 * 60 * 1000;
const AUTOCOMPLETE_CITIES_TTL_MS = 60 * 1000;
const PLACE_DETAIL_TTL_MS = 60 * 60 * 1000;
const CITY_LOOKUP_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private readonly inflight = new Map<string, Promise<unknown>>();
  private autocompleteCacheVersion = 1;

  constructor(
    private readonly citiesRepository: CitiesRepository,
    private readonly placesRepository: PlacesRepository,
    private readonly socialRepository: SocialRepository,
    private readonly google: GooglePlacesClient,
    private readonly config: AppConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

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

    if (!this.google.isEnabled || input.q.trim().length < 2) {
      return this.buildAutocompletePayload(
        localItems,
        input.q,
        this.google.isEnabled,
      );
    }

    const cacheKey = this.buildAutocompleteCacheKey(input);
    const cached = await this.cacheManager.get<
      ReturnType<PlacesService["buildAutocompletePayload"]>
    >(cacheKey);
    if (cached) {
      this.traceGoogleCache("autocomplete", {
        cache: "hit",
        key: cacheKey,
        origin,
      });
      return cached;
    }

    try {
      return await this.runSingleFlight(
        cacheKey,
        async () => {
          this.traceGoogleCache("autocomplete", {
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

          const payload = this.buildAutocompletePayload(
            Array.from(merged.values()).slice(0, input.limit),
            input.q,
            true,
          );
          await this.cacheManager.set(cacheKey, payload, this.config.cacheTtlMs);

          return payload;
        },
        () => {
          this.traceGoogleCache("autocomplete", {
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

  async autocompleteCities(
    input: AutocompleteCitiesQueryDto,
    origin?: string,
  ) {
    if (input.q.trim().length < 2) {
      return [];
    }

    const cacheKey = this.buildCitiesAutocompleteCacheKey(input);

    try {
      return await this.getCachedGoogleValue({
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
    const city = await this.getCachedReverseGeocodeCity(lat, lng, origin);

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

  async resolve(input: ResolvePlaceDto, origin?: string) {
    const existing = await this.placesRepository.getPlaceBySource(
      input.source,
      input.sourcePlaceId,
    );
    if (existing) {
      return existing;
    }

    try {
      const details = await this.google.getPlaceDetails(input.sourcePlaceId, {
        sessionToken: input.sessionToken,
        trace: {
          cache: "skip",
          key: `places:resolve:${input.sourcePlaceId}`,
          origin,
        },
      });
      const city = await this.ensureStoredCityForCoordinates(
        details.lat,
        details.lng,
        origin,
      );
      const place = await this.placesRepository.upsertPlace({
        source: "google",
        sourcePlaceId: details.sourcePlaceId,
        name: details.name,
        address: details.address,
        city: city.name,
        cityId: city.id,
        lat: details.lat,
        lng: details.lng,
        categories: details.categories,
        ratingExternal: details.ratingExternal,
        ratingCountExternal: details.ratingCountExternal,
        phone: details.phone,
        website: details.website,
        openingHours: details.openingHours,
        googleMapsUri: details.googleMapsUri,
        coverPhotoRef: details.coverPhotoRef,
        coverPhotoUrl: details.coverPhotoUrl,
        lastSyncedAt: details.lastSyncedAt,
      });

      this.bumpAutocompleteCacheNamespace();
      return place;
    } catch {
      throw new BadGatewayException("Could not resolve place from Google Places");
    }
  }

  async createManualPlace(input: CreateManualPlaceDto, origin?: string) {
    const city = await this.ensureStoredCityByGooglePlaceId(
      input.cityGooglePlaceId,
      origin,
    );
    const place = await this.placesRepository.createManualPlace({
      city: input.city,
      cityId: city.id,
      address: input.address,
      lat: input.lat,
      lng: input.lng,
      name: input.name,
    });
    this.bumpAutocompleteCacheNamespace();
    return place;
  }

  async getPlaceProfile(
    viewerId: string,
    googlePlaceId: string,
    origin?: string,
  ): Promise<GooglePlaceDetailView & { social?: Record<string, unknown> }> {
    const localPlace =
      (await this.placesRepository.getPlaceBySource("google", googlePlaceId)) ??
      (await this.placesRepository.getPlaceById(googlePlaceId));
    const fecaReviews = localPlace
      ? await this.placesRepository
          .listFecaReviews(localPlace.id)
          .then((visits) => visits.map(mapVisitToFecaReview))
      : [];

    if (this.google.isEnabled) {
      try {
        const detail = await this.getCachedPlaceDetailView(googlePlaceId, origin);
        const social = localPlace
          ? await this.socialRepository.getPlaceSocialContext(viewerId, localPlace.id)
          : undefined;

        return {
          ...detail,
          fecaReviews,
          ...(social ? { social } : {}),
        };
      } catch (error) {
        this.logger.error("Place details failed", error);
      }
    }

    if (!localPlace) {
      throw new NotFoundException("Place not found");
    }

    const social = await this.socialRepository.getPlaceSocialContext(
      viewerId,
      localPlace.id,
    );

    return {
      ...mapStoredPlaceToDetail(localPlace, googlePlaceId, fecaReviews),
      social,
    };
  }

  async nearby(
    userId: string,
    input: GetNearbyPlacesQueryDto,
    origin?: string,
  ): Promise<NearbyPlaceView[]> {
    const coords = await this.resolveViewerCoordinates(
      userId,
      input.lat,
      input.lng,
    );
    if (!coords) {
      return [];
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
    const query = resolved.query?.trim();
    const poolFetchLimit = 30;
    const candidateLimit = query ? resolved.limit : poolFetchLimit;

    const finalizeNearby = async (candidates: GooglePlaceSummary[]) => {
      if (candidates.length === 0) {
        return [];
      }
      const overlay = await this.socialRepository.getNearbyNetworkSignalsForGooglePlaces(
        userId,
        candidates.map((p) => p.googlePlaceId),
      );

      let work = candidates;
      if (resolved.variant === "home_open_now") {
        work = candidates.filter((p) => p.openNow === true);
        if (work.length === 0) {
          return [];
        }
      }
      if (resolved.variant === "home_friends_liked") {
        work = candidates.filter(
          (p) => (overlay.boosts.get(p.googlePlaceId) ?? 0) > 0,
        );
        if (work.length === 0) {
          return [];
        }
      }

      const ranked = query
        ? work.slice(0, resolved.limit)
        : rankNearbyPlaceResults(
            userId,
            resolved,
            work,
            signals.tastePreferenceIds,
            overlay.boosts,
          );
      return this.presentNearbyPlaces(userId, ranked, {
        chips: overlay.chips,
        friendRows: overlay.friendRows,
      });
    };

    if (query) {
      const cacheKey = this.buildNearbyQueryCacheKey(resolved);
      const cached = await this.cacheManager.get<GooglePlaceSummary[]>(cacheKey);
      if (cached != null) {
        this.traceGoogleCache("searchText", {
          cache: "hit",
          key: cacheKey,
          origin,
        });
        return finalizeNearby(cached);
      }

      if (this.google.isEnabled) {
        try {
          const sanitized = await this.runSingleFlight(
            cacheKey,
            async () => {
              this.traceGoogleCache("searchText", {
                cache: "miss",
                key: cacheKey,
                origin,
                singleFlight: "leader",
              });

              const places = await this.google.searchText(
                {
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
              this.traceGoogleCache("searchText", {
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
        .listNearbyPlaces(resolved.lat, resolved.lng, undefined, candidateLimit)
        .then((places) => places.map((place) => mapStoredPlaceToNearby(place, query)))
        .then((rows) => finalizeNearby(rows));
    }

    const poolKey = this.buildNearbyPoolCacheKey(resolved);
    const cachedPool = await this.cacheManager.get<GooglePlaceSummary[]>(poolKey);
    if (cachedPool != null) {
      this.traceGoogleCache("nearbySearch", {
        cache: "hit",
        key: poolKey,
        origin,
      });
      return finalizeNearby(cachedPool);
    }

    if (this.google.isEnabled) {
      try {
        const sanitized = await this.runSingleFlight(
          poolKey,
          async () => {
            this.traceGoogleCache("nearbySearch", {
              cache: "miss",
              key: poolKey,
              origin,
              singleFlight: "leader",
            });

            const places = await this.google.nearbySearch(
              {
                lat: resolved.lat,
                lng: resolved.lng,
                limit: poolFetchLimit,
                radius: this.config.googlePlacesRadiusMeters,
                type: resolved.type,
              },
              {
                cache: "miss",
                key: poolKey,
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
              poolKey,
              raw,
              RAW_GOOGLE_CANDIDATES_TTL_MS,
            );
            return raw;
          },
          () => {
            this.traceGoogleCache("nearbySearch", {
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
      .listNearbyPlaces(resolved.lat, resolved.lng, undefined, poolFetchLimit)
      .then((places) => places.map((place) => mapStoredPlaceToNearby(place)))
      .then((rows) => finalizeNearby(rows));
  }

  async exploreContext(userId: string, input: ExploreContextQueryDto) {
    const coords = await this.resolveViewerCoordinates(
      userId,
      input.lat,
      input.lng,
    );
    if (!coords) {
      return { places: [] };
    }

    const resolved: ExploreContextResolved = {
      ...input,
      lat: coords.lat,
      lng: coords.lng,
    };

    const signals = await this.socialRepository.getUserRecommendationSignals(userId);

    const nearby = await this.placesRepository.listNearbyPlaces(
      resolved.lat,
      resolved.lng,
      undefined,
      Math.min(resolved.limit * 3, 30),
    );

    const places = rankCandidatesWithRotation(
      nearby.map((place) => {
        const summary = mapStoredPlaceToNearby(place);
        const distanceMeters =
          typeof place.lat === "number" && typeof place.lng === "number"
            ? distanceInMeters(resolved.lat, resolved.lng, place.lat, place.lng)
            : 5000;

        const tasteBoost = scoreTasteAgainstPlace(
          signals.tastePreferenceIds,
          summary.types ?? [],
          resolved.intent,
        );
        const outingBoost = scoreOutingAgainstIntent(
          resolved.intent,
          signals.outingPreferences,
        );

        return {
          baseScore:
            scoreExploreIntent(resolved.intent, summary, distanceMeters) +
            tasteBoost +
            outingBoost,
          id: summary.googlePlaceId,
          item: {
            ...summary,
            reason: exploreReasonLine(resolved.intent, summary),
          },
        };
      }),
      {
        jitterRatio: 0.08,
        maxJitter: 9,
      seed: buildPlacesRankingSeed(
        userId,
        `explore:${resolved.intent}`,
        resolved.lat,
        resolved.lng,
        "all",
        undefined,
        undefined,
      ),
        topWindow: Math.max(resolved.limit * 4, 20),
      },
    )
      .slice(0, resolved.limit)
      .map((entry) => entry.item);

    return {
      places: await this.presentExploreRows(userId, places),
    };
  }

  private async presentNearbyPlaces(
    viewerId: string,
    places: GooglePlaceSummary[],
    preloaded?: {
      chips: Map<string, string[]>;
      friendRows: Map<string, NearbyFriendSocialRow[]>;
    },
  ): Promise<NearbyPlaceView[]> {
    if (places.length === 0) {
      return [];
    }

    const bundle =
      preloaded ??
      (await this.socialRepository.listNearbyNetworkChipsByGooglePlaceIds(
        viewerId,
        places.map((p) => p.googlePlaceId),
      ));
    const socialMap = bundle.chips;
    const friendRowsMap = bundle.friendRows;

    return places.map((place) => {
      const socialChips = socialMap.get(place.googlePlaceId) ?? [];
      const friendSocialRows = friendRowsMap.get(place.googlePlaceId) ?? [];
      const openingChip = buildNearbyOpeningChip(
        place.openNow,
        place.openingWeekdayLines,
      );
      const { openingWeekdayLines: _weekdayLines, ...rest } = place;
      const view: NearbyPlaceView = { ...rest };
      if (openingChip) {
        view.openingChip = openingChip;
      }
      if (socialChips.length > 0) {
        view.socialChips = socialChips;
      }
      if (friendSocialRows.length > 0) {
        view.friendSocialRows = friendSocialRows;
      }
      return view;
    });
  }

  private async presentExploreRows(
    viewerId: string,
    rows: Array<GooglePlaceSummary & { reason: string }>,
  ): Promise<Array<NearbyPlaceView & { reason: string }>> {
    const summaries = rows.map(({ reason: _reason, ...rest }) => rest);
    const views = await this.presentNearbyPlaces(viewerId, summaries);
    return views.map((view, i) => ({
      ...view,
      reason: rows[i].reason,
    }));
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
    return `places:autocomplete:v${this.autocompleteCacheVersion}:${input.q.trim().toLowerCase()}:${input.city?.trim().toLowerCase() ?? ""}:${lat}:${lng}:${input.limit}`;
  }

  private buildCitiesAutocompleteCacheKey(input: AutocompleteCitiesQueryDto) {
    const lat = typeof input.lat === "number" ? input.lat.toFixed(3) : "na";
    const lng = typeof input.lng === "number" ? input.lng.toFixed(3) : "na";
    return `places:cities:autocomplete:${input.q.trim().toLowerCase()}:${lat}:${lng}:${input.limit}`;
  }

  /** Pool compartido (sin texto) para todas las variantes de carrusel home. */
  private buildNearbyPoolCacheKey(
    input: Pick<NearbyQueryResolved, "lat" | "lng" | "type">,
  ) {
    return `places:nearby:pool:v4:${input.type ?? "all"}:${input.lat.toFixed(3)}:${input.lng.toFixed(3)}`;
  }

  private buildNearbyQueryCacheKey(input: NearbyQueryResolved) {
    const q = input.query?.trim().toLowerCase() ?? "";
    return `places:nearby:q:v3:${q}:${input.type ?? "all"}:${input.lat.toFixed(3)}:${input.lng.toFixed(3)}:${input.limit}`;
  }

  private buildStoredCityCacheKey(cityGooglePlaceId: string) {
    return `places:city:place:${cityGooglePlaceId}`;
  }

  private buildReverseCityCacheKey(lat: number, lng: number) {
    return `places:city:reverse:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  }

  private buildPlaceDetailCacheKey(placeId: string) {
    return `places:detail:${placeId}`;
  }

  private async ensureStoredCityByGooglePlaceId(
    cityGooglePlaceId: string,
    origin?: string,
  ): Promise<CityRecord> {
    try {
      return await this.getCachedGoogleValue({
        cacheKey: this.buildStoredCityCacheKey(cityGooglePlaceId),
        method: "getCityByPlaceId",
        origin,
        ttl: CITY_LOOKUP_TTL_MS,
        load: async () => {
          const existing =
            await this.citiesRepository.findCityByGooglePlaceId(cityGooglePlaceId);

          if (existing) {
            return existing;
          }

          const city = await this.google.getCityByPlaceId(cityGooglePlaceId, {
            cache: "miss",
            key: this.buildStoredCityCacheKey(cityGooglePlaceId),
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

  private async ensureStoredCityForCoordinates(
    lat?: number,
    lng?: number,
    origin?: string,
  ): Promise<CityRecord> {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BadGatewayException("Resolved place is missing coordinates");
    }

    const resolvedLat = lat as number;
    const resolvedLng = lng as number;

    const city = await this.getCachedReverseGeocodeCity(
      resolvedLat,
      resolvedLng,
      origin,
    );

    if (!city) {
      throw new BadGatewayException("Could not resolve city for place");
    }

    return this.upsertCitySummary(city);
  }

  private upsertCitySummary(city: GoogleCitySummary): Promise<CityRecord> {
    return this.citiesRepository.upsertCity({
      displayName: city.displayName,
      googlePlaceId: city.cityGooglePlaceId,
      lat: city.lat,
      lng: city.lng,
      name: city.city,
    });
  }

  private getCachedReverseGeocodeCity(
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

  private getCachedPlaceDetailView(
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
          cache: "miss",
          key: cacheKey,
          origin,
          singleFlight: "leader",
        }),
    });
  }

  private async getCachedGoogleValue<T>(options: {
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

  private traceGoogleCache(
    method: GooglePlacesMethod,
    trace: Parameters<GooglePlacesClient["traceCacheEvent"]>[0]["trace"],
  ) {
    this.google.traceCacheEvent({ method, trace });
  }

  private async runSingleFlight<T>(
    key: string,
    load: () => Promise<T>,
    onJoined?: () => void,
  ) {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) {
      onJoined?.();
      return existing;
    }

    const promise = load().finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }

  private bumpAutocompleteCacheNamespace() {
    this.autocompleteCacheVersion += 1;
  }
}

function networkBoostScoreForVariant(
  variant: NearbyQueryResolved["variant"],
  rawBoost: number,
): number {
  if (variant === "home_network") {
    return Math.min(56, rawBoost);
  }
  if (variant === "home_friends_liked") {
    return Math.min(72, rawBoost * 2.45 + 6);
  }
  return 0;
}

function rankNearbyPlaceResults(
  userId: string,
  input: NearbyQueryResolved,
  places: GooglePlaceSummary[],
  tastePreferenceIds: string[],
  networkBoostByGoogleId?: Map<string, number>,
) {
  const variant = input.variant;
  const useNetworkInRank =
    variant === "home_network" || variant === "home_friends_liked";

  return rankCandidatesWithRotation(
    places.map((place, index) => {
      const rawBoost = networkBoostByGoogleId?.get(place.googlePlaceId) ?? 0;
      return {
        baseScore:
          buildNearbyPlaceScore(input, place, index) +
          scoreTasteAgainstPlace(tastePreferenceIds, place.types ?? [], "solo") +
          (useNetworkInRank ? networkBoostScoreForVariant(variant, rawBoost) : 0),
        id: place.googlePlaceId,
        item: place,
      };
    }),
    {
      bucketHours: 1,
      jitterRatio: 0.14,
      maxJitter: 18,
      seed: buildPlacesRankingSeed(
        userId,
        "nearby",
        input.lat,
        input.lng,
        input.type ?? "all",
        input.variant,
        input.rotate,
      ),
      topWindow: Math.max(input.limit * 4, 20),
    },
  )
    .slice(0, input.limit)
    .map((entry) => entry.item);
}

function mapStoredPlaceToNearby(
  place: PlaceRecord,
  query?: string,
): GooglePlaceSummary {
  return {
    googlePlaceId: place.sourcePlaceId ?? place.id,
    name: place.name,
    address: place.address,
    lat: place.lat ?? 0,
    lng: place.lng ?? 0,
    rating: place.ratingExternal,
    userRatingCount: place.ratingCountExternal,
    types: place.categories,
    primaryType: place.categories[0],
    photoUrl: place.coverPhotoUrl,
    openNow: undefined,
    openingWeekdayLines:
      place.openingHours && place.openingHours.length > 0
        ? place.openingHours
        : undefined,
  };
}

function mapStoredPlaceToDetail(
  place: PlaceRecord,
  googlePlaceId: string,
  fecaReviews: FecaPlaceReview[],
): GooglePlaceDetailView {
  const summary = mapStoredPlaceToNearby(place);

  return {
    ...summary,
    googlePlaceId,
    editorialSummary: undefined,
    fecaReviews,
    openingHours: place.openingHours,
    photos: place.coverPhotoUrl ? [place.coverPhotoUrl] : [],
    reviews: undefined,
  };
}

function mapVisitToFecaReview(visit: {
  id: string;
  note: string;
  rating: number;
  visitedAt: Date;
  user: {
    displayName: string;
    username: string;
  };
}): FecaPlaceReview {
  return {
    id: visit.id,
    userDisplayName: visit.user.displayName || visit.user.username,
    rating: visit.rating,
    note: visit.note,
    visitedAt: visit.visitedAt.toISOString().slice(0, 10),
    relativeTime: formatRelativeTimeEs(visit.visitedAt),
  };
}

function formatRelativeTimeEs(date: Date) {
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / (60 * 1000));
  const absMinutes = Math.abs(diffMinutes);
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

  if (absMinutes < 60) {
    return rtf.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) {
    return rtf.format(diffDays, "day");
  }

  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) {
    return rtf.format(diffMonths, "month");
  }

  const diffYears = Math.round(diffMonths / 12);
  return rtf.format(diffYears, "year");
}

function scoreExploreIntent(
  intent: ExploreIntent,
  place: GooglePlaceSummary,
  distanceMeters: number,
) {
  let score = 100 - distanceMeters / 60 + (place.rating ?? 0) * 8;

  const types = new Set(place.types);
  const isCafe = types.has("cafe") || place.primaryType === "cafe";
  const isRestaurant =
    types.has("restaurant") || place.primaryType === "restaurant";

  switch (intent) {
    case "open_now":
      score += place.openNow ? 18 : 0;
      break;
    case "work_2h":
      score += isCafe ? 18 : 4;
      break;
    case "brunch_long":
      score += isRestaurant ? 18 : 8;
      break;
    case "solo":
      score += isCafe ? 14 : 6;
      break;
    case "first_date":
      score += (place.rating ?? 0) >= 4.3 ? 16 : 6;
      break;
    case "snack_fast":
      score += distanceMeters < 1200 ? 18 : 4;
      break;
    case "reading":
      score += isCafe ? 16 : 4;
      break;
    case "group_4":
      score += isRestaurant ? 14 : 8;
      break;
  }

  return score;
}

function buildNearbyPlaceScore(
  input: Pick<NearbyQueryResolved, "lat" | "lng">,
  place: GooglePlaceSummary,
  index: number,
) {
  const distance =
    Number.isFinite(place.lat) && Number.isFinite(place.lng)
      ? distanceInMeters(input.lat, input.lng, place.lat, place.lng)
      : 5000;

  return (
    180 -
    distance / 45 +
    (place.rating ?? 0) * 8 +
    (place.openNow ? 34 : 0) -
    index * 1.5
  );
}

function buildPlacesRankingSeed(
  userId: string,
  scope: string,
  lat: number,
  lng: number,
  type: string,
  variant?: string,
  rotate?: number,
) {
  const v = variant?.trim() ? variant : "";
  const week = utcWeekBucketId(new Date());
  const r =
    rotate != null && Number.isFinite(rotate) && rotate > 0
      ? String(Math.floor(rotate))
      : "";
  return `${userId}:${scope}:${type}:${v}:${week}:${lat.toFixed(2)}:${lng.toFixed(2)}:${r}`;
}

function exploreReasonLine(intent: ExploreIntent, place: GooglePlaceSummary) {
  switch (intent) {
    case "open_now":
      return place.openNow ? "Abierto ahora" : "Cerca para salir ya";
    case "work_2h":
      return "Cafe y foco para trabajar un rato";
    case "brunch_long":
      return "Para brunch sin apuro";
    case "solo":
      return "Comodo para ir solo";
    case "first_date":
      return "Buen tono para una primera cita";
    case "snack_fast":
      return "Sirve para una pausa rapida";
    case "reading":
      return "Tranqui para leer";
    case "group_4":
      return "Mejor para ir en grupo";
  }
}
