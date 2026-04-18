import type { City, Place, Visit } from "@prisma/client";

import type { CityRecord, PlaceRecord, VisitRecord } from "../../types";

export function mapCityRecord(city: City): CityRecord {
  return {
    id: city.id,
    googlePlaceId: city.googlePlaceId,
    name: city.name,
    displayName: city.displayName,
    lat: city.lat ?? undefined,
    lng: city.lng ?? undefined,
    createdAt: city.createdAt.toISOString(),
    updatedAt: city.updatedAt.toISOString(),
  };
}

export function mapPlaceRecord(place: Place): PlaceRecord {
  return {
    id: place.id,
    source: place.source,
    sourcePlaceId: place.sourcePlaceId ?? undefined,
    name: place.name,
    address: place.address,
    city: place.city,
    cityId: place.cityId ?? undefined,
    lat: place.lat ?? undefined,
    lng: place.lng ?? undefined,
    categories: place.categories,
    ratingExternal: place.ratingExternal ?? undefined,
    ratingCountExternal: place.ratingCountExternal ?? undefined,
    phone: place.phone ?? undefined,
    website: place.website ?? undefined,
    openingHours: place.openingHours,
    googleMapsUri: place.googleMapsUri ?? undefined,
    coverPhotoRef: place.coverPhotoRef ?? undefined,
    coverPhotoUrl: place.coverPhotoUrl ?? undefined,
    lastSyncedAt: place.lastSyncedAt?.toISOString(),
    createdAt: place.createdAt.toISOString(),
    updatedAt: place.updatedAt.toISOString(),
  };
}

export function mapVisitRecord(visit: Visit): VisitRecord {
  return {
    id: visit.id,
    placeId: visit.placeId,
    userId: visit.userId,
    rating: visit.rating,
    note: visit.note,
    tags: visit.tags,
    visitedAt: visit.visitedAt.toISOString().slice(0, 10),
    createdAt: visit.createdAt.toISOString(),
  };
}
