import type { Place } from "@prisma/client";

import type { SavedPlaceWithRelations, VisitWithRelations } from "./presenter.types";
import { serializeUserPublic } from "./user.presenter";

export function serializePlaceSummary(place: Place) {
  return {
    address: place.address,
    googlePlaceId: place.sourcePlaceId ?? null,
    id: place.id,
    name: place.name,
    photoUrl: place.coverPhotoUrl ?? null,
  };
}

/**
 * Vista no miembro de plan público: evita domicilio fino; usa ciudad/barrio como "zona".
 * Sin googlePlaceId en payload para reducir scraping (listado / preview).
 */
export function serializePlaceSummaryForPublicGroupViewer(place: Place) {
  const area = place.city?.trim();
  return {
    address: area && area.length > 0 ? area : place.name,
    googlePlaceId: null,
    id: place.id,
    name: place.name,
    photoUrl: place.coverPhotoUrl ?? null,
  };
}

export function serializeVisit(visit: VisitWithRelations) {
  return {
    createdAt: visit.createdAt.toISOString(),
    hasParking: visit.hasParking ?? undefined,
    id: visit.id,
    note: visit.note,
    orderedItems: visit.orderedItems ?? undefined,
    petFriendly: visit.petFriendly ?? undefined,
    place: serializePlaceSummary(visit.place),
    placeDetailTags:
      visit.placeDetailTags.length > 0 ? visit.placeDetailTags : undefined,
    photoUrls: visit.photoUrls,
    priceTier: visit.priceTier ?? undefined,
    rating: visit.rating,
    tags: visit.tags,
    user: serializeUserPublic(visit.user),
    visitedAt: formatDateOnly(visit.visitedAt),
    waitLevel: visit.waitLevel ?? undefined,
    wifiQuality: visit.wifiQuality ?? undefined,
    noiseLevel: visit.noiseLevel ?? undefined,
    wouldReturn: visit.wouldReturn ?? undefined,
  };
}

export function serializeSavedPlaceRow(row: SavedPlaceWithRelations) {
  return {
    place: serializePlaceSummary(row.place),
    reason: row.reason ?? "",
    savedAt: row.createdAt.toISOString(),
  };
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}
