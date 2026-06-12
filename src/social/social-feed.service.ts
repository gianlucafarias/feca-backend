import { Injectable, Logger } from "@nestjs/common";

import { serializeVisit } from "../lib/api-presenters";
import { SocialRepository } from "../infrastructure/repositories/social.repository";
import { PlacesService } from "../places/places.service";
import { FeedQueryDto } from "./dto/feed-query.dto";
import { buildFeedAppearanceReason, resolveOffset } from "./social.helpers";

@Injectable()
export class SocialFeedService {
  private readonly logger = new Logger(SocialFeedService.name);

  constructor(
    private readonly socialRepository: SocialRepository,
    private readonly placesService: PlacesService,
  ) {}

  async getFeed(userId: string, query: FeedQueryDto, origin?: string) {
    const offset = resolveOffset(query);
    const viewerTasteIds =
      (await this.socialRepository.getUserTastePreferenceIds(userId))
        ?.tastePreferenceIds ?? [];

    let cityIdOverride: string | undefined;
    if (query.mode === "city") {
      if (query.cityGooglePlaceId) {
        try {
          const city = await this.placesService.getOrCreateCityRecordByGooglePlaceId(
            query.cityGooglePlaceId,
            origin,
          );
          cityIdOverride = city.id;
        } catch {
          cityIdOverride = undefined;
        }
      }
      if (
        !cityIdOverride &&
        typeof query.lat === "number" &&
        Number.isFinite(query.lat) &&
        typeof query.lng === "number" &&
        Number.isFinite(query.lng)
      ) {
        try {
          const city = await this.placesService.getOrCreateCityRecordFromCoordinates(
            query.lat,
            query.lng,
            origin,
          );
          cityIdOverride = city.id;
        } catch {
          cityIdOverride = undefined;
        }
      }
    }

    const { visits, total } = await this.socialRepository.listFeed(userId, {
      lat: query.lat,
      limit: query.limit,
      lng: query.lng,
      mode: query.mode,
      offset,
      cityIdOverride,
    });

    if (process.env.FECA_DEBUG_CITY === "1") {
      this.logger.log(
        JSON.stringify({
          tag: "feed",
          userId,
          mode: query.mode,
          cityGooglePlaceId: query.cityGooglePlaceId ?? null,
          lat: query.lat ?? null,
          lng: query.lng ?? null,
          cityIdOverride: cityIdOverride ?? null,
          total,
          items: visits.length,
        }),
      );
    }

    const items = visits.map((visit) => {
      const appearanceReason = buildFeedAppearanceReason(
        query.mode,
        visit,
        viewerTasteIds,
        query.lat,
        query.lng,
      );

      return {
        appearanceReason,
        id: visit.id,
        summary: (appearanceReason ?? visit.note) || undefined,
        visit: serializeVisit(visit),
      };
    });

    return {
      items,
      nextCursor:
        offset + items.length < total ? String(offset + items.length) : null,
      total,
    };
  }
}
