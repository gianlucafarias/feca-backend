import { Injectable } from "@nestjs/common";

import type { CityRecord } from "../../types";
import { PrismaService } from "../../database/prisma.service";
import { mapCityRecord } from "./prisma-mappers";

type UpsertCityInput = {
  googlePlaceId: string;
  name: string;
  displayName: string;
  lat?: number;
  lng?: number;
};

@Injectable()
export class CitiesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCityByGooglePlaceId(googlePlaceId: string) {
    const city = await this.prisma.city.findUnique({
      where: { googlePlaceId },
    });

    return city ? mapCityRecord(city) : null;
  }

  async listAll(limit = 80) {
    const cities = await this.prisma.city.findMany({
      orderBy: [{ displayName: "asc" }, { name: "asc" }],
      take: limit,
    });

    return cities.map(mapCityRecord);
  }

  async searchCities(query: string, limit = 5) {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    const cities = await this.prisma.city.findMany({
      where: {
        OR: [
          { name: { contains: normalizedQuery, mode: "insensitive" } },
          { displayName: { contains: normalizedQuery, mode: "insensitive" } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      take: limit,
    });

    return cities.map(mapCityRecord);
  }

  async upsertCity(input: UpsertCityInput): Promise<CityRecord> {
    const city = await this.prisma.city.upsert({
      where: {
        googlePlaceId: input.googlePlaceId,
      },
      update: {
        displayName: input.displayName,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        name: input.name,
      },
      create: {
        displayName: input.displayName,
        googlePlaceId: input.googlePlaceId,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        name: input.name,
      },
    });

    return mapCityRecord(city);
  }
}
