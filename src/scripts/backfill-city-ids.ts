import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "../app.module";
import { PrismaService } from "../database/prisma.service";
import {
  type GoogleCitySummary,
  GooglePlacesClient,
} from "../infrastructure/google-places/google-places.client";
import { CitiesRepository } from "../infrastructure/repositories/cities.repository";

type BackfillReport = {
  completedAt?: string;
  dryRun: boolean;
  places: {
    failed: number;
    processed: number;
    unresolved: number;
    updated: number;
  };
  startedAt: string;
  unresolvedPlaces: Array<{ id: string; reason: string; sourcePlaceId?: string }>;
  unresolvedUsers: Array<{ city?: string; id: string; reason: string }>;
  users: {
    failed: number;
    processed: number;
    unresolved: number;
    updated: number;
  };
};

async function main() {
  const dryRun = !process.argv.includes("--write");
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });

  try {
    const prisma = app.get(PrismaService);
    const google = app.get(GooglePlacesClient);
    const citiesRepository = app.get(CitiesRepository);

    const report: BackfillReport = {
      dryRun,
      startedAt: new Date().toISOString(),
      places: {
        failed: 0,
        processed: 0,
        unresolved: 0,
        updated: 0,
      },
      unresolvedPlaces: [],
      unresolvedUsers: [],
      users: {
        failed: 0,
        processed: 0,
        unresolved: 0,
        updated: 0,
      },
    };

    const places = await prisma.place.findMany({
      where: {
        cityId: null,
      },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        lat: true,
        lng: true,
        sourcePlaceId: true,
      },
    });

    for (const place of places) {
      report.places.processed += 1;

      try {
        let city = await resolveCityForCoordinates(
          google,
          citiesRepository,
          place.lat,
          place.lng,
        );

        if (!city && place.sourcePlaceId) {
          const details = await google.getPlaceDetails(place.sourcePlaceId);
          city = await resolveCityForCoordinates(
            google,
            citiesRepository,
            details.lat,
            details.lng,
          );
        }

        if (!city) {
          report.places.unresolved += 1;
          report.unresolvedPlaces.push({
            id: place.id,
            reason: "no_city_candidate",
            sourcePlaceId: place.sourcePlaceId ?? undefined,
          });
          continue;
        }

        if (!dryRun) {
          await prisma.place.update({
            where: { id: place.id },
            data: {
              cityId: city.id,
            },
          });
        }

        report.places.updated += 1;
      } catch (error) {
        report.places.failed += 1;
        report.unresolvedPlaces.push({
          id: place.id,
          reason: error instanceof Error ? error.message : "unknown_error",
          sourcePlaceId: place.sourcePlaceId ?? undefined,
        });
      }
    }

    const users = await prisma.user.findMany({
      where: {
        cityId: null,
        OR: [{ city: { not: null } }, { lat: { not: null }, lng: { not: null } }],
      },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        city: true,
        id: true,
        lat: true,
        lng: true,
      },
    });

    for (const user of users) {
      report.users.processed += 1;

      try {
        let city = await resolveCityForCoordinates(
          google,
          citiesRepository,
          user.lat,
          user.lng,
        );

        if (!city && user.city) {
          city = await resolveCityForName(
            google,
            citiesRepository,
            user.city,
          );
        }

        if (!city) {
          report.users.unresolved += 1;
          report.unresolvedUsers.push({
            city: user.city ?? undefined,
            id: user.id,
            reason: "no_city_candidate",
          });
          continue;
        }

        if (!dryRun) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              cityId: city.id,
            },
          });
        }

        report.users.updated += 1;
      } catch (error) {
        report.users.failed += 1;
        report.unresolvedUsers.push({
          city: user.city ?? undefined,
          id: user.id,
          reason: error instanceof Error ? error.message : "unknown_error",
        });
      }
    }

    report.completedAt = new Date().toISOString();

    const reportPath = path.resolve(
      __dirname,
      "..",
      "..",
      "prisma",
      "reports",
      "city-backfill-report.json",
    );

    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

    console.log(
      JSON.stringify(
        {
          dryRun,
          places: report.places,
          reportPath,
          unresolvedPlaces: report.unresolvedPlaces.length,
          unresolvedUsers: report.unresolvedUsers.length,
          users: report.users,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

async function resolveCityForCoordinates(
  google: GooglePlacesClient,
  citiesRepository: CitiesRepository,
  lat?: number | null,
  lng?: number | null,
) {
  if (typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }

  const city = await google.reverseGeocodeCity(lat, lng);
  if (!city) {
    return null;
  }

  return upsertCitySummary(citiesRepository, city);
}

async function resolveCityForName(
  google: GooglePlacesClient,
  citiesRepository: CitiesRepository,
  rawCity: string,
) {
  const query = rawCity.trim();
  if (!query) {
    return null;
  }

  const candidates = await google.autocompleteCities({
    limit: 5,
    query,
  });

  const normalizedQuery = normalizeCityName(query);
  const exactMatch =
    candidates.find((candidate) => normalizeCityName(candidate.city) === normalizedQuery) ??
    candidates.find(
      (candidate) =>
        normalizeCityName(candidate.displayName).split(",")[0] === normalizedQuery,
    ) ??
    null;

  if (!exactMatch && candidates.length !== 1) {
    return null;
  }

  return upsertCitySummary(citiesRepository, exactMatch ?? candidates[0]!);
}

function upsertCitySummary(
  citiesRepository: CitiesRepository,
  city: GoogleCitySummary,
) {
  return citiesRepository.upsertCity({
    displayName: city.displayName,
    googlePlaceId: city.cityGooglePlaceId,
    lat: city.lat,
    lng: city.lng,
    name: city.city,
  });
}

function normalizeCityName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

void main();
