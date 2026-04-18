import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

import { serializeVisit } from "../lib/api-presenters";
import { PlacesRepository } from "../infrastructure/repositories/places.repository";
import { SocialRepository } from "../infrastructure/repositories/social.repository";
import { PlacesService } from "../places/places.service";
import { NotificationsService } from "../social/notifications.service";
import { CreateVisitDto } from "./dto/create-visit.dto";

@Injectable()
export class VisitsService {
  constructor(
    private readonly placesRepository: PlacesRepository,
    private readonly socialRepository: SocialRepository,
    private readonly placesService: PlacesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(userId: string, input: CreateVisitDto) {
    const place = await this.resolvePlaceForVisit(userId, input);

    const visit = await this.socialRepository.createVisit({
      note: input.note,
      noiseLevel: input.noiseLevel,
      orderedItems: input.orderedItems,
      placeId: place.id,
      photoUrls: input.photoUrls,
      priceTier: input.priceTier,
      rating: input.rating,
      tags: input.tags,
      userId,
      visitedAt: input.visitedAt,
      waitLevel: input.waitLevel,
      wifiQuality: input.wifiQuality,
      wouldReturn: input.wouldReturn,
    });

    const settings = await this.socialRepository.getSocialSettings(userId);
    if (settings.activityVisibility !== "private") {
      await this.notificationsService.publish({
        actorId: userId,
        entity: {
          id: visit.id,
          type: "visit",
        },
        payload: {
          placeGooglePlaceId: visit.place.sourcePlaceId ?? null,
          placeId: visit.place.id,
          placeName: visit.place.name,
          rating: visit.rating,
          visitId: visit.id,
          visitedAt: input.visitedAt,
        },
        recipientIds: await this.socialRepository.listFollowerIds(userId),
        type: "visit_created",
      });
    }

    return { visit: serializeVisit(visit) };
  }

  private async resolvePlaceForVisit(userId: string, input: CreateVisitDto) {
    if (input.placeId) {
      const place = await this.placesRepository.getPlaceById(input.placeId);
      if (!place) {
        throw new NotFoundException("Place not found");
      }

      return place;
    }

    if (input.googlePlaceId) {
      return this.placesService.resolve({
        source: "google",
        sourcePlaceId: input.googlePlaceId.trim(),
      });
    }

    const placeName = input.placeName?.trim() ?? "";
    const placeAddress = input.placeAddress?.trim() ?? "";

    if (!placeName || !placeAddress) {
      throw new UnprocessableEntityException(
        "placeName and placeAddress are required when creating a manual visit",
      );
    }

    const userContext =
      await this.socialRepository.getUserPlaceCreationContext(userId);

    if (!userContext?.city || !userContext.cityId) {
      throw new UnprocessableEntityException(
        "Cannot create a manual place without a canonical city in the user profile",
      );
    }

    return this.placesRepository.createManualPlace({
      address: placeAddress,
      city: userContext.city,
      cityId: userContext.cityId,
      lat: userContext.lat ?? undefined,
      lng: userContext.lng ?? undefined,
      name: placeName,
    });
  }
}
