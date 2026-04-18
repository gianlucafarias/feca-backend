import { Injectable } from "@nestjs/common";
import { PlaceSource } from "@prisma/client";

import { distanceInMeters } from "../../lib/geo";
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

@Injectable()
export class PlacesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async searchPlaces(query: string, city?: string, limit = 5) {
    const normalizedQuery = query.trim();

    const places = await this.prisma.place.findMany({
      where: {
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

  async listNearbyPlaces(
    lat: number,
    lng: number,
    city?: string,
    limit = 10,
  ): Promise<Array<PlaceRecord & { distanceMeters: number }>> {
    const places = await this.prisma.place.findMany({
      where: {
        lat: { not: null },
        lng: { not: null },
        ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
      },
      take: 200,
      orderBy: { updatedAt: "desc" },
    });

    return places
      .map((place) => ({
        ...mapPlaceRecord(place),
        distanceMeters: distanceInMeters(lat, lng, place.lat!, place.lng!),
      }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, limit);
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
}
