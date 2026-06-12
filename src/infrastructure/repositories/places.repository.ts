import { Injectable } from "@nestjs/common";
import { PlaceSource, type Prisma } from "@prisma/client";

import {
  filterSortByDistance,
  geoBoundsFromRadiusMeters,
  nearbySqlTakeLimit,
} from "../../lib/geo-bounds";
import type { PlaceRecord } from "../../types";
import { PrismaService } from "../../database/prisma.service";
import { mapPlaceRecord } from "./prisma-mappers";

type UpsertPlaceInput = Omit<PlaceRecord, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
};

type CreateManualPlaceInput = {
  name: string;
  address: string;
  city: string;
  cityId: string;
  lat?: number;
  lng?: number;
};

const visibleInAppWhere = { hiddenFromApp: false } as const;

const DEFAULT_NEARBY_RADIUS_METERS = 5000;

@Injectable()
export class PlacesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getHiddenGooglePlaceIds() {
    const rows = await this.prisma.place.findMany({
      where: {
        hiddenFromApp: true,
        sourcePlaceId: { not: null },
      },
      select: { sourcePlaceId: true },
    });

    const ids = new Set<string>();
    for (const row of rows) {
      const googlePlaceId = row.sourcePlaceId?.trim();
      if (googlePlaceId) {
        ids.add(googlePlaceId);
      }
    }
    return ids;
  }

  async setHiddenFromApp(placeId: string, hiddenFromApp: boolean) {
    const place = await this.prisma.place.update({
      where: { id: placeId },
      data: { hiddenFromApp },
    });
    return mapPlaceRecord(place);
  }

  async searchPlaces(query: string, city?: string, limit = 5) {
    const normalizedQuery = query.trim();

    const places = await this.prisma.place.findMany({
      where: {
        ...visibleInAppWhere,
        ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
        ...(normalizedQuery
          ? {
              OR: [
                { name: { contains: normalizedQuery, mode: "insensitive" } },
                { address: { contains: normalizedQuery, mode: "insensitive" } },
                { city: { contains: normalizedQuery, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      take: limit,
    });

    return places.map(mapPlaceRecord);
  }

  async listNearbyPlacesWithPositiveVisits(
    lat: number,
    lng: number,
    radiusMeters: number,
    limit = 20,
  ): Promise<Array<PlaceRecord & { distanceMeters: number }>> {
    const bounds = geoBoundsFromRadiusMeters(lat, lng, radiusMeters);
    const places = await this.prisma.place.findMany({
      where: this.buildNearbyGeoWhere(bounds, {
        visits: {
          some: {
            OR: [{ wouldReturn: "yes" }, { rating: { gte: 4 } }],
          },
        },
      }),
      take: nearbySqlTakeLimit(limit),
      orderBy: { updatedAt: "desc" },
    });

    return filterSortByDistance(
      lat,
      lng,
      places
        .filter(
          (place): place is typeof place & { lat: number; lng: number } =>
            place.lat != null && place.lng != null,
        )
        .map((place) => ({
          ...mapPlaceRecord(place),
          lat: place.lat,
          lng: place.lng,
        })),
      radiusMeters,
      limit,
    );
  }

  async listNearbyPlacesMatchingCategories(
    lat: number,
    lng: number,
    categories: string[],
    excludeGooglePlaceIds: string[],
    radiusMeters: number,
    limit = 20,
  ): Promise<Array<PlaceRecord & { distanceMeters: number }>> {
    const normalized = Array.from(
      new Set(categories.map((c) => c.trim().toLowerCase()).filter(Boolean)),
    ).slice(0, 12);

    if (normalized.length === 0) {
      return [];
    }

    const bounds = geoBoundsFromRadiusMeters(lat, lng, radiusMeters);
    const places = await this.prisma.place.findMany({
      where: this.buildNearbyGeoWhere(bounds, {
        ...(excludeGooglePlaceIds.length > 0
          ? { sourcePlaceId: { notIn: excludeGooglePlaceIds } }
          : {}),
        OR: normalized.map((category) => ({
          categories: { has: category },
        })),
      }),
      take: nearbySqlTakeLimit(limit),
      orderBy: { updatedAt: "desc" },
    });

    return filterSortByDistance(
      lat,
      lng,
      places
        .filter(
          (place): place is typeof place & { lat: number; lng: number } =>
            place.lat != null && place.lng != null,
        )
        .map((place) => ({
          ...mapPlaceRecord(place),
          lat: place.lat,
          lng: place.lng,
        })),
      radiusMeters,
      limit,
    );
  }

  async getFecaQualityByGooglePlaceIds(googlePlaceIds: string[]) {
    if (googlePlaceIds.length === 0) {
      return new Map<
        string,
        {
          visitCount: number;
          avgRating: number | null;
          wouldReturnYesCount: number;
          wouldReturnNoCount: number;
        }
      >();
    }

    const places = await this.prisma.place.findMany({
      where: { sourcePlaceId: { in: googlePlaceIds } },
      select: {
        sourcePlaceId: true,
        visits: {
          select: {
            rating: true,
            wouldReturn: true,
          },
        },
      },
    });

    const out = new Map<
      string,
      {
        visitCount: number;
        avgRating: number | null;
        wouldReturnYesCount: number;
        wouldReturnNoCount: number;
      }
    >();

    for (const place of places) {
      if (!place.sourcePlaceId) {
        continue;
      }

      const visitCount = place.visits.length;
      const avgRating =
        visitCount > 0
          ? place.visits.reduce((sum, visit) => sum + visit.rating, 0) /
            visitCount
          : null;
      const wouldReturnYesCount = place.visits.filter(
        (visit) => visit.wouldReturn === "yes",
      ).length;
      const wouldReturnNoCount = place.visits.filter(
        (visit) => visit.wouldReturn === "no",
      ).length;

      out.set(place.sourcePlaceId, {
        visitCount,
        avgRating,
        wouldReturnYesCount,
        wouldReturnNoCount,
      });
    }

    return out;
  }

  async listNearbyPlaces(
    lat: number,
    lng: number,
    city?: string,
    limit = 10,
    radiusMeters = DEFAULT_NEARBY_RADIUS_METERS,
  ): Promise<Array<PlaceRecord & { distanceMeters: number }>> {
    const bounds = geoBoundsFromRadiusMeters(lat, lng, radiusMeters);
    const places = await this.prisma.place.findMany({
      where: this.buildNearbyGeoWhere(bounds, {
        ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
      }),
      take: nearbySqlTakeLimit(limit),
      orderBy: { updatedAt: "desc" },
    });

    return filterSortByDistance(
      lat,
      lng,
      places
        .filter(
          (place): place is typeof place & { lat: number; lng: number } =>
            place.lat != null && place.lng != null,
        )
        .map((place) => ({
          ...mapPlaceRecord(place),
          lat: place.lat,
          lng: place.lng,
        })),
      radiusMeters,
      limit,
    );
  }

  async getPlaceById(id: string) {
    const place = await this.prisma.place.findUnique({
      where: { id },
    });

    return place ? mapPlaceRecord(place) : null;
  }

  async getPlaceBySource(source: PlaceRecord["source"], sourcePlaceId: string) {
    const place = await this.prisma.place.findFirst({
      where: {
        source: source as PlaceSource,
        sourcePlaceId,
      },
    });

    return place ? mapPlaceRecord(place) : null;
  }

  async listFecaReviews(placeId: string, limit = 20) {
    return this.prisma.visit.findMany({
      where: { placeId },
      include: {
        user: true,
      },
      orderBy: [{ visitedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
  }

  async upsertPlace(input: UpsertPlaceInput) {
    const existing =
      input.sourcePlaceId
        ? await this.prisma.place.findFirst({
            where: {
              source: input.source as PlaceSource,
              sourcePlaceId: input.sourcePlaceId,
            },
          })
        : input.id
          ? await this.prisma.place.findUnique({ where: { id: input.id } })
          : null;

    const data = {
      source: input.source as PlaceSource,
      sourcePlaceId: input.sourcePlaceId ?? null,
      name: input.name,
      address: input.address,
      city: input.city,
      cityId: input.cityId ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      categories: input.categories,
      ratingExternal: input.ratingExternal ?? null,
      ratingCountExternal: input.ratingCountExternal ?? null,
      phone: input.phone ?? null,
      website: input.website ?? null,
      openingHours: input.openingHours ?? [],
      googleMapsUri: input.googleMapsUri ?? null,
      coverPhotoRef: input.coverPhotoRef ?? null,
      coverPhotoUrl: input.coverPhotoUrl ?? null,
      lastSyncedAt: input.lastSyncedAt ? new Date(input.lastSyncedAt) : null,
    };

    const place = existing
      ? await this.prisma.place.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.place.create({
          data: {
            ...data,
            ...(input.id ? { id: input.id } : {}),
          },
        });

    return mapPlaceRecord(place);
  }

  async createManualPlace(input: CreateManualPlaceInput) {
    return this.upsertPlace({
      source: "manual",
      name: input.name,
      address: input.address,
      city: input.city,
      cityId: input.cityId,
      lat: input.lat,
      lng: input.lng,
      categories: [],
      openingHours: [],
    });
  }

  async patchPlaceCity(placeId: string, cityId: string, city: string) {
    const place = await this.prisma.place.update({
      where: { id: placeId },
      data: { cityId, city },
    });
    return mapPlaceRecord(place);
  }

  private buildNearbyGeoWhere(
    bounds: ReturnType<typeof geoBoundsFromRadiusMeters>,
    extra: Prisma.PlaceWhereInput = {},
  ): Prisma.PlaceWhereInput {
    return {
      ...visibleInAppWhere,
      lat: { not: null, gte: bounds.minLat, lte: bounds.maxLat },
      lng: { not: null, gte: bounds.minLng, lte: bounds.maxLng },
      ...extra,
    };
  }
}
