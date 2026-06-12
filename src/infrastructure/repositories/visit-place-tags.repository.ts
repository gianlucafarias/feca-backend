import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../database/prisma.service";
import {
  mergeVisitPlaceTags,
  normalizeVisitPlaceTag,
} from "../../lib/normalize-visit-place-tag";

@Injectable()
export class VisitPlaceTagsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listUserTags(userId: string): Promise<string[]> {
    const rows = await this.prisma.userVisitPlaceTag.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { label: true },
      take: 40,
    });

    return rows.map((row) => row.label);
  }

  async listPlaceTags(userId: string, placeId: string): Promise<string[]> {
    const rows = await this.prisma.userPlaceVisitDetailTag.findMany({
      where: { userId, placeId },
      orderBy: { updatedAt: "desc" },
      select: { label: true },
      take: 40,
    });

    return rows.map((row) => row.label);
  }

  async listMergedTags(
    userId: string,
    placeId?: string,
  ): Promise<{ userTags: string[]; placeTags: string[]; tags: string[] }> {
    const userTags = await this.listUserTags(userId);
    const placeTags = placeId ? await this.listPlaceTags(userId, placeId) : [];

    return {
      userTags,
      placeTags,
      tags: mergeVisitPlaceTags(userTags, placeTags),
    };
  }

  async upsertUserTag(userId: string, rawLabel: string): Promise<string | null> {
    const label = normalizeVisitPlaceTag(rawLabel);
    if (!label) {
      return null;
    }

    await this.prisma.userVisitPlaceTag.upsert({
      where: {
        userId_label: {
          userId,
          label,
        },
      },
      create: {
        userId,
        label,
      },
      update: {
        updatedAt: new Date(),
      },
    });

    return label;
  }

  async upsertPlaceTag(
    userId: string,
    placeId: string,
    rawLabel: string,
  ): Promise<string | null> {
    const label = normalizeVisitPlaceTag(rawLabel);
    if (!label) {
      return null;
    }

    await this.prisma.userPlaceVisitDetailTag.upsert({
      where: {
        userId_placeId_label: {
          userId,
          placeId,
          label,
        },
      },
      create: {
        userId,
        placeId,
        label,
      },
      update: {
        updatedAt: new Date(),
      },
    });

    return label;
  }

  async upsertTagsForVisit(
    userId: string,
    placeId: string,
    labels: string[],
  ): Promise<void> {
    for (const rawLabel of labels) {
      const label = await this.upsertUserTag(userId, rawLabel);
      if (label) {
        await this.upsertPlaceTag(userId, placeId, label);
      }
    }
  }
}
