import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../database/prisma.service";
import {
  buildPermissions,
  buildSocialState,
  normalizeSettings,
} from "./social.repository.helpers";
import type { UserWithSettings } from "./social.repository.types";

@Injectable()
export class SocialRepositorySupport {
  constructor(private readonly prisma: PrismaService) {}

  async ensureUserSettings(userId: string): Promise<void> {
    await this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  async ensureUserSettingsForUsers(userIds: string[]): Promise<void> {
    const distinctUserIds = Array.from(new Set(userIds.filter(Boolean)));
    await Promise.all(
      distinctUserIds.map((userId) => this.ensureUserSettings(userId)),
    );
  }

  async getRelationshipMaps(viewerId: string, userIds: string[]) {
    const distinctUserIds = Array.from(new Set(userIds.filter(Boolean)));

    if (distinctUserIds.length === 0) {
      return {
        followersOfViewer: new Set<string>(),
        followingByViewer: new Set<string>(),
      };
    }

    const rows = await this.prisma.userFollow.findMany({
      where: {
        OR: [
          {
            followerId: viewerId,
            followedId: {
              in: distinctUserIds,
            },
          },
          {
            followerId: {
              in: distinctUserIds,
            },
            followedId: viewerId,
          },
        ],
      },
      select: {
        followedId: true,
        followerId: true,
      },
    });

    const followingByViewer = new Set<string>();
    const followersOfViewer = new Set<string>();

    for (const row of rows) {
      if (row.followerId === viewerId) {
        followingByViewer.add(row.followedId);
      }

      if (row.followedId === viewerId) {
        followersOfViewer.add(row.followerId);
      }
    }

    return {
      followersOfViewer,
      followingByViewer,
    };
  }

  async getUserRelationshipContext(
    viewerId: string,
    targetUser: UserWithSettings,
  ) {
    const relationships = await this.getRelationshipMaps(viewerId, [
      targetUser.id,
    ]);
    const social = buildSocialState(targetUser.id, relationships);
    const settings = normalizeSettings(targetUser.settings);

    return {
      permissions: buildPermissions(viewerId, targetUser.id, settings, social),
      settings,
      social,
    };
  }

  async getViewerLocation(userId: string) {
    return this.getUserCoordinates(userId);
  }

  async listFollowingIds(userId: string) {
    const rows = await this.prisma.userFollow.findMany({
      where: { followerId: userId },
      select: { followedId: true },
    });

    return rows.map((row) => row.followedId);
  }

  async getUserCoordinates(
    userId: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        lat: true,
        lng: true,
      },
    });

    if (typeof user?.lat !== "number" || typeof user.lng !== "number") {
      return null;
    }

    return {
      lat: user.lat,
      lng: user.lng,
    };
  }
}
