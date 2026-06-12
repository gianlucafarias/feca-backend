import { Injectable } from "@nestjs/common";
import { GuideVisibility, PlaceSource } from "@prisma/client";

import {
  formatFriendSnippetFromSave,
  formatFriendSnippetFromVisit,
  formatNearbySocialChipLine,
  formatNearbyVisitChip,
  type NearbyFriendSocialRow,
  scoreNearbyVisitSignal,
} from "../../../lib/nearby-network-chips";
import {
  type ViewerRadarPlaceState,
  viewerRadarStateFromVisit,
} from "../../../lib/viewer-nearby-visit-reminder";
import { PrismaService } from "../../../database/prisma.service";
import {
  buildBestMoments,
  canViewContent,
  isVisitVisibleToViewer,
  normalizeSettings,
} from "./social.repository.helpers";
import { SocialRepositorySupport } from "./social.repository.support";
import { type VisitWithRelations, visitInclude } from "./social.repository.types";

@Injectable()
export class SocialPlaceContextRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: SocialRepositorySupport,
  ) {}

  /**
   * Señales de red por googlePlaceId: chips para UI y boost numérico para rankear
   * el modo `home_network` (sin duplicar queries con listNearbyNetworkChips).
   */
  async getNearbyNetworkSignalsForGooglePlaces(
    viewerId: string,
    googlePlaceIds: string[],
  ): Promise<{
    chips: Map<string, string[]>;
    boosts: Map<string, number>;
    friendRows: Map<string, NearbyFriendSocialRow[]>;
  }> {
    const chipsResult = new Map<string, string[]>();
    const boostsResult = new Map<string, number>();
    const friendRowsResult = new Map<string, NearbyFriendSocialRow[]>();
    const uniqueIds = Array.from(
      new Set(googlePlaceIds.filter((id) => Boolean(id && id.trim()))),
    );
    for (const id of uniqueIds) {
      chipsResult.set(id, []);
      boostsResult.set(id, 0);
      friendRowsResult.set(id, []);
    }
    if (uniqueIds.length === 0) {
      return { chips: chipsResult, boosts: boostsResult, friendRows: friendRowsResult };
    }

    await this.support.ensureUserSettings(viewerId);

    const followingIds = await this.support.listFollowingIds(viewerId);
    if (followingIds.length === 0) {
      return { chips: chipsResult, boosts: boostsResult, friendRows: friendRowsResult };
    }

    const followingSet = new Set(followingIds);

    const placeRows = await this.prisma.place.findMany({
      where: {
        source: PlaceSource.google,
        sourcePlaceId: { in: uniqueIds },
      },
      select: { id: true, sourcePlaceId: true },
    });

    if (placeRows.length === 0) {
      return { chips: chipsResult, boosts: boostsResult, friendRows: friendRowsResult };
    }

    const fecaIds = placeRows.map((row) => row.id);

    const [visits, saves] = await Promise.all([
      this.prisma.visit.findMany({
        where: {
          placeId: { in: fecaIds },
          userId: { in: followingIds },
        },
        include: visitInclude,
        orderBy: [{ visitedAt: "desc" }, { createdAt: "desc" }],
        take: 600,
      }),
      this.prisma.placeSave.findMany({
        where: {
          placeId: { in: fecaIds },
          userId: { in: followingIds },
        },
        include: {
          user: { include: { settings: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 400,
      }),
    ]);

    const visibleVisits = visits.filter((visit) =>
      isVisitVisibleToViewer(
        viewerId,
        visit.userId,
        normalizeSettings(visit.user.settings),
        followingSet.has(visit.userId),
      ),
    );

    const visibleSaves = saves.filter((save) =>
      canViewContent(
        normalizeSettings(save.user.settings).activityVisibility,
        followingSet.has(save.userId),
      ),
    );

    for (const row of placeRows) {
      const googleId = row.sourcePlaceId;
      if (!googleId) {
        continue;
      }

      const pid = row.id;

      const userVisitMap = new Map<string, VisitWithRelations>();
      for (const v of visibleVisits) {
        if (v.placeId !== pid) {
          continue;
        }
        const prev = userVisitMap.get(v.userId);
        const nextSource = {
          rating: v.rating,
          wouldReturn: v.wouldReturn,
          displayName: v.user.displayName || v.user.username,
          username: v.user.username,
          visitedAt: v.visitedAt,
        };
        if (!prev) {
          userVisitMap.set(v.userId, v);
          continue;
        }
        const prevSource = {
          rating: prev.rating,
          wouldReturn: prev.wouldReturn,
          displayName: prev.user.displayName || prev.user.username,
          username: prev.user.username,
          visitedAt: prev.visitedAt,
        };
        if (scoreNearbyVisitSignal(nextSource) > scoreNearbyVisitSignal(prevSource)) {
          userVisitMap.set(v.userId, v);
        }
      }

      type Signal = {
        userId: string;
        score: number;
        chip: string;
        friendRow: NearbyFriendSocialRow;
      };
      const signals: Signal[] = [];

      let boost = 0;
      for (const visit of userVisitMap.values()) {
        const source = {
          rating: visit.rating,
          wouldReturn: visit.wouldReturn,
          displayName: visit.user.displayName || visit.user.username,
          username: visit.user.username,
          visitedAt: visit.visitedAt,
        };
        const snippet = formatFriendSnippetFromVisit(source);
        signals.push({
          userId: visit.userId,
          score: scoreNearbyVisitSignal(source),
          chip: formatNearbyVisitChip(source),
          friendRow: {
            username: visit.user.username,
            avatarUrl: visit.user.avatarUrl ?? null,
            snippet,
          },
        });
        if (visit.wouldReturn === "yes") {
          boost += 26;
        } else if (visit.wouldReturn === "maybe" && visit.rating >= 4) {
          boost += 16;
        } else if (visit.rating >= 4) {
          boost += 11;
        } else {
          boost += 7;
        }
      }

      const visitedUserIds = new Set(userVisitMap.keys());
      for (const save of visibleSaves) {
        if (save.placeId !== pid) {
          continue;
        }
        if (visitedUserIds.has(save.userId)) {
          continue;
        }
        const saveSnippet = formatFriendSnippetFromSave(save.createdAt);
        signals.push({
          userId: save.userId,
          score: 26,
          chip: formatNearbySocialChipLine(save.user.username, saveSnippet),
          friendRow: {
            username: save.user.username,
            avatarUrl: save.user.avatarUrl ?? null,
            snippet: saveSnippet,
          },
        });
        boost += 14;
      }

      boostsResult.set(googleId, Math.min(56, boost));

      signals.sort((a, b) => b.score - a.score);

      const chips: string[] = [];
      const friendRows: NearbyFriendSocialRow[] = [];
      const usedUsers = new Set<string>();
      for (const s of signals) {
        if (chips.length >= 2) {
          break;
        }
        if (usedUsers.has(s.userId)) {
          continue;
        }
        usedUsers.add(s.userId);
        chips.push(s.chip);
        friendRows.push(s.friendRow);
      }

      chipsResult.set(googleId, chips);
      friendRowsResult.set(googleId, friendRows);
    }

    return { chips: chipsResult, boosts: boostsResult, friendRows: friendRowsResult };
  }

  /**
   * Estado de radar del propio usuario por lugar (reseña escrita + wouldReturn).
   * No depende de la red; sirve para filtrar carruseles y opcional chip de recordatorio.
   */
  async getViewerRadarVisitOverlay(
    viewerId: string,
    googlePlaceIds: string[],
  ): Promise<Map<string, ViewerRadarPlaceState>> {
    const out = new Map<string, ViewerRadarPlaceState>();
    const uniqueIds = Array.from(
      new Set(googlePlaceIds.filter((id) => Boolean(id && id.trim()))),
    );
    for (const id of uniqueIds) {
      out.set(id, { kind: "neutral" });
    }
    if (uniqueIds.length === 0) {
      return out;
    }

    const placeRows = await this.prisma.place.findMany({
      where: {
        source: PlaceSource.google,
        sourcePlaceId: { in: uniqueIds },
      },
      select: { id: true, sourcePlaceId: true },
    });

    if (placeRows.length === 0) {
      return out;
    }

    const fecaIds = placeRows.map((row) => row.id);

    const visits = await this.prisma.visit.findMany({
      where: {
        userId: viewerId,
        placeId: { in: fecaIds },
      },
      orderBy: [{ visitedAt: "desc" }, { createdAt: "desc" }],
      select: {
        placeId: true,
        visitedAt: true,
        wouldReturn: true,
        note: true,
      },
      take: 800,
    });

    const latestByPlaceId = new Map<
      string,
      { visitedAt: Date; wouldReturn: (typeof visits)[0]["wouldReturn"]; note: string }
    >();
    for (const v of visits) {
      if (!latestByPlaceId.has(v.placeId)) {
        latestByPlaceId.set(v.placeId, {
          visitedAt: v.visitedAt,
          wouldReturn: v.wouldReturn,
          note: v.note,
        });
      }
    }

    for (const row of placeRows) {
      const googleId = row.sourcePlaceId;
      if (!googleId) {
        continue;
      }
      const latest = latestByPlaceId.get(row.id);
      if (!latest) {
        out.set(googleId, { kind: "neutral" });
        continue;
      }
      const state = viewerRadarStateFromVisit({
        visitedAt: latest.visitedAt,
        wouldReturn: latest.wouldReturn,
        hasWrittenReview: latest.note.trim().length > 0,
      });
      out.set(googleId, state);
    }

    return out;
  }

  /** @deprecated Preferir `getNearbyNetworkSignalsForGooglePlaces` para evitar doble query. */
  async listNearbyNetworkChipsByGooglePlaceIds(
    viewerId: string,
    googlePlaceIds: string[],
  ): Promise<{
    chips: Map<string, string[]>;
    friendRows: Map<string, NearbyFriendSocialRow[]>;
  }> {
    const { chips, friendRows } = await this.getNearbyNetworkSignalsForGooglePlaces(
      viewerId,
      googlePlaceIds,
    );
    return { chips, friendRows };
  }

  async getPlaceSocialContext(viewerId: string, placeId: string) {
    await this.support.ensureUserSettings(viewerId);

    const [followingIds, visits, diaryRows] = await Promise.all([
      this.support.listFollowingIds(viewerId),
      this.prisma.visit.findMany({
        where: { placeId },
        include: visitInclude,
        orderBy: [{ visitedAt: "desc" }, { createdAt: "desc" }],
        take: 100,
      }),
      this.prisma.diaryPlace.findMany({
        where: {
          placeId,
          diary: {
            OR: [
              { createdById: viewerId },
              { visibility: GuideVisibility.public },
            ],
          },
        },
        include: {
          diary: true,
        },
        orderBy: [{ diary: { publishedAt: "desc" } }, { createdAt: "desc" }],
        take: 20,
      }),
    ]);

    const followingSet = new Set(followingIds);
    const visibleVisits = visits.filter((visit) =>
      isVisitVisibleToViewer(
        viewerId,
        visit.userId,
        normalizeSettings(visit.user.settings),
        followingSet.has(visit.userId),
      ),
    );

    const followersVisited = visibleVisits
      .filter((visit) => followingSet.has(visit.userId))
      .reduce<Array<{ userId: string; displayName: string }>>((acc, visit) => {
        if (acc.some((entry) => entry.userId === visit.userId)) {
          return acc;
        }

        acc.push({
          displayName: visit.user.displayName || visit.user.username,
          userId: visit.userId,
        });
        return acc;
      }, [])
      .slice(0, 6);

    const communityTags = Array.from(
      visibleVisits
        .flatMap((visit) => visit.tags)
        .reduce((counts, tag) => {
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
          return counts;
        }, new Map<string, number>())
        .entries(),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag]) => tag);

    const userPhotoUrls = visibleVisits
      .flatMap((visit) => visit.photoUrls)
      .filter(Boolean)
      .slice(0, 12);

    const diaryAppearances = diaryRows.map((row) => ({
      diaryId: row.diaryId,
      name: row.diary.name,
      visibility: row.diary.visibility,
    }));

    return {
      bestMoments: buildBestMoments(visibleVisits),
      communityTags,
      diaryAppearances,
      followersVisited,
      guideAppearances: diaryAppearances,
      userPhotoUrls,
    };
  }
}
