import { Injectable } from "@nestjs/common";
import { ContentVisibility, Prisma } from "@prisma/client";

import { PrismaService } from "../../../database/prisma.service";
import { rankCandidatesWithRotation } from "../../../lib/dynamic-ranking";
import { distanceInMeters } from "../../../lib/geo";
import {
  buildNearbyScore,
  buildNetworkFeedScore,
  buildNowScore,
  buildRankingSeed,
  categorySignalWinners,
  isVisitVisibleToViewer,
  normalizeSettings,
  visitNegativeSignalWeight,
  visitPositiveSignalWeight,
} from "./social.repository.helpers";
import { SocialRepositorySupport } from "./social.repository.support";
import {
  GOOGLE_DATA_PORTABILITY_IMPORT_REASON,
  type FeedInput,
  type PaginationInput,
  visitInclude,
} from "./social.repository.types";

@Injectable()
export class SocialFeedRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: SocialRepositorySupport,
  ) {}

  async listFeed(userId: string, input: FeedInput) {
    await this.support.ensureUserSettings(userId);

    switch (input.mode) {
      case "city":
        return this.listCityFeed(userId, input);
      case "nearby":
        return this.listNearbyFeed(userId, input);
      case "now":
        return this.listNowFeed(userId, input);
      case "network":
        return this.listNetworkFeed(userId, input);
      default: {
        const _exhaustive: never = input.mode;
        return _exhaustive;
      }
    }
  }

  async getUserRecommendationSignals(userId: string) {
    const [row, importedCategories, visitCategorySignals, likedVisitSignals] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            cityId: true,
            outingPreferences: true,
            tastePreferenceIds: true,
          },
        }),
        this.getImportedSavedPlaceCategorySignals(userId),
        this.getVisitedPlaceCategorySignals(userId),
        this.getLikedNearbyVisitSignals(userId),
      ]);

    return {
      cityId: row?.cityId ?? null,
      importedPlaceCategoryIds: importedCategories,
      likedVisitedPlaceCategoryIds: visitCategorySignals.liked,
      dislikedVisitedPlaceCategoryIds: visitCategorySignals.disliked,
      likedNearbyGooglePlaceIds: likedVisitSignals.googlePlaceIds,
      outingPreferences: row?.outingPreferences ?? null,
      tastePreferenceIds: row?.tastePreferenceIds ?? [],
    };
  }

  private async getLikedNearbyVisitSignals(userId: string) {
    const visits = await this.prisma.visit.findMany({
      where: { userId },
      orderBy: [{ visitedAt: "desc" }, { createdAt: "desc" }],
      take: 120,
      select: {
        rating: true,
        wouldReturn: true,
        place: {
          select: {
            sourcePlaceId: true,
          },
        },
      },
    });

    const googlePlaceIds = new Set<string>();

    for (const visit of visits) {
      const positiveWeight = visitPositiveSignalWeight(
        visit.rating,
        visit.wouldReturn,
      );
      if (positiveWeight <= 0) {
        continue;
      }
      const googlePlaceId = visit.place.sourcePlaceId?.trim();
      if (googlePlaceId) {
        googlePlaceIds.add(googlePlaceId);
      }
    }

    return {
      googlePlaceIds: [...googlePlaceIds],
    };
  }

  private async getImportedSavedPlaceCategorySignals(userId: string) {
    const saves = await this.prisma.placeSave.findMany({
      where: {
        userId,
        reason: GOOGLE_DATA_PORTABILITY_IMPORT_REASON,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        place: {
          select: {
            categories: true,
          },
        },
      },
    });

    const counts = new Map<string, number>();
    for (const save of saves) {
      for (const category of save.place.categories) {
        const normalized = category.trim().toLowerCase();
        if (!normalized) {
          continue;
        }
        counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 24)
      .map(([category]) => category);
  }

  private async getVisitedPlaceCategorySignals(userId: string) {
    const visits = await this.prisma.visit.findMany({
      where: { userId },
      orderBy: [{ visitedAt: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        rating: true,
        wouldReturn: true,
        place: {
          select: {
            categories: true,
          },
        },
      },
    });

    const liked = new Map<string, number>();
    const disliked = new Map<string, number>();

    for (const visit of visits) {
      const positiveWeight = visitPositiveSignalWeight(
        visit.rating,
        visit.wouldReturn,
      );
      const negativeWeight = visitNegativeSignalWeight(
        visit.rating,
        visit.wouldReturn,
      );

      for (const category of visit.place.categories) {
        const normalized = category.trim().toLowerCase();
        if (!normalized) {
          continue;
        }

        if (positiveWeight > 0) {
          liked.set(normalized, (liked.get(normalized) ?? 0) + positiveWeight);
        }

        if (negativeWeight > 0) {
          disliked.set(
            normalized,
            (disliked.get(normalized) ?? 0) + negativeWeight,
          );
        }
      }
    }

    return {
      disliked: categorySignalWinners(disliked, liked, 16),
      liked: categorySignalWinners(liked, disliked, 24),
    };
  }

  private async listNetworkFeed(userId: string, input: PaginationInput) {
    const followingRows = await this.prisma.userFollow.findMany({
      where: {
        followerId: userId,
      },
      select: {
        followedId: true,
      },
    });

    const followedIds = followingRows.map((row) => row.followedId);

    if (followedIds.length === 0) {
      return {
        total: 0,
        visits: [],
      };
    }

    const where: Prisma.VisitWhereInput = {
      user: {
        id: { in: followedIds },
        settings: {
          is: {
            OR: [
              { activityVisibility: ContentVisibility.public },
              { activityVisibility: ContentVisibility.followers },
            ],
          },
        },
      },
    };

    const viewer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tastePreferenceIds: true },
    });
    const viewerTaste = viewer?.tastePreferenceIds ?? [];

    const poolTake = Math.min(500, Math.max(100, (input.offset + input.limit) * 20));

    const [pool, total] = await Promise.all([
      this.prisma.visit.findMany({
        where,
        include: visitInclude,
        orderBy: [{ visitedAt: "desc" }, { createdAt: "desc" }],
        skip: 0,
        take: poolTake,
      }),
      this.prisma.visit.count({ where }),
    ]);

    const ranked = rankCandidatesWithRotation(
      pool.map((visit) => ({
        baseScore: buildNetworkFeedScore(viewerTaste, visit),
        id: visit.id,
        item: visit,
      })),
      {
        bucketHours: 1,
        jitterRatio: 0.08,
        maxJitter: 12,
        seed: buildRankingSeed(userId, "feed-network", undefined, undefined),
        topWindow: pool.length,
      },
    );

    return {
      total,
      visits: ranked
        .slice(input.offset, input.offset + input.limit)
        .map((entry) => entry.item),
    };
  }

  private async listNearbyFeed(userId: string, input: FeedInput) {
    const viewerLocation =
      typeof input.lat === "number" && typeof input.lng === "number"
        ? { lat: input.lat, lng: input.lng }
        : await this.support.getViewerLocation(userId);

    if (!viewerLocation) {
      return {
        total: 0,
        visits: [],
      };
    }

    const { tastePreferenceIds: viewerTaste } =
      await this.getUserRecommendationSignals(userId);

    const nearby = rankCandidatesWithRotation(
      (await this.listVisibleRecentVisits(userId, 220))
        .filter(
          (visit) =>
            typeof visit.place.lat === "number" &&
            typeof visit.place.lng === "number",
        )
        .filter((visit) => {
          const distance = distanceInMeters(
            viewerLocation.lat,
            viewerLocation.lng,
            visit.place.lat!,
            visit.place.lng!,
          );

          return distance <= 3500;
        })
        .map((visit) => ({
          baseScore: buildNearbyScore(viewerLocation, visit, viewerTaste),
          id: visit.id,
          item: visit,
        })),
      {
        bucketHours: 1,
        jitterRatio: 0.1,
        maxJitter: 14,
        seed: buildRankingSeed(
          userId,
          "feed-nearby",
          viewerLocation.lat,
          viewerLocation.lng,
        ),
        topWindow: Math.max(input.limit * 4, 24),
      },
    );

    return {
      total: nearby.length,
      visits: nearby
        .slice(input.offset, input.offset + input.limit)
        .map((entry) => entry.item),
    };
  }

  private async listCityFeed(userId: string, input: FeedInput) {
    const targetCityId =
      typeof input.cityIdOverride === "string" && input.cityIdOverride.length > 0
        ? input.cityIdOverride
        : (
            await this.prisma.user.findUnique({
              where: { id: userId },
              select: { cityId: true },
            })
          )?.cityId;

    if (!targetCityId) {
      return {
        total: 0,
        visits: [],
      };
    }

    const where: Prisma.VisitWhereInput = {
      userId: {
        not: userId,
      },
      place: {
        cityId: targetCityId,
      },
      user: {
        settings: {
          is: {
            activityVisibility: ContentVisibility.public,
          },
        },
      },
    };

    const poolTake = Math.min(
      600,
      Math.max((input.offset + input.limit) * 18, input.limit * 24, 140),
    );

    const [pool, total] = await Promise.all([
      this.prisma.visit.findMany({
        where,
        include: visitInclude,
        orderBy: [{ visitedAt: "desc" }, { createdAt: "desc" }],
        skip: 0,
        take: poolTake,
      }),
      this.prisma.visit.count({ where }),
    ]);

    const ranked = rankCandidatesWithRotation(
      pool.map((visit) => ({
        baseScore:
          visit.visitedAt.getTime() / 86_400_000 +
          visit.rating * 2.5 +
          (visit.note.length > 80 ? 4 : 0),
        id: visit.id,
        item: visit,
      })),
      {
        bucketHours: 1,
        jitterRatio: 0.12,
        maxJitter: 16,
        seed: buildRankingSeed(userId, "feed-city", undefined, undefined),
        topWindow: Math.min(pool.length, Math.max(input.limit * 8, 48)),
      },
    );

    return {
      total,
      visits: ranked
        .slice(input.offset, input.offset + input.limit)
        .map((entry) => entry.item),
    };
  }

  private async listNowFeed(userId: string, input: FeedInput) {
    const viewerLocation =
      typeof input.lat === "number" && typeof input.lng === "number"
        ? { lat: input.lat, lng: input.lng }
        : await this.support.getViewerLocation(userId);

    const { tastePreferenceIds: viewerTaste } =
      await this.getUserRecommendationSignals(userId);

    const ranked = rankCandidatesWithRotation(
      (await this.listVisibleRecentVisits(userId, 220))
        .filter((visit) => {
          if (!viewerLocation) {
            return true;
          }

          if (
            typeof visit.place.lat !== "number" ||
            typeof visit.place.lng !== "number"
          ) {
            return false;
          }

          return (
            distanceInMeters(
              viewerLocation.lat,
              viewerLocation.lng,
              visit.place.lat!,
              visit.place.lng!,
            ) <= 6000
          );
        })
        .map((visit) => ({
          baseScore: buildNowScore(new Date(), visit, viewerTaste),
          id: visit.id,
          item: visit,
        })),
      {
        bucketHours: 1,
        jitterRatio: 0.09,
        maxJitter: 10,
        seed: viewerLocation
          ? buildRankingSeed(userId, "feed-now", viewerLocation.lat, viewerLocation.lng)
          : `${userId}:feed-now`,
        topWindow: Math.max(input.limit * 4, 24),
      },
    );

    return {
      total: ranked.length,
      visits: ranked
        .slice(input.offset, input.offset + input.limit)
        .map((entry) => entry.item),
    };
  }

  private async listVisibleRecentVisits(userId: string, take: number) {
    const followingIds = await this.support.listFollowingIds(userId);
    const followingSet = new Set(followingIds);

    const visits = await this.prisma.visit.findMany({
      include: visitInclude,
      orderBy: [{ visitedAt: "desc" }, { createdAt: "desc" }],
      take,
    });

    return visits.filter((visit) =>
      isVisitVisibleToViewer(
        userId,
        visit.userId,
        normalizeSettings(visit.user.settings),
        followingSet.has(visit.userId),
      ),
    );
  }
}
