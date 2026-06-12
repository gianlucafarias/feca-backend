import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

import { serializeVisit } from "../lib/api-presenters";
import { normalizeVisitPlaceTags } from "../lib/normalize-visit-place-tag";
import { PlacesRepository } from "../infrastructure/repositories/places.repository";
import { SocialRepository } from "../infrastructure/repositories/social.repository";
import { VisitPlaceTagsRepository } from "../infrastructure/repositories/visit-place-tags.repository";
import { PlacesService } from "../places/places.service";
import { NotificationsService } from "../social/notifications.service";
import { CreateVisitDto } from "./dto/create-visit.dto";
import { ListVisitPlaceTagsQueryDto } from "./dto/list-visit-place-tags.query.dto";
import { UpsertVisitPlaceTagDto } from "./dto/upsert-visit-place-tag.dto";

@Injectable()
export class VisitsService {
  constructor(
    private readonly placesRepository: PlacesRepository,
    private readonly socialRepository: SocialRepository,
    private readonly visitPlaceTagsRepository: VisitPlaceTagsRepository,
    private readonly placesService: PlacesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(userId: string, input: CreateVisitDto) {
    const place = await this.resolvePlaceForVisit(userId, input);
    const placeDetailTags = normalizeVisitPlaceTags(input.placeDetailTags);

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
      placeDetailTags,
      hasParking: input.hasParking,
      petFriendly: input.petFriendly,
    });

    if (placeDetailTags.length > 0) {
      await this.visitPlaceTagsRepository.upsertTagsForVisit(
        userId,
        place.id,
        placeDetailTags,
      );
    }

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

  async listMyVisitPlaceTags(userId: string, query: ListVisitPlaceTagsQueryDto) {
    const placeId = await this.resolveOptionalPlaceId(query.placeId, query.googlePlaceId);
    return this.visitPlaceTagsRepository.listMergedTags(userId, placeId);
  }

  async upsertMyVisitPlaceTag(userId: string, body: UpsertVisitPlaceTagDto) {
    const label = await this.visitPlaceTagsRepository.upsertUserTag(userId, body.label);
    if (!label) {
      throw new UnprocessableEntityException("Invalid tag label");
    }

    const placeId = await this.resolveOptionalPlaceId(body.placeId, body.googlePlaceId);
    if (placeId) {
      await this.visitPlaceTagsRepository.upsertPlaceTag(userId, placeId, label);
    }

    return this.visitPlaceTagsRepository.listMergedTags(userId, placeId);
  }

  private async resolveOptionalPlaceId(
    placeId?: string,
    googlePlaceId?: string,
  ): Promise<string | undefined> {
    if (placeId?.trim()) {
      const place = await this.placesRepository.getPlaceById(placeId.trim());
      if (!place) {
        throw new NotFoundException("Place not found");
      }
      return place.id;
    }

    if (googlePlaceId?.trim()) {
      const place = await this.placesRepository.getPlaceBySource(
        "google",
        googlePlaceId.trim(),
      );
      return place?.id;
    }

    return undefined;
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
