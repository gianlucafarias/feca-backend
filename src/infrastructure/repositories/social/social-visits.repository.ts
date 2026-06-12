import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../database/prisma.service";
import { type PaginationInput, visitInclude } from "./social.repository.types";

@Injectable()
export class SocialVisitsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createVisit(input: {
    note: string;
    noiseLevel?: number;
    orderedItems?: string;
    placeId: string;
    photoUrls: string[];
    priceTier?: number;
    rating: number;
    tags: string[];
    userId: string;
    visitedAt: string;
    waitLevel?: number;
    wifiQuality?: number;
    wouldReturn?: "yes" | "maybe" | "no";
    placeDetailTags?: string[];
    hasParking?: boolean;
    petFriendly?: boolean;
  }) {
    return this.prisma.visit.create({
      data: {
        note: input.note,
        noiseLevel: input.noiseLevel ?? null,
        orderedItems: input.orderedItems ?? null,
        photoUrls: input.photoUrls,
        placeId: input.placeId,
        priceTier: input.priceTier ?? null,
        rating: input.rating,
        tags: input.tags,
        userId: input.userId,
        visitedAt: new Date(input.visitedAt),
        waitLevel: input.waitLevel ?? null,
        wifiQuality: input.wifiQuality ?? null,
        wouldReturn: input.wouldReturn ?? null,
        placeDetailTags: input.placeDetailTags ?? [],
        hasParking: input.hasParking ?? null,
        petFriendly: input.petFriendly ?? null,
      },
      include: visitInclude,
    });
  }

  async listVisitsByUser(userId: string, input: PaginationInput) {
    const where = { userId };
    const [visits, total] = await Promise.all([
      this.prisma.visit.findMany({
        where,
        include: visitInclude,
        orderBy: [{ visitedAt: "desc" }, { createdAt: "desc" }],
        skip: input.offset,
        take: input.limit,
      }),
      this.prisma.visit.count({ where }),
    ]);

    return { total, visits };
  }

  async listSavedPlaces(userId: string, input: PaginationInput) {
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.placeSave.findMany({
        where,
        include: {
          place: true,
        },
        orderBy: { createdAt: "desc" },
        skip: input.offset,
        take: input.limit,
      }),
      this.prisma.placeSave.count({ where }),
    ]);

    return { rows, total };
  }

  async isPlaceSaved(userId: string, placeId: string) {
    const row = await this.prisma.placeSave.findUnique({
      where: {
        userId_placeId: {
          placeId,
          userId,
        },
      },
    });

    return Boolean(row);
  }

  async savePlace(userId: string, placeId: string, reason?: string) {
    return this.prisma.placeSave.upsert({
      where: {
        userId_placeId: {
          placeId,
          userId,
        },
      },
      update: reason ? { reason } : {},
      create: {
        placeId,
        userId,
        reason,
      },
      include: {
        place: true,
      },
    });
  }

  async unsavePlace(userId: string, placeId: string) {
    await this.prisma.placeSave.deleteMany({
      where: {
        placeId,
        userId,
      },
    });
  }

  async listRecentlyInteractedPlaceRouteIds(userId: string, since: Date) {
    const [visits, saves] = await Promise.all([
      this.prisma.visit.findMany({
        where: {
          createdAt: { gte: since },
          userId,
        },
        select: {
          place: {
            select: {
              id: true,
              sourcePlaceId: true,
            },
          },
        },
      }),
      this.prisma.placeSave.findMany({
        where: {
          createdAt: { gte: since },
          userId,
        },
        select: {
          place: {
            select: {
              id: true,
              sourcePlaceId: true,
            },
          },
        },
      }),
    ]);

    const ids = new Set<string>();

    for (const row of [...visits, ...saves]) {
      if (row.place.sourcePlaceId) {
        ids.add(row.place.sourcePlaceId);
      }
      ids.add(row.place.id);
    }

    return Array.from(ids);
  }
}
