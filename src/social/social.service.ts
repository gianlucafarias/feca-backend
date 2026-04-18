import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { GuideVisibility } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { randomBytes } from "node:crypto";

import {
  mergeSerializedUserStats,
  serializeUserSummary,
  serializeDiary,
  serializeGroup,
  serializeGroupEvent,
  serializeSavedPlaceRow,
  serializeSocialSettings,
  serializeSocialState,
  serializeUserPublic,
  serializeVisit,
} from "../lib/api-presenters";
import { PlacesRepository } from "../infrastructure/repositories/places.repository";
import { SocialRepository } from "../infrastructure/repositories/social.repository";
import { distanceInMeters } from "../lib/geo";
import { PlacesService } from "../places/places.service";
import { PaginationQueryDto } from "../common/dto/pagination-query.dto";
import { AddGroupMembersDto } from "./dto/add-group-members.dto";
import { AddDiaryPlaceDto } from "./dto/add-diary-place.dto";
import { AddGroupEventDto } from "./dto/add-group-event.dto";
import { CreateDiaryDto } from "./dto/create-diary.dto";
import { CreateGroupDto } from "./dto/create-group.dto";
import { FeedQueryDto } from "./dto/feed-query.dto";
import { JoinGroupDto } from "./dto/join-group.dto";
import { NotificationsService } from "./notifications.service";
import { SearchUsersQueryDto } from "./dto/search-users.query.dto";
import { SearchDiariesQueryDto } from "./dto/search-diaries.query.dto";
import { UpdateGroupEventRsvpDto } from "./dto/update-group-event-rsvp.dto";
import { UpdateSocialSettingsDto } from "./dto/update-social-settings.dto";
import { UpdateTasteDto } from "./dto/update-taste.dto";
import { TASTE_OPTIONS, TASTE_OPTION_IDS } from "./taste-options";

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    private readonly socialRepository: SocialRepository,
    private readonly placesRepository: PlacesRepository,
    private readonly placesService: PlacesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getFeed(userId: string, query: FeedQueryDto) {
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
    const settings = await this.socialRepository.updateSocialSettings(userId, body);

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
    const place = await this.resolveWritablePlace({ googlePlaceId });

    return {
      saved: await this.socialRepository.isPlaceSaved(userId, place.id),
    };
  }

  async savePlace(userId: string, googlePlaceId: string) {
    const place = await this.resolveWritablePlace({ googlePlaceId });
    await this.socialRepository.savePlace(userId, place.id);
    return { saved: true };
  }

  async unsavePlace(userId: string, googlePlaceId: string) {
    const place = await this.resolveWritablePlace({ googlePlaceId });
    await this.socialRepository.unsavePlace(userId, place.id);
    return { saved: false };
  }

  async listMyGroups(userId: string) {
    const groups = await this.socialRepository.listGroupsByUser(userId);

    return {
      groups: groups.map((group) =>
        serializeGroup(group, { viewerUserId: userId }),
      ),
      total: groups.length,
    };
  }

  async createGroup(userId: string, body: CreateGroupDto) {
    try {
      const result = await this.socialRepository.createGroup({
        createdById: userId,
        inviteCode: generateInviteCode(),
        memberIds: body.memberIds,
        name: body.name.trim(),
      });

      if (result.invitedUserIds.length > 0) {
        await this.notificationsService.publish({
          actorId: userId,
          entity: {
            id: result.group.id,
            type: "group",
          },
          payload: {
            groupId: result.group.id,
            groupName: result.group.name,
            inviteCode: result.group.inviteCode,
          },
          recipientIds: result.invitedUserIds,
          type: "group_invite",
        });
      }

      return {
        group: serializeGroup(result.group, { viewerUserId: userId }),
        rejectedInvites: result.rejectedInvites,
      };
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("No se pudo generar un codigo de invitacion");
      }

      throw error;
    }
  }

  async joinGroupByCode(userId: string, body: JoinGroupDto) {
    const result = await this.socialRepository.joinGroupByCode(userId, body.code);

    if (!result) {
      throw new NotFoundException("Group not found");
    }

    if (result.joinedNow) {
      await this.notificationsService.publish({
        actorId: userId,
        entity: {
          id: result.group.id,
          type: "group",
        },
        payload: {
          groupId: result.group.id,
          groupName: result.group.name,
        },
        recipientIds: buildGroupAdminRecipientIds(result.group, [userId]),
        type: "group_joined",
      });
    }

    return {
      group: serializeGroup(result.group, { viewerUserId: userId }),
    };
  }

  async getGroup(userId: string, groupId: string) {
    const group = await this.socialRepository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    await this.assertGroupAccess(userId, groupId);

    return {
      group: serializeGroup(group, { viewerUserId: userId }),
    };
  }

  async addGroupMembers(
    userId: string,
    groupId: string,
    body: AddGroupMembersDto,
  ) {
    const group = await this.socialRepository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    await this.assertGroupAdminAccess(userId, groupId);

    const result = await this.socialRepository.addGroupMembers({
      groupId,
      invitedById: userId,
      memberIds: body.memberIds,
    });

    if (!result) {
      throw new NotFoundException("Group not found");
    }

    if (result.invitedUserIds.length > 0) {
      await this.notificationsService.publish({
        actorId: userId,
        entity: {
          id: result.group.id,
          type: "group",
        },
        payload: {
          groupId: result.group.id,
          groupName: result.group.name,
          inviteCode: result.group.inviteCode,
        },
        recipientIds: result.invitedUserIds,
        type: "group_invite",
      });
    }

    return {
      group: serializeGroup(result.group, { viewerUserId: userId }),
      rejectedInvites: result.rejectedInvites,
    };
  }

  async addGroupEvent(userId: string, groupId: string, body: AddGroupEventDto) {
    const group = await this.socialRepository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    await this.assertGroupAccess(userId, groupId);

    const place = await this.resolveWritablePlace(body);
    const event = await this.socialRepository.createGroupEvent({
      date: body.date,
      groupId,
      placeId: place.id,
      proposedById: userId,
    });

    await this.notificationsService.publish({
      actorId: userId,
      entity: {
        id: event.id,
        type: "group_event",
      },
      payload: {
        eventDate: body.date,
        eventId: event.id,
        groupId: group.id,
        groupName: group.name,
        placeName: event.place.name,
      },
      recipientIds: buildAcceptedGroupMemberRecipientIds(group, [userId]),
      type: "group_event_proposed",
    });

    return {
      event: serializeGroupEvent(event, { viewerUserId: userId }),
    };
  }

  async setGroupEventRsvp(
    userId: string,
    groupId: string,
    eventId: string,
    body: UpdateGroupEventRsvpDto,
  ) {
    const group = await this.socialRepository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    await this.assertGroupAccess(userId, groupId);

    const event = await this.socialRepository.findGroupEventById(groupId, eventId);
    if (!event) {
      throw new NotFoundException("Event not found");
    }

    const updated = await this.socialRepository.setGroupEventRsvp({
      eventId,
      rsvp: body.rsvp,
      userId,
    });

    if (!updated) {
      throw new NotFoundException("Group not found");
    }

    if (updated.changed && body.rsvp !== "none") {
      await this.notificationsService.publish({
        actorId: userId,
        entity: {
          id: event.id,
          type: "group_event",
        },
        payload: {
          eventDate: formatDateOnly(event.date),
          eventId: event.id,
          groupId: updated.group.id,
          groupName: updated.group.name,
          placeName: event.place.name,
          rsvp: body.rsvp,
        },
        recipientIds: buildGroupEventRsvpRecipientIds(updated.group, event, userId),
        type: "group_event_rsvp",
      });
    }

    return {
      group: serializeGroup(updated.group, { viewerUserId: userId }),
    };
  }

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

  async addPlaceToDiary(userId: string, diaryId: string, body: AddDiaryPlaceDto) {
    const diary = await this.socialRepository.findDiaryById(diaryId);
    if (!diary) {
      throw new NotFoundException("Diary not found");
    }

    if (diary.createdById !== userId) {
      throw new ForbiddenException("You cannot edit this diary");
    }

    const place = await this.resolveWritablePlace(body);
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

  private async resolveWritablePlace(input: {
    googlePlaceId?: string;
    placeId?: string;
  }) {
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
      });
    }

    throw new BadRequestException("placeId or googlePlaceId is required");
  }

  private async assertGroupAccess(userId: string, groupId: string) {
    const membership = await this.socialRepository.findGroupMembership(groupId, userId);

    if (!membership) {
      throw new ForbiddenException("You do not have access to this group");
    }

    if (membership.status === "declined" || membership.status === "left") {
      throw new ForbiddenException("You are no longer part of this group");
    }
  }

  private async assertGroupAdminAccess(userId: string, groupId: string) {
    const membership = await this.socialRepository.findGroupMembership(groupId, userId);

    if (!membership) {
      throw new ForbiddenException("You do not have access to this group");
    }

    if (membership.status !== "accepted") {
      throw new ForbiddenException("You cannot manage this group");
    }

    if (membership.role !== "owner" && membership.role !== "admin") {
      throw new ForbiddenException("You cannot manage this group");
    }
  }
}

function generateInviteCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

function resolveOffset(query: PaginationQueryDto & { cursor?: string }) {
  if (!query.cursor) {
    return query.offset;
  }

  const parsed = Number(query.cursor);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return query.offset;
  }

  return Math.trunc(parsed);
}

function normalizeTasteIds(body: UpdateTasteDto) {
  const rawIds =
    body.selectedIds ??
    body.preferenceIds ??
    body.preferences?.map((preference) => preference.id) ??
    [];

  return Array.from(
    new Set(rawIds.filter((id) => TASTE_OPTION_IDS.has(id))),
  );
}

function serializeTasteSelection(selectedIds: string[]) {
  return {
    preferences: TASTE_OPTIONS.filter((option) => selectedIds.includes(option.id)),
    selectedIds,
  };
}

function resolveDiaryPublishedAt(body: CreateDiaryDto) {
  if (body.publishedAt) {
    return body.publishedAt;
  }

  if (body.visibility && body.visibility !== GuideVisibility.private) {
    return new Date().toISOString();
  }

  return undefined;
}

function canViewDiary(
  viewerId: string,
  diary: {
    createdById: string;
    visibility: GuideVisibility;
  },
  allowUnlisted: boolean,
) {
  if (viewerId === diary.createdById) {
    return true;
  }

  if (diary.visibility === GuideVisibility.public) {
    return true;
  }

  return allowUnlisted && diary.visibility === GuideVisibility.unlisted;
}

function filterVisibleDiaries<T extends { createdById: string; visibility: GuideVisibility }>(
  diaries: T[],
  viewerId: string,
  allowUnlisted: boolean,
) {
  return diaries.filter((diary) => canViewDiary(viewerId, diary, allowUnlisted));
}

function buildFeedAppearanceReason(
  mode: "network" | "nearby" | "now" | "city",
  visit: {
    note: string;
    noiseLevel: number | null;
    place: { lat?: number | null; lng?: number | null; name: string };
    rating: number;
    tags: string[];
    user: {
      displayName: string;
      tastePreferenceIds?: string[];
      username: string;
    };
    waitLevel: number | null;
    wifiQuality: number | null;
    wouldReturn: "yes" | "maybe" | "no" | null;
  },
  viewerTasteIds: string[],
  viewerLat?: number,
  viewerLng?: number,
) {
  const displayName = visit.user.displayName || visit.user.username;

  if (mode === "network") {
    const tasteOverlap = viewerTasteIds.filter((id) =>
      visit.user.tastePreferenceIds?.includes(id),
    ).length;

    if (visit.wouldReturn === "yes" || visit.rating >= 4) {
      return `${displayName} volveria`;
    }

    if (tasteOverlap >= 2) {
      return `${displayName} tiene gustos parecidos al tuyo`;
    }

    if ((visit.wifiQuality ?? 0) >= 4) {
      return `Bueno para trabajar segun ${displayName}`;
    }

    return `${displayName} paso por aca`;
  }

  if (mode === "nearby") {
    if (
      typeof viewerLat === "number" &&
      typeof viewerLng === "number" &&
      typeof visit.place.lat === "number" &&
      typeof visit.place.lng === "number"
    ) {
      const minutes = Math.max(
        2,
        Math.round(
          distanceInMeters(
            viewerLat,
            viewerLng,
            visit.place.lat,
            visit.place.lng,
          ) / 80,
        ),
      );

      if ((visit.wifiQuality ?? 0) >= 4) {
        return `A ${minutes} min caminando · bueno para trabajar`;
      }

      if ((visit.noiseLevel ?? 5) <= 2) {
        return `A ${minutes} min caminando · tranqui para leer`;
      }

      return `A ${minutes} min caminando`;
    }

    return "Cerca tuyo";
  }

  if (mode === "city") {
    if (visit.wouldReturn === "yes" || visit.rating >= 4) {
      return `${displayName} recomienda un lugar en tu ciudad`;
    }

    if ((visit.wifiQuality ?? 0) >= 4) {
      return `${displayName} fue a ${visit.place.name} y lo recomienda para trabajar`;
    }

    return `${displayName} reseño un lugar en tu ciudad`;
  }

  if (new Date().getDay() === 0 && visit.tags.includes("brunch")) {
    return "Muy elegido para brunch de domingo";
  }

  if ((visit.wifiQuality ?? 0) >= 4) {
    return "Abierto ahora y bueno para trabajar";
  }

  if ((visit.waitLevel ?? 5) <= 2) {
    return "Para una pausa rapida";
  }

  if ((visit.noiseLevel ?? 5) <= 2) {
    return "Tranqui para ir ahora";
  }

  return "Buen momento para ir ahora";
}

function normalizeRequiredSearchQuery(
  query: string | undefined,
  options: { message: string; stripLeadingAt: boolean },
) {
  const trimmed = (query ?? "").trim().replace(/\s+/g, " ");
  const normalized = options.stripLeadingAt
    ? trimmed.replace(/^@+/, "")
    : trimmed;

  if (normalized.length < 2) {
    throw new BadRequestException(options.message);
  }

  return normalized;
}

function scoreDiarySearchMatch(
  query: string,
  diary: {
    description?: string | null;
    intro?: string | null;
    name: string;
  },
) {
  const normalizedQuery = query.toLocaleLowerCase();
  const fields = [
    { value: diary.name, containsScore: 24, startsWithScore: 36 },
    { value: diary.intro ?? "", containsScore: 14, startsWithScore: 20 },
    { value: diary.description ?? "", containsScore: 10, startsWithScore: 16 },
  ];

  return fields.reduce((score, field) => {
    const normalizedValue = field.value.toLocaleLowerCase();
    if (!normalizedValue) {
      return score;
    }

    if (normalizedValue.startsWith(normalizedQuery)) {
      return score + field.startsWithScore;
    }

    if (normalizedValue.includes(normalizedQuery)) {
      return score + field.containsScore;
    }

    return score;
  }, 0);
}

function buildAcceptedGroupMemberRecipientIds(
  group: {
    members: Array<{
      status: "accepted" | "pending" | "declined" | "left";
      userId: string;
    }>;
  },
  excludedUserIds: string[] = [],
) {
  const excluded = new Set(excludedUserIds);

  return group.members
    .filter((member) => member.status === "accepted")
    .map((member) => member.userId)
    .filter((userId) => !excluded.has(userId));
}

function buildGroupAdminRecipientIds(
  group: {
    members: Array<{
      role: "owner" | "admin" | "member";
      status: "accepted" | "pending" | "declined" | "left";
      userId: string;
    }>;
  },
  excludedUserIds: string[] = [],
) {
  const excluded = new Set(excludedUserIds);

  return group.members
    .filter(
      (member) =>
        member.status === "accepted" &&
        (member.role === "owner" || member.role === "admin"),
    )
    .map((member) => member.userId)
    .filter((userId) => !excluded.has(userId));
}

function buildGroupEventRsvpRecipientIds(
  group: {
    members: Array<{
      role: "owner" | "admin" | "member";
      status: "accepted" | "pending" | "declined" | "left";
      userId: string;
    }>;
  },
  event: {
    proposedById: string;
  },
  actorUserId: string,
) {
  return Array.from(
    new Set([
      event.proposedById,
      ...buildGroupAdminRecipientIds(group),
    ]),
  ).filter((userId) => userId !== actorUserId);
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}
