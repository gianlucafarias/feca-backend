import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { GuideVisibility, type Prisma } from "@prisma/client";

import { serializeDiary } from "../lib/api-presenters";
import { PlacesRepository } from "../infrastructure/repositories/places.repository";
import { SocialRepository } from "../infrastructure/repositories/social.repository";
import { PlacesService } from "../places/places.service";
import { AddDiaryPlaceDto } from "./dto/add-diary-place.dto";
import { CreateDiaryDto } from "./dto/create-diary.dto";
import { SearchDiariesQueryDto } from "./dto/search-diaries.query.dto";
import { UpdateDiaryDto } from "./dto/update-diary.dto";
import { NotificationsService } from "./notifications.service";
import {
  canViewDiary,
  filterVisibleDiaries,
  normalizeRequiredSearchQuery,
  resolveDiaryPublishedAt,
  resolveDiaryPublishedAtOnUpdate,
  scoreDiarySearchMatch,
} from "./social.helpers";

@Injectable()
export class SocialDiariesService {
  constructor(
    private readonly socialRepository: SocialRepository,
    private readonly placesRepository: PlacesRepository,
    private readonly placesService: PlacesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listMyDiaries(userId: string) {
    const diaries = await this.socialRepository.listDiariesByUser(userId);

    return {
      diaries: diaries.map(serializeDiary),
      total: diaries.length,
    };
  }

  async searchPublicDiaries(userId: string, query: SearchDiariesQueryDto) {
    const normalizedQuery = normalizeRequiredSearchQuery(query.q, {
      message: "q must have at least 2 characters",
      stripLeadingAt: false,
    });
    const result = await this.socialRepository.searchPublicDiaries({
      ...query,
      q: normalizedQuery,
    });

    const sorted = [...result.diaries].sort((left, right) => {
      const scoreDiff =
        scoreDiarySearchMatch(normalizedQuery, right) -
        scoreDiarySearchMatch(normalizedQuery, left);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      const rightPublished = right.publishedAt?.getTime() ?? 0;
      const leftPublished = left.publishedAt?.getTime() ?? 0;
      if (rightPublished !== leftPublished) {
        return rightPublished - leftPublished;
      }

      return right.createdAt.getTime() - left.createdAt.getTime();
    });

    return {
      diaries: sorted
        .slice(query.offset, query.offset + query.limit)
        .map(serializeDiary),
      total: result.total,
    };
  }

  async listUserDiaries(viewerId: string, userId: string) {
    const profile = await this.socialRepository.findUserByIdWithContext(
      viewerId,
      userId,
    );

    if (!profile) {
      throw new NotFoundException("User not found");
    }

    const diaries = filterVisibleDiaries(
      await this.socialRepository.listDiariesByUser(userId),
      viewerId,
      false,
    );

    return {
      diaries: diaries.map(serializeDiary),
      total: diaries.length,
    };
  }

  async createDiary(userId: string, body: CreateDiaryDto) {
    const diary = await this.socialRepository.createDiary({
      coverImageUrl: body.coverImageUrl?.trim() || undefined,
      createdById: userId,
      description: body.description?.trim() || undefined,
      editorialReason: body.editorialReason?.trim() || undefined,
      intro: body.intro?.trim() || undefined,
      name: body.name.trim(),
      publishedAt: resolveDiaryPublishedAt(body),
      visibility: body.visibility,
    });

    if (diary.visibility === GuideVisibility.public && diary.publishedAt) {
      await this.notificationsService.publish({
        actorId: userId,
        entity: {
          id: diary.id,
          type: "diary",
        },
        payload: {
          diaryId: diary.id,
          diaryName: diary.name,
        },
        recipientIds: await this.socialRepository.listFollowerIds(userId),
        type: "diary_published",
      });
    }

    return {
      diary: serializeDiary(diary),
    };
  }

  async listHomeEditorGuides(limit: number) {
    const { diaries, total } = await this.socialRepository.listHomeEditorGuides(limit);
    return {
      diaries: diaries.map(serializeDiary),
      total,
    };
  }

  async getDiary(viewerId: string, diaryId: string) {
    const diary = await this.socialRepository.findDiaryById(diaryId);
    if (!diary) {
      throw new NotFoundException("Diary not found");
    }

    if (!canViewDiary(viewerId, diary, true)) {
      throw new ForbiddenException("Diary is private");
    }

    return {
      diary: serializeDiary(diary),
    };
  }

  async addPlaceToDiary(
    userId: string,
    diaryId: string,
    body: AddDiaryPlaceDto,
    origin?: string,
  ) {
    const diary = await this.socialRepository.findDiaryById(diaryId);
    if (!diary) {
      throw new NotFoundException("Diary not found");
    }

    if (diary.createdById !== userId) {
      throw new ForbiddenException("You cannot edit this diary");
    }

    const place = await this.resolveWritablePlace(body, origin);
    const updatedDiary = await this.socialRepository.addPlaceToDiary(
      diaryId,
      place.id,
      {
        note: body.note?.trim() || undefined,
        position: body.position,
      },
    );

    if (!updatedDiary) {
      throw new NotFoundException("Diary not found");
    }

    return {
      diary: serializeDiary(updatedDiary),
    };
  }

  async updateDiary(userId: string, diaryId: string, body: UpdateDiaryDto) {
    const diary = await this.socialRepository.findDiaryById(diaryId);
    if (!diary) {
      throw new NotFoundException("Diary not found");
    }

    if (diary.createdById !== userId) {
      throw new ForbiddenException("You cannot edit this diary");
    }

    const mergedVisibility =
      body.visibility !== undefined ? body.visibility : diary.visibility;

    const nextPublishedAt = resolveDiaryPublishedAtOnUpdate(diary, body);

    const wasPublicLive =
      diary.visibility === GuideVisibility.public && Boolean(diary.publishedAt);
    const isPublicLive =
      mergedVisibility === GuideVisibility.public && Boolean(nextPublishedAt);

    const data: Prisma.DiaryUpdateInput = {};
    if (body.name !== undefined) {
      data.name = body.name.trim();
    }
    if (body.description !== undefined) {
      data.description = body.description.trim() || null;
    }
    if (body.intro !== undefined) {
      data.intro = body.intro.trim() || null;
    }
    if (body.editorialReason !== undefined) {
      data.editorialReason = body.editorialReason.trim() || null;
    }
    if (body.coverImageUrl !== undefined) {
      data.coverImageUrl = body.coverImageUrl.trim() || null;
    }
    if (body.visibility !== undefined) {
      data.visibility = body.visibility;
    }
    data.publishedAt = nextPublishedAt;

    const updated = await this.socialRepository.patchDiary(diaryId, data);

    if (!wasPublicLive && isPublicLive) {
      await this.notificationsService.publish({
        actorId: userId,
        entity: {
          id: updated.id,
          type: "diary",
        },
        payload: {
          diaryId: updated.id,
          diaryName: updated.name,
        },
        recipientIds: await this.socialRepository.listFollowerIds(userId),
        type: "diary_published",
      });
    }

    return {
      diary: serializeDiary(updated),
    };
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
}
