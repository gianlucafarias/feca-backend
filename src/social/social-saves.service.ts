import { BadRequestException, Injectable } from "@nestjs/common";

import { serializeSavedPlaceRow } from "../lib/api-presenters";
import { PlacesRepository } from "../infrastructure/repositories/places.repository";
import { SocialRepository } from "../infrastructure/repositories/social.repository";
import { PlacesService } from "../places/places.service";
import { PaginationQueryDto } from "../common/dto/pagination-query.dto";
import { normalizeGooglePlaceRouteId } from "./social.helpers";

@Injectable()
export class SocialSavesService {
  constructor(
    private readonly socialRepository: SocialRepository,
    private readonly placesRepository: PlacesRepository,
    private readonly placesService: PlacesService,
  ) {}

  async listSavedPlaces(userId: string, query: PaginationQueryDto) {
    const { rows, total } = await this.socialRepository.listSavedPlaces(
      userId,
      query,
    );

    return {
      places: rows.map(serializeSavedPlaceRow),
      total,
    };
  }

  async getPlaceSaved(userId: string, googlePlaceId: string) {
    const place = await this.findStoredGooglePlace(googlePlaceId);

    return {
      saved: place ? await this.socialRepository.isPlaceSaved(userId, place.id) : false,
    };
  }

  async savePlace(userId: string, googlePlaceId: string) {
    const place = await this.resolveWritablePlace({ googlePlaceId });
    await this.socialRepository.savePlace(userId, place.id);
    return { saved: true };
  }

  async unsavePlace(userId: string, googlePlaceId: string) {
    const place = await this.findStoredGooglePlace(googlePlaceId);
    if (place) {
      await this.socialRepository.unsavePlace(userId, place.id);
    }
    return { saved: false };
  }

  private async resolveWritablePlace(input: {
    googlePlaceId?: string;
    placeId?: string;
    sessionToken?: string;
  }, origin?: string) {
    if (input.placeId) {
      const place = await this.placesRepository.getPlaceById(input.placeId);
      if (place) {
        return place;
      }
    }

    if (input.googlePlaceId) {
      return this.placesService.resolve({
        source: "google",
        sourcePlaceId: input.googlePlaceId,
        sessionToken: input.sessionToken,
      }, origin);
    }

    throw new BadRequestException("placeId or googlePlaceId is required");
  }

  private findStoredGooglePlace(googlePlaceId: string) {
    return this.placesRepository.getPlaceBySource(
      "google",
      normalizeGooglePlaceRouteId(googlePlaceId),
    );
  }
}
