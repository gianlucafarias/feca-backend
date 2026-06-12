import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { AuthRepository } from "../auth/auth.repository";
import type { AccessTokenPayload } from "../auth/auth.types";
import { AppConfigService } from "../config/app-config.service";
import {
  GooglePlacesClient,
  type GooglePlaceDetailView,
} from "../infrastructure/google-places/google-places.client";
import { PlacesRepository } from "../infrastructure/repositories/places.repository";
import { SocialRepository } from "../infrastructure/repositories/social.repository";
import { CreateManualPlaceDto } from "./dto/create-manual-place.dto";
import { ResolvePlaceDto } from "./dto/resolve-place.dto";
import { PlacesCitiesService } from "./places-cities.service";
import { PlacesGoogleCacheService } from "./places-google-cache.service";
import {
  mapStoredPlaceToDetail,
  mapVisitToFecaReview,
  normalizeGooglePlaceId,
} from "./places-nearby.helpers";

@Injectable()
export class PlacesProfileService {
  private readonly logger = new Logger(PlacesProfileService.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly placesRepository: PlacesRepository,
    private readonly socialRepository: SocialRepository,
    private readonly citiesService: PlacesCitiesService,
    private readonly googleCache: PlacesGoogleCacheService,
    private readonly google: GooglePlacesClient,
    private readonly config: AppConfigService,
  ) {}

  async resolve(input: ResolvePlaceDto, origin?: string) {
    const sourcePlaceId = normalizeGooglePlaceId(input.sourcePlaceId);
    if (!sourcePlaceId) {
      throw new BadRequestException("sourcePlaceId is required");
    }

    const existing = await this.placesRepository.getPlaceBySource(
      input.source,
      sourcePlaceId,
    );
    if (existing?.coverPhotoUrl || !this.googleCache.shouldUseGooglePlaces()) {
      return existing!;
    }
    if (existing) {
      try {
        const details = await this.google.getPlaceDetails(sourcePlaceId, {
          trace: {
            cache: "skip",
            key: `places:resolve:photo:${sourcePlaceId}`,
            origin,
          },
        });
        const city = await this.citiesService.ensureStoredCityForCoordinates(
          details.lat ?? existing.lat,
          details.lng ?? existing.lng,
          origin,
        );
        const place = await this.placesRepository.upsertPlace({
          source: existing.source,
          sourcePlaceId: existing.sourcePlaceId ?? sourcePlaceId,
          name: details.name ?? existing.name,
          address: details.address ?? existing.address,
          city: city.name,
          cityId: existing.cityId ?? city.id,
          lat: details.lat ?? existing.lat,
          lng: details.lng ?? existing.lng,
          categories:
            details.categories.length > 0
              ? details.categories
              : existing.categories,
          ratingExternal: details.ratingExternal ?? existing.ratingExternal,
          ratingCountExternal:
            details.ratingCountExternal ?? existing.ratingCountExternal,
          phone: details.phone ?? existing.phone,
          website: details.website ?? existing.website,
          openingHours:
            details.openingHours && details.openingHours.length > 0
              ? details.openingHours
              : existing.openingHours,
          googleMapsUri: details.googleMapsUri ?? existing.googleMapsUri,
          coverPhotoRef: details.coverPhotoRef ?? existing.coverPhotoRef,
          coverPhotoUrl: details.coverPhotoUrl ?? existing.coverPhotoUrl,
          lastSyncedAt: details.lastSyncedAt,
        });
        this.googleCache.bumpAutocompleteCacheNamespace();
        return place;
      } catch (error) {
        this.logger.warn("Place photo backfill failed", error);
        return existing;
      }
    }

    if (!this.googleCache.shouldUseGooglePlaces()) {
      throw new NotFoundException("Place not found in local-only places mode");
    }

    try {
      const details = await this.google.getPlaceDetails(sourcePlaceId, {
        trace: {
          cache: "skip",
          key: `places:resolve:${sourcePlaceId}`,
          origin,
        },
      });
      const city = await this.citiesService.ensureStoredCityForCoordinates(
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

      this.googleCache.bumpAutocompleteCacheNamespace();
      return place;
    } catch (error) {
      this.logger.error("Place resolve failed", error);
      throw new BadGatewayException("Could not resolve place from Google Places");
    }
  }

  async createManualPlace(input: CreateManualPlaceDto, origin?: string) {
    const city = await this.citiesService.ensureStoredCityByGooglePlaceId(
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
    this.googleCache.bumpAutocompleteCacheNamespace();
    return place;
  }

  async getPlaceProfile(
    viewer: AccessTokenPayload,
    googlePlaceId: string,
    origin?: string,
  ): Promise<
    GooglePlaceDetailView & {
      social?: Record<string, unknown>;
      hiddenFromApp?: boolean;
    }
  > {
    const normalizedGooglePlaceId = normalizeGooglePlaceId(googlePlaceId);
    const localPlace =
      (await this.placesRepository.getPlaceBySource(
        "google",
        normalizedGooglePlaceId,
      )) ??
      (await this.placesRepository.getPlaceById(googlePlaceId));
    const isAdmin = await this.resolveViewerIsAdmin(viewer);

    if (localPlace?.hiddenFromApp && !isAdmin) {
      throw new NotFoundException("Place not found");
    }

    const fecaReviews = localPlace
      ? await this.placesRepository
          .listFecaReviews(localPlace.id)
          .then((visits) => visits.map(mapVisitToFecaReview))
      : [];

    if (this.googleCache.shouldUseGooglePlaces()) {
      try {
        const detail = await this.googleCache.getCachedPlaceDetailView(
          normalizedGooglePlaceId,
          origin,
        );
        const storedDetail = localPlace
          ? mapStoredPlaceToDetail(
              localPlace,
              normalizedGooglePlaceId,
              fecaReviews,
            )
          : undefined;
        const social = localPlace
          ? await this.socialRepository.getPlaceSocialContext(
              viewer.sub,
              localPlace.id,
            )
          : undefined;

        return {
          ...detail,
          ...(storedDetail
            ? {
                rating: detail.rating ?? storedDetail.rating,
                userRatingCount:
                  detail.userRatingCount ?? storedDetail.userRatingCount,
                photoUrl: detail.photoUrl ?? storedDetail.photoUrl,
                photos:
                  detail.photos.length > 0 ? detail.photos : storedDetail.photos,
                openingHours:
                  detail.openingHours ?? storedDetail.openingHours,
              }
            : {}),
          fecaReviews,
          ...(social ? { social } : {}),
          ...(isAdmin
            ? { hiddenFromApp: Boolean(localPlace?.hiddenFromApp) }
            : {}),
        };
      } catch (error) {
        this.logger.error("Place details failed", error);
      }
    }

    if (!localPlace) {
      throw new NotFoundException("Place not found");
    }

    const social = await this.socialRepository.getPlaceSocialContext(
      viewer.sub,
      localPlace.id,
    );

    return {
      ...mapStoredPlaceToDetail(
        localPlace,
        normalizedGooglePlaceId,
        fecaReviews,
      ),
      social,
      ...(isAdmin ? { hiddenFromApp: Boolean(localPlace.hiddenFromApp) } : {}),
    };
  }

  private async resolveViewerIsAdmin(viewer: AccessTokenPayload) {
    if (this.config.isFecaAdminEmail(viewer.email)) {
      return true;
    }

    const adminOverride = await this.authRepository.findUserAdminOverride(viewer.sub);
    return adminOverride?.isAdminOverride === true;
  }
}
