import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  mapApiGroupInvitePolicyToPrisma,
  mergeSerializedUserStats,
  serializeSocialSettings,
  serializeSocialState,
  serializeUserPublic,
  serializeUserSummary,
  serializeVisit,
} from "../lib/api-presenters";
import { SocialRepository } from "../infrastructure/repositories/social.repository";
import { PaginationQueryDto } from "../common/dto/pagination-query.dto";
import { SearchUsersQueryDto } from "./dto/search-users.query.dto";
import { SuggestedOnboardingUsersQueryDto } from "./dto/suggested-onboarding-users.query.dto";
import { UpdateSocialSettingsDto } from "./dto/update-social-settings.dto";
import { UpdateTasteDto } from "./dto/update-taste.dto";
import { NotificationsService } from "./notifications.service";
import {
  normalizeRequiredSearchQuery,
  normalizeTasteIds,
  serializeTasteSelection,
} from "./social.helpers";
import { TASTE_OPTIONS } from "./taste-options";

@Injectable()
export class SocialUsersService {
  constructor(
    private readonly socialRepository: SocialRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getUserProfile(viewerId: string, userId: string) {
    const profile = await this.socialRepository.findUserByIdWithContext(
      viewerId,
      userId,
    );

    if (!profile) {
      throw new NotFoundException("User not found");
    }

    return {
      social: serializeSocialState(profile.social),
      user: mergeSerializedUserStats(
        serializeUserPublic(profile.user),
        profile.stats,
      ),
    };
  }

  async searchUsers(userId: string, query: SearchUsersQueryDto) {
    const normalizedQuery = normalizeRequiredSearchQuery(query.q, {
      message: "q must have at least 2 characters",
      stripLeadingAt: true,
    });
    const result = await this.socialRepository.searchUsers(userId, {
      ...query,
      q: normalizedQuery,
    });

    return {
      total: result.total,
      users: result.users.map(serializeUserSummary),
    };
  }

  async listSuggestedOnboardingUsers(
    userId: string,
    query: SuggestedOnboardingUsersQueryDto,
  ) {
    const result = await this.socialRepository.listSuggestedOnboardingUsers(
      userId,
      {
        cityGooglePlaceId: query.cityGooglePlaceId,
        limit: query.limit ?? 6,
      },
    );

    return {
      total: result.total,
      users: result.users.map(serializeUserSummary),
    };
  }

  async followUser(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException("You cannot follow yourself");
    }

    const result = await this.socialRepository.followUser(userId, targetUserId);

    if (!result) {
      throw new NotFoundException("User not found");
    }

    if (result.created) {
      await this.notificationsService.publish({
        actorId: userId,
        entity: {
          id: userId,
          type: "user",
        },
        recipientIds: [targetUserId],
        type: "follow",
      });
    }

    return {
      following: result.social.following,
    };
  }

  async unfollowUser(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException("You cannot unfollow yourself");
    }

    const result = await this.socialRepository.unfollowUser(userId, targetUserId);

    if (!result) {
      throw new NotFoundException("User not found");
    }

    return {
      following: result.social.following,
    };
  }

  async listFollowing(userId: string, query: PaginationQueryDto) {
    const result = await this.socialRepository.listFollowing(userId, query);

    return {
      total: result.total,
      users: result.users.map(serializeUserSummary),
    };
  }

  async listFollowers(userId: string, query: PaginationQueryDto) {
    const result = await this.socialRepository.listFollowers(userId, query);

    return {
      total: result.total,
      users: result.users.map(serializeUserSummary),
    };
  }

  async getSocialSettings(userId: string) {
    const settings = await this.socialRepository.getSocialSettings(userId);

    return {
      settings: serializeSocialSettings(settings),
    };
  }

  async updateSocialSettings(userId: string, body: UpdateSocialSettingsDto) {
    const settings = await this.socialRepository.updateSocialSettings(userId, {
      activityVisibility: body.activityVisibility,
      diaryVisibility: body.diaryVisibility,
      ...(body.groupInvitePolicy !== undefined
        ? {
            groupInvitePolicy: mapApiGroupInvitePolicyToPrisma(body.groupInvitePolicy),
          }
        : {}),
      ...(body.pushEnabled !== undefined
        ? {
            pushEnabled: body.pushEnabled,
          }
        : {}),
    });

    return {
      settings: serializeSocialSettings(settings),
    };
  }

  getTasteOptions() {
    return {
      options: TASTE_OPTIONS,
    };
  }

  async getMyTaste(userId: string) {
    const taste = await this.socialRepository.getUserTastePreferenceIds(userId);

    if (!taste) {
      throw new NotFoundException("User not found");
    }

    return {
      taste: serializeTasteSelection(taste.tastePreferenceIds),
    };
  }

  async updateMyTaste(userId: string, body: UpdateTasteDto) {
    const selectedIds = normalizeTasteIds(body);
    const taste = await this.socialRepository.updateUserTastePreferenceIds(
      userId,
      selectedIds,
    );

    return {
      taste: serializeTasteSelection(taste.tastePreferenceIds),
    };
  }

  async getUserTaste(viewerId: string, userId: string) {
    const profile = await this.socialRepository.findUserByIdWithContext(
      viewerId,
      userId,
    );

    if (!profile) {
      throw new NotFoundException("User not found");
    }

    const selectedIds =
      viewerId === userId
        ? profile.user.tastePreferenceIds
        : profile.user.tastePreferenceIds.slice(0, 4);

    return {
      taste: serializeTasteSelection(selectedIds),
    };
  }

  async getMyVisits(userId: string, query: PaginationQueryDto) {
    const { visits, total } = await this.socialRepository.listVisitsByUser(
      userId,
      query,
    );

    return {
      total,
      visits: visits.map(serializeVisit),
    };
  }

  async getUserVisits(
    viewerId: string,
    userId: string,
    query: PaginationQueryDto,
  ) {
    const profile = await this.socialRepository.findUserByIdWithContext(
      viewerId,
      userId,
    );

    if (!profile) {
      throw new NotFoundException("User not found");
    }

    if (!profile.permissions.canViewActivity) {
      throw new ForbiddenException("Activity is private");
    }

    const { visits, total } = await this.socialRepository.listVisitsByUser(
      userId,
      query,
    );

    return {
      total,
      visits: visits.map(serializeVisit),
    };
  }
}
