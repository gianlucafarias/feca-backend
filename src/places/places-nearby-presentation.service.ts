import { Injectable } from "@nestjs/common";

import { AppConfigService } from "../config/app-config.service";
import {
  type GooglePlaceSummary,
  type NearbyPlaceView,
} from "../infrastructure/google-places/google-places.client";
import { PlaceCurationRepository } from "../infrastructure/repositories/place-curation.repository";
import { SocialRepository } from "../infrastructure/repositories/social.repository";
import type { NearbyFriendSocialRow } from "../lib/nearby-network-chips";
import { buildNearbyOpeningChip } from "../lib/nearby-opening-chip";
import { MAX_VISIBLE_RECOMMENDED_BADGES } from "../lib/place-curation";
import type { ViewerRadarPlaceState } from "../lib/viewer-nearby-visit-reminder";
import { PlacesGoogleCacheService } from "./places-google-cache.service";

@Injectable()
export class PlacesNearbyPresentationService {
  constructor(
    private readonly socialRepository: SocialRepository,
    private readonly placeCurationRepository: PlaceCurationRepository,
    private readonly config: AppConfigService,
    private readonly googleCache: PlacesGoogleCacheService,
  ) {}

  getNearbyPhotoLimit() {
    if (!this.googleCache.shouldIncludeNearbyPhotos()) {
      return 0;
    }

    return this.config.googlePlacePhotosHomeLimit;
  }

  async presentNearbyPlaces(
    viewerId: string,
    places: GooglePlaceSummary[],
    preloaded?: {
      chips?: Map<string, string[]>;
      friendRows?: Map<string, NearbyFriendSocialRow[]>;
      photoLimit?: number;
      priorityPhotoGoogleIds?: Set<string>;
      viewerRadar?: Map<string, ViewerRadarPlaceState>;
      cityId?: string | null;
    },
  ): Promise<NearbyPlaceView[]> {
    if (places.length === 0) {
      return [];
    }

    const googleIds = places.map((p) => p.googlePlaceId);
    const [networkBundle, viewerRadarMap, recommendedBadges] = await Promise.all([
      preloaded?.chips != null && preloaded?.friendRows != null
        ? Promise.resolve({
            chips: preloaded.chips,
            friendRows: preloaded.friendRows,
          })
        : this.socialRepository.listNearbyNetworkChipsByGooglePlaceIds(
            viewerId,
            googleIds,
          ),
      preloaded?.viewerRadar != null
        ? Promise.resolve(preloaded.viewerRadar)
        : this.socialRepository.getViewerRadarVisitOverlay(viewerId, googleIds),
      preloaded?.cityId
        ? this.placeCurationRepository.getRecommendedBadgesByGooglePlaceIds(
            preloaded.cityId,
            googleIds,
          )
        : Promise.resolve(new Map<string, string>()),
    ]);
    const socialMap = networkBundle.chips;
    const friendRowsMap = networkBundle.friendRows;

    const photoLimit = preloaded?.photoLimit ?? places.length;
    let badgesShown = 0;

    return places.map((place, index) => {
      const socialChips = socialMap.get(place.googlePlaceId) ?? [];
      const friendSocialRows = friendRowsMap.get(place.googlePlaceId) ?? [];
      const openingChip = buildNearbyOpeningChip(
        place.openNow,
        place.openingWeekdayLines,
      );
      const { openingWeekdayLines: _weekdayLines, ...rest } = place;
      const keepPhoto =
        index < photoLimit ||
        preloaded?.priorityPhotoGoogleIds?.has(place.googlePlaceId) === true;
      const view: NearbyPlaceView = {
        ...rest,
        ...(keepPhoto ? {} : { photoUrl: undefined }),
      };
      if (openingChip) {
        view.openingChip = openingChip;
      }
      if (socialChips.length > 0) {
        view.socialChips = socialChips;
      }
      if (friendSocialRows.length > 0) {
        view.friendSocialRows = friendSocialRows;
      }
      const radarSt = viewerRadarMap.get(place.googlePlaceId);
      if (radarSt?.kind === "remind") {
        view.viewerVisitReminderChip = radarSt.chip;
      }
      if (badgesShown < MAX_VISIBLE_RECOMMENDED_BADGES) {
        const badge = recommendedBadges.get(place.googlePlaceId);
        if (badge) {
          view.fecaRecommendedBadge = badge;
          badgesShown += 1;
        }
      }
      return view;
    });
  }

  async hydrateMissingNearbyPhotos(
    places: GooglePlaceSummary[],
    options: {
      origin?: string;
      priorityGoogleIds?: Set<string>;
    },
  ): Promise<GooglePlaceSummary[]> {
    const photoBudget = this.getNearbyPhotoLimit();
    if (
      photoBudget <= 0 ||
      !this.googleCache.shouldUseGooglePlaces() ||
      places.length === 0
    ) {
      return places;
    }

    const priority = options.priorityGoogleIds ?? new Set<string>();
    const ordered = [
      ...places.filter((place) => priority.has(place.googlePlaceId)),
      ...places.filter((place) => !priority.has(place.googlePlaceId)),
    ];
    const toHydrate = ordered
      .filter((place) => !place.photoUrl && place.googlePlaceId)
      .slice(0, photoBudget);

    if (toHydrate.length === 0) {
      return places;
    }

    const hydrated = await Promise.all(
      toHydrate.map(async (place) => {
        try {
          const detail = await this.googleCache.getCachedPlaceDetailView(
            place.googlePlaceId,
            options.origin,
          );
          return {
            googlePlaceId: place.googlePlaceId,
            photoUrl: detail.photoUrl,
          };
        } catch {
          return {
            googlePlaceId: place.googlePlaceId,
            photoUrl: undefined,
          };
        }
      }),
    );

    const photoById = new Map(
      hydrated
        .filter((row) => row.photoUrl)
        .map((row) => [row.googlePlaceId, row.photoUrl!] as const),
    );

    if (photoById.size === 0) {
      return places;
    }

    return places.map((place) =>
      photoById.has(place.googlePlaceId)
        ? { ...place, photoUrl: photoById.get(place.googlePlaceId) }
        : place,
    );
  }
}
