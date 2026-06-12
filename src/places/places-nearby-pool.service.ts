import { Injectable } from "@nestjs/common";

import { AppConfigService } from "../config/app-config.service";
import {
  type GooglePlaceSummary,
  GooglePlacesClient,
} from "../infrastructure/google-places/google-places.client";
import { PlaceCurationRepository } from "../infrastructure/repositories/place-curation.repository";
import { PlacesRepository } from "../infrastructure/repositories/places.repository";
import { SocialRepository } from "../infrastructure/repositories/social.repository";
import type { GoogleNearbyPlaceType } from "../lib/infer-google-place-types";
import {
  type NearbyQueryResolved,
  mapStoredPlaceToNearby,
  mergeGooglePlacesById,
  nearbyPoolRankSlotKey,
  normalizeGooglePlaceId,
  shuffleSeed,
  stableShuffleGooglePlaces,
  upsertNearbyCandidate,
} from "./places-nearby.helpers";

@Injectable()
export class PlacesNearbyPoolService {
  constructor(
    private readonly placesRepository: PlacesRepository,
    private readonly placeCurationRepository: PlaceCurationRepository,
    private readonly google: GooglePlacesClient,
    private readonly config: AppConfigService,
  ) {}

  buildNearbyQueryCacheKey(input: NearbyQueryResolved, includePhotos: boolean) {
    const q = input.query?.trim().toLowerCase() ?? "";
    const photoTier = includePhotos ? "photos" : "nophotos";
    return `places:nearby:q:v4:${q}:${input.type ?? "all"}:${input.lat.toFixed(3)}:${input.lng.toFixed(3)}:${input.limit}:${photoTier}`;
  }

  /** Pool compartido (sin texto) para todas las variantes de carrusel home. */
  buildNearbyPoolCacheKey(
    input: Pick<NearbyQueryResolved, "lat" | "lng" | "type"> & {
      poolProfile?: string;
    },
    includeEnterpriseFields: boolean,
    includePhotos: boolean,
  ) {
    const poolTier = input.type ?? input.poolProfile ?? "all";
    const rankSlot = nearbyPoolRankSlotKey(new Date(), input.type);
    const fieldTier = includeEnterpriseFields ? "enterprise" : "pro";
    const photoTier = includePhotos ? "photos" : "nophotos";
    return `places:nearby:pool:v10:${poolTier}:${input.lat.toFixed(3)}:${input.lng.toFixed(3)}:${rankSlot}:${fieldTier}:${photoTier}`;
  }

  async buildNearbyCandidatePool(
    userId: string,
    resolved: NearbyQueryResolved,
    signals: Awaited<
      ReturnType<SocialRepository["getUserRecommendationSignals"]>
    >,
    googlePool: GooglePlaceSummary[],
  ): Promise<GooglePlaceSummary[]> {
    const byId = new Map<string, GooglePlaceSummary>();
    for (const place of googlePool) {
      if (!place.googlePlaceId) {
        continue;
      }
      const normalizedId = normalizeGooglePlaceId(place.googlePlaceId);
      byId.set(normalizedId, { ...place, googlePlaceId: normalizedId });
    }

    const radius = this.config.googlePlacesRadiusMeters;
    const [fecaPositive, similarPlaces, cityCurations] = await Promise.all([
      this.placesRepository.listNearbyPlacesWithPositiveVisits(
        resolved.lat,
        resolved.lng,
        radius,
        25,
      ),
      this.placesRepository.listNearbyPlacesMatchingCategories(
        resolved.lat,
        resolved.lng,
        signals.likedVisitedPlaceCategoryIds,
        [...byId.keys()],
        radius,
        20,
      ),
      signals.cityId
        ? this.placeCurationRepository.listActiveForCity(signals.cityId)
        : Promise.resolve([]),
    ]);

    for (const place of fecaPositive) {
      upsertNearbyCandidate(byId, mapStoredPlaceToNearby(place));
    }

    for (const place of similarPlaces) {
      upsertNearbyCandidate(byId, mapStoredPlaceToNearby(place));
    }

    for (const row of cityCurations) {
      if (
        signals.cityId &&
        row.place.cityId &&
        row.place.cityId !== signals.cityId
      ) {
        continue;
      }
      const googlePlaceId = row.place.sourcePlaceId?.trim();
      if (!googlePlaceId) {
        continue;
      }
      const normalizedId = normalizeGooglePlaceId(googlePlaceId);
      const inGooglePool = byId.has(normalizedId);
      const shouldInject =
        row.isCityPick || row.boostScore > 0 || row.showRecommendedBadge;
      if (!shouldInject && !inGooglePool) {
        continue;
      }
      upsertNearbyCandidate(byId, {
        ...mapStoredPlaceToNearby(row.place),
        googlePlaceId: normalizedId,
      });
    }

    return stableShuffleGooglePlaces(
      [...byId.values()],
      shuffleSeed(userId, resolved, new Date(), "pool"),
    );
  }

  /**
   * Pool Google compartido por zona (café + restaurante por distancia).
   * La mezcla con señales del usuario ocurre en `buildNearbyCandidatePool`.
   */
  async fetchNearbyGooglePool(
    userId: string,
    resolved: Pick<NearbyQueryResolved, "lat" | "lng" | "type">,
    includeEnterpriseFields: boolean,
    includePhotos: boolean,
    googleTypes: GoogleNearbyPlaceType[],
  ): Promise<GooglePlaceSummary[]> {
    const radius = this.config.googlePlacesRadiusMeters;
    const limit = 20;
    const now = new Date();
    const uniqueTypes = [...new Set(googleTypes)];

    if (uniqueTypes.length === 1) {
      const rows = await this.google.nearbySearch({
        includeEnterpriseFields,
        includePhotos,
        lat: resolved.lat,
        lng: resolved.lng,
        limit,
        radius,
        type: uniqueTypes[0],
        rankPreference: "DISTANCE",
      });
      return stableShuffleGooglePlaces(
        rows,
        shuffleSeed(userId, resolved, now, "typed"),
      );
    }

    const batches = await Promise.all(
      uniqueTypes.map((type) =>
        this.google.nearbySearch({
          includeEnterpriseFields,
          includePhotos,
          lat: resolved.lat,
          lng: resolved.lng,
          limit,
          radius,
          type,
          rankPreference: "DISTANCE",
        }),
      ),
    );

    const merged = mergeGooglePlacesById(batches.flat());
    return stableShuffleGooglePlaces(
      merged,
      shuffleSeed(userId, resolved, now, "dist"),
    );
  }
}
