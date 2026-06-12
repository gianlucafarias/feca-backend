import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../../database/prisma.service";
import { normalizeSettings, shuffleDeterministic } from "./social.repository.helpers";
import { SocialRepositorySupport } from "./social.repository.support";
import {
  DEFAULT_SOCIAL_SETTINGS,
  type PaginationInput,
  type SocialSettingsView,
  type UserStats,
} from "./social.repository.types";

@Injectable()
export class SocialGraphRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: SocialRepositorySupport,
  ) {}

  async findUserByIdWithStats(userId: string) {
    await this.support.ensureUserSettings(userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        settings: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      settings: normalizeSettings(user.settings),
      stats: await this.getProfileStats(userId),
      user,
    };
  }

  async findUserByIdWithContext(viewerId: string, userId: string) {
    await this.support.ensureUserSettingsForUsers([viewerId, userId]);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        settings: true,
      },
    });

    if (!user) {
      return null;
    }

    const [stats, relationship] = await Promise.all([
      this.getProfileStats(userId),
      this.support.getUserRelationshipContext(viewerId, user),
    ]);

    return {
      permissions: relationship.permissions,
      settings: relationship.settings,
      social: relationship.social,
      stats,
      user,
    };
  }

  async searchUsers(
    viewerId: string,
    input: PaginationInput & { q?: string },
  ) {
    const where: Prisma.UserWhereInput = {
      id: { not: viewerId },
      ...(input.q
        ? {
            OR: [
              { displayName: { contains: input.q, mode: "insensitive" } },
              { username: { contains: input.q, mode: "insensitive" } },
              { city: { contains: input.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          avatarUrl: true,
          city: true,
          displayName: true,
          id: true,
          username: true,
        },
        orderBy: [{ displayName: "asc" }, { username: "asc" }],
        skip: input.offset,
        take: input.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      total,
      users,
    };
  }

  /**
   * Usuarios aleatorios para el onboarding (excluye al viewer y a quienes ya sigue).
   * Si `cityGooglePlaceId` coincide con la ciudad canónica del viewer, se prioriza ese cityId;
   * si no alcanza `limit`, se completa con candidatos del resto de la plataforma.
   */
  async listSuggestedOnboardingUsers(
    viewerId: string,
    options: { limit: number; cityGooglePlaceId?: string | null },
  ) {
    const limit = Math.min(Math.max(options.limit, 1), 10);

    const viewer = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: {
        cityId: true,
        cityRef: { select: { googlePlaceId: true } },
      },
    });

    const paramCity = options.cityGooglePlaceId?.trim() ?? "";
    let restrictCityId: string | null = null;
    if (
      paramCity.length > 0 &&
      viewer?.cityRef?.googlePlaceId === paramCity &&
      viewer.cityId
    ) {
      restrictCityId = viewer.cityId;
    }

    const followingRows = await this.prisma.userFollow.findMany({
      where: { followerId: viewerId },
      select: { followedId: true },
    });
    const excludeIds = new Set<string>([
      viewerId,
      ...followingRows.map((row) => row.followedId),
    ]);
    const notIn = Array.from(excludeIds);

    const poolCap = Math.max(limit * 20, 60);

    const fetchPool = async (cityId: string | null) =>
      this.prisma.user.findMany({
        where: {
          id: { notIn },
          ...(cityId ? { cityId } : {}),
        },
        select: {
          avatarUrl: true,
          city: true,
          displayName: true,
          id: true,
          username: true,
        },
        take: poolCap,
        orderBy: { createdAt: "desc" },
      });

    let pool = await fetchPool(restrictCityId);

    if (pool.length < limit && restrictCityId) {
      const global = await fetchPool(null);
      const seen = new Set(pool.map((u) => u.id));
      for (const row of global) {
        if (seen.size >= poolCap) {
          break;
        }
        if (!seen.has(row.id)) {
          seen.add(row.id);
          pool.push(row);
        }
      }
    }

    const seedMaterial = `${viewerId}:${new Date().toISOString().slice(0, 10)}`;
    const shuffled = shuffleDeterministic(pool, seedMaterial).slice(0, limit);

    return { total: shuffled.length, users: shuffled };
  }

  async getUserPlaceCreationContext(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        city: true,
        cityId: true,
        lat: true,
        lng: true,
      },
    });
  }

  async followUser(viewerId: string, targetUserId: string) {
    await this.support.ensureUserSettingsForUsers([viewerId, targetUserId]);

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        settings: true,
      },
    });

    if (!user) {
      return null;
    }

    const existingFollow = await this.prisma.userFollow.findUnique({
      where: {
        followerId_followedId: {
          followerId: viewerId,
          followedId: targetUserId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!existingFollow) {
      await this.prisma.userFollow.create({
        data: {
          followedId: targetUserId,
          followerId: viewerId,
        },
      });
    }

    return {
      ...(await this.support.getUserRelationshipContext(viewerId, user)),
      created: !existingFollow,
    };
  }

  async unfollowUser(viewerId: string, targetUserId: string) {
    await this.prisma.userFollow.deleteMany({
      where: {
        followedId: targetUserId,
        followerId: viewerId,
      },
    });

    await this.support.ensureUserSettings(targetUserId);

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        settings: true,
      },
    });

    if (!user) {
      return null;
    }

    return this.support.getUserRelationshipContext(viewerId, user);
  }

  async listFollowing(userId: string, input: PaginationInput) {
    const where = { followerId: userId };
    const [rows, total] = await Promise.all([
      this.prisma.userFollow.findMany({
        where,
        include: {
          followed: {
            select: {
              avatarUrl: true,
              city: true,
              displayName: true,
              id: true,
              username: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: input.offset,
        take: input.limit,
      }),
      this.prisma.userFollow.count({ where }),
    ]);

    return {
      total,
      users: rows.map((row) => row.followed),
    };
  }

  async listFollowers(userId: string, input: PaginationInput) {
    const where = { followedId: userId };
    const [rows, total] = await Promise.all([
      this.prisma.userFollow.findMany({
        where,
        include: {
          follower: {
            select: {
              avatarUrl: true,
              city: true,
              displayName: true,
              id: true,
              username: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: input.offset,
        take: input.limit,
      }),
      this.prisma.userFollow.count({ where }),
    ]);

    return {
      total,
      users: rows.map((row) => row.follower),
    };
  }

  async getSocialSettings(userId: string) {
    await this.support.ensureUserSettings(userId);

    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    return normalizeSettings(settings);
  }

  async updateSocialSettings(
    userId: string,
    input: Partial<SocialSettingsView>,
  ) {
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: {
        ...(input.activityVisibility !== undefined
          ? { activityVisibility: input.activityVisibility }
          : {}),
        ...(input.diaryVisibility !== undefined
          ? { diaryVisibility: input.diaryVisibility }
          : {}),
        ...(input.groupInvitePolicy !== undefined
          ? { groupInvitePolicy: input.groupInvitePolicy }
          : {}),
        ...(input.pushEnabled !== undefined
          ? { pushEnabled: input.pushEnabled }
          : {}),
      },
      create: {
        activityVisibility:
          input.activityVisibility ?? DEFAULT_SOCIAL_SETTINGS.activityVisibility,
        diaryVisibility:
          input.diaryVisibility ?? DEFAULT_SOCIAL_SETTINGS.diaryVisibility,
        groupInvitePolicy:
          input.groupInvitePolicy ?? DEFAULT_SOCIAL_SETTINGS.groupInvitePolicy,
        pushEnabled: input.pushEnabled ?? DEFAULT_SOCIAL_SETTINGS.pushEnabled,
        userId,
      },
    });

    return normalizeSettings(settings);
  }

  async getProfileStats(userId: string): Promise<UserStats> {
    const [visitCount, savedCount, followingCount, followersCount] =
      await Promise.all([
        this.prisma.visit.count({ where: { userId } }),
        this.prisma.placeSave.count({ where: { userId } }),
        this.prisma.userFollow.count({ where: { followerId: userId } }),
        this.prisma.userFollow.count({ where: { followedId: userId } }),
      ]);

    return {
      followersCount,
      followingCount,
      savedCount,
      visitCount,
    };
  }

  async getUserTastePreferenceIds(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tastePreferenceIds: true,
      },
    });
  }

  async getUserCityId(userId: string) {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { cityId: true },
    });
    return row?.cityId ?? null;
  }

  async updateUserTastePreferenceIds(userId: string, tastePreferenceIds: string[]) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        tastePreferenceIds,
      },
      select: {
        id: true,
        tastePreferenceIds: true,
      },
    });
  }

  async viewerFollowsUser(viewerId: string, targetUserId: string) {
    const row = await this.prisma.userFollow.findUnique({
      where: {
        followerId_followedId: {
          followedId: targetUserId,
          followerId: viewerId,
        },
      },
      select: { id: true },
    });

    return Boolean(row);
  }

  async listFollowedUserIds(viewerId: string) {
    const rows = await this.prisma.userFollow.findMany({
      select: { followedId: true },
      where: { followerId: viewerId },
    });

    return rows.map((row) => row.followedId);
  }

  async listFollowerIds(userId: string) {
    const rows = await this.prisma.userFollow.findMany({
      where: { followedId: userId },
      select: { followerId: true },
    });

    return rows.map((row) => row.followerId);
  }
}
