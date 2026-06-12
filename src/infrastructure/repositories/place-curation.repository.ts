import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import {
  filterSortByDistance,
  geoBoundsFromRadiusMeters,
  nearbySqlTakeLimit,
} from "../../lib/geo-bounds";
import { FECA_RECOMMENDED_BADGE_LABEL } from "../../lib/place-curation";
import { normalizeGooglePlaceId } from "../../places/places-nearby.helpers";
import { mapPlaceRecord } from "./prisma-mappers";

export type PlaceCurationRecord = {
  id: string;
  placeId: string;
  cityId: string | null;
  boostScore: number;
  isCityPick: boolean;
  label: string | null;
  active: boolean;
  showRecommendedBadge: boolean;
  expiresAt: Date | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
};

type CreatePlaceCurationInput = {
  placeId: string;
  cityId?: string | null;
  boostScore?: number;
  isCityPick?: boolean;
  showRecommendedBadge?: boolean;
  label?: string | null;
  expiresAt?: Date | null;
  createdById: string;
};

type UpdatePlaceCurationInput = {
  boostScore?: number;
  isCityPick?: boolean;
  showRecommendedBadge?: boolean;
  label?: string | null;
  active?: boolean;
  cityId?: string | null;
  expiresAt?: Date | null;
};

function notExpiredWhere(now = new Date()): Prisma.PlaceCurationWhereInput {
  return {
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

function activeCurationWhere(
  cityId?: string | null,
  now = new Date(),
): Prisma.PlaceCurationWhereInput {
  const base: Prisma.PlaceCurationWhereInput = {
    active: true,
    ...notExpiredWhere(now),
  };

  if (!cityId) {
    return base;
  }

  return {
    ...base,
    cityId,
    place: {
      hiddenFromApp: false,
      OR: [{ cityId }, { cityId: null }],
    },
  };
}

function normalizeGoogleIds(googlePlaceIds: string[]) {
  const ids = new Set<string>();
  for (const googlePlaceId of googlePlaceIds) {
    const normalized = normalizeGooglePlaceId(googlePlaceId);
    if (normalized) {
      ids.add(normalized);
    }
  }
  return [...ids];
}

@Injectable()
export class PlaceCurationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByCity(cityId?: string) {
    const rows = await this.prisma.placeCuration.findMany({
      where: {
        ...(cityId ? { cityId } : {}),
      },
      include: {
        place: true,
        city: true,
      },
      orderBy: [{ isCityPick: "desc" }, { boostScore: "desc" }, { updatedAt: "desc" }],
    });

    return rows.map((row) => ({
      ...this.mapRow(row),
      place: mapPlaceRecord(row.place),
      cityName: row.city?.displayName ?? null,
      isExpired: this.isExpired(row.expiresAt),
    }));
  }

  async listCuratedGoogleIdsForCity(cityId: string) {
    const rows = await this.prisma.placeCuration.findMany({
      where: activeCurationWhere(cityId),
      select: {
        place: {
          select: { sourcePlaceId: true },
        },
      },
    });

    const ids = new Set<string>();
    for (const row of rows) {
      const googlePlaceId = row.place.sourcePlaceId?.trim();
      if (googlePlaceId) {
        ids.add(normalizeGooglePlaceId(googlePlaceId));
      }
    }
    return ids;
  }

  async getRecommendedBadgesByGooglePlaceIds(
    cityId: string | null | undefined,
    googlePlaceIds: string[],
  ) {
    if (googlePlaceIds.length === 0 || !cityId) {
      return new Map<string, string>();
    }

    const rows = await this.prisma.placeCuration.findMany({
      where: {
        ...activeCurationWhere(cityId),
        showRecommendedBadge: true,
        place: { sourcePlaceId: { in: googlePlaceIds } },
      },
      include: { place: true },
      orderBy: [
        { isCityPick: "desc" },
        { boostScore: "desc" },
        { updatedAt: "desc" },
      ],
    });

    const badges = new Map<string, string>();
    for (const row of rows) {
      const googlePlaceId = row.place.sourcePlaceId?.trim();
      if (!googlePlaceId || badges.has(googlePlaceId)) {
        continue;
      }
      badges.set(googlePlaceId, FECA_RECOMMENDED_BADGE_LABEL);
    }

    return badges;
  }

  async listActiveForCity(cityId: string) {
    const rows = await this.prisma.placeCuration.findMany({
      where: activeCurationWhere(cityId),
      include: { place: true },
      orderBy: [{ isCityPick: "desc" }, { boostScore: "desc" }],
    });

    return rows.map((row) => ({
      ...this.mapRow(row),
      place: mapPlaceRecord(row.place),
    }));
  }

  async getActiveBoostsForGooglePlaceIds(
    googlePlaceIds: string[],
    cityId?: string | null,
  ) {
    if (googlePlaceIds.length === 0 || !cityId) {
      return {
        boosts: new Map<string, number>(),
        cityPickGoogleIds: new Set<string>(),
        curatedGoogleIds: new Set<string>(),
      };
    }

    const normalizedIds = normalizeGoogleIds(googlePlaceIds);
    const rows = await this.prisma.placeCuration.findMany({
      where: {
        ...activeCurationWhere(cityId),
        place: { sourcePlaceId: { in: normalizedIds } },
      },
      include: { place: true },
    });

    const boosts = new Map<string, number>();
    const cityPickGoogleIds = new Set<string>();
    const curatedGoogleIds = new Set<string>();

    for (const row of rows) {
      const googlePlaceId = row.place.sourcePlaceId?.trim();
      if (!googlePlaceId) {
        continue;
      }
      const normalizedId = normalizeGooglePlaceId(googlePlaceId);

      curatedGoogleIds.add(normalizedId);

      if (row.boostScore > 0) {
        boosts.set(
          normalizedId,
          Math.max(boosts.get(normalizedId) ?? 0, row.boostScore),
        );
      }
      if (row.isCityPick) {
        cityPickGoogleIds.add(normalizedId);
      }
    }

    return { boosts, cityPickGoogleIds, curatedGoogleIds };
  }

  async listCityPickPlacesInRadius(
    cityId: string,
    lat: number,
    lng: number,
    radiusMeters: number,
    limit = 10,
  ) {
    const bounds = geoBoundsFromRadiusMeters(lat, lng, radiusMeters);
    const rows = await this.prisma.placeCuration.findMany({
      where: {
        ...activeCurationWhere(cityId),
        isCityPick: true,
        place: {
          lat: { not: null, gte: bounds.minLat, lte: bounds.maxLat },
          lng: { not: null, gte: bounds.minLng, lte: bounds.maxLng },
        },
      },
      include: { place: true },
      take: nearbySqlTakeLimit(limit, 80),
    });

    const withCoords = rows.filter(
      (
        row,
      ): row is typeof row & {
        place: typeof row.place & { lat: number; lng: number };
      } => row.place.lat != null && row.place.lng != null,
    );

    const ranked = filterSortByDistance(
      lat,
      lng,
      withCoords.map((row) => ({
        row,
        lat: row.place.lat,
        lng: row.place.lng,
      })),
      radiusMeters,
      limit,
    );

    return ranked.map(({ row, distanceMeters }) => ({
      curation: this.mapRow(row),
      place: mapPlaceRecord(row.place),
      distanceMeters,
    }));
  }

  async create(input: CreatePlaceCurationInput) {
    const row = await this.prisma.placeCuration.create({
      data: {
        placeId: input.placeId,
        cityId: input.cityId ?? null,
        boostScore: Math.min(100, Math.max(0, input.boostScore ?? 0)),
        isCityPick: input.isCityPick ?? false,
        showRecommendedBadge: input.showRecommendedBadge ?? false,
        label: input.label ?? null,
        expiresAt: input.expiresAt ?? null,
        createdById: input.createdById,
      },
      include: { place: true, city: true },
    });

    return {
      ...this.mapRow(row),
      place: mapPlaceRecord(row.place),
      cityName: row.city?.displayName ?? null,
      isExpired: false,
    };
  }

  async update(id: string, input: UpdatePlaceCurationInput) {
    const row = await this.prisma.placeCuration.update({
      where: { id },
      data: {
        ...(input.boostScore != null
          ? { boostScore: Math.min(100, Math.max(0, input.boostScore)) }
          : {}),
        ...(input.isCityPick != null ? { isCityPick: input.isCityPick } : {}),
        ...(input.showRecommendedBadge != null
          ? { showRecommendedBadge: input.showRecommendedBadge }
          : {}),
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.active != null ? { active: input.active } : {}),
        ...(input.cityId !== undefined ? { cityId: input.cityId } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      },
      include: { place: true, city: true },
    });

    return {
      ...this.mapRow(row),
      place: mapPlaceRecord(row.place),
      cityName: row.city?.displayName ?? null,
      isExpired: this.isExpired(row.expiresAt),
    };
  }

  async delete(id: string) {
    await this.prisma.placeCuration.delete({ where: { id } });
  }

  async findById(id: string) {
    const row = await this.prisma.placeCuration.findUnique({
      where: { id },
      include: { place: true, city: true },
    });
    if (!row) {
      return null;
    }
    return {
      ...this.mapRow(row),
      place: mapPlaceRecord(row.place),
      cityName: row.city?.displayName ?? null,
      isExpired: this.isExpired(row.expiresAt),
    };
  }

  private isExpired(expiresAt: Date | null) {
    return expiresAt != null && expiresAt.getTime() <= Date.now();
  }

  private mapRow(row: {
    id: string;
    placeId: string;
    cityId: string | null;
    boostScore: number;
    isCityPick: boolean;
    label: string | null;
    active: boolean;
    showRecommendedBadge: boolean;
    expiresAt: Date | null;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
  }): PlaceCurationRecord {
    return {
      id: row.id,
      placeId: row.placeId,
      cityId: row.cityId,
      boostScore: row.boostScore,
      isCityPick: row.isCityPick,
      label: row.label,
      active: row.active,
      showRecommendedBadge: row.showRecommendedBadge,
      expiresAt: row.expiresAt,
      createdById: row.createdById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
