import { createHash } from "node:crypto";

import type {
  FecaPlaceReview,
  GooglePlaceDetailView,
  GooglePlaceSummary,
} from "../infrastructure/google-places/google-places.client";
import { utcHourBucketId } from "../lib/ranking-time-seed";
import type { PlaceRecord } from "../types";
import type { GetNearbyPlacesQueryDto } from "./dto/get-nearby-places.query.dto";

/** Query de nearby/explore con lat/lng ya resueltos (perfil o query). */
export type NearbyQueryResolved = Omit<GetNearbyPlacesQueryDto, "lat" | "lng"> & {
  lat: number;
  lng: number;
};

export function mergeGooglePlaceSummaries(
  existing: GooglePlaceSummary,
  incoming: GooglePlaceSummary,
): GooglePlaceSummary {
  return {
    ...existing,
    ...incoming,
    photoUrl: existing.photoUrl ?? incoming.photoUrl,
    rating: existing.rating ?? incoming.rating,
    userRatingCount: existing.userRatingCount ?? incoming.userRatingCount,
    openNow: existing.openNow ?? incoming.openNow,
    openingWeekdayLines:
      existing.openingWeekdayLines ?? incoming.openingWeekdayLines,
    types: existing.types.length > 0 ? existing.types : incoming.types,
    primaryType: existing.primaryType ?? incoming.primaryType,
  };
}

export function upsertNearbyCandidate(
  byId: Map<string, GooglePlaceSummary>,
  place: GooglePlaceSummary,
) {
  if (!place.googlePlaceId) {
    return;
  }
  const previous = byId.get(place.googlePlaceId);
  byId.set(
    place.googlePlaceId,
    previous ? mergeGooglePlaceSummaries(previous, place) : place,
  );
}

export function mergeGooglePlacesById(places: GooglePlaceSummary[]) {
  const byId = new Map<string, GooglePlaceSummary>();
  for (const place of places) {
    if (!place.googlePlaceId || byId.has(place.googlePlaceId)) {
      continue;
    }
    byId.set(place.googlePlaceId, place);
  }
  return [...byId.values()];
}

export function mapStoredPlaceToNearby(
  place: PlaceRecord,
  query?: string,
): GooglePlaceSummary {
  return {
    googlePlaceId: place.sourcePlaceId ?? place.id,
    name: place.name,
    address: place.address,
    lat: place.lat ?? 0,
    lng: place.lng ?? 0,
    googleMapsUri: place.googleMapsUri,
    rating: place.ratingExternal,
    userRatingCount: place.ratingCountExternal,
    types: place.categories,
    primaryType: place.categories[0],
    photoUrl: place.coverPhotoUrl,
    // openNow solo viene de Google en tiempo real; en DB guardamos horarios estáticos.
    openNow: undefined,
    openingWeekdayLines:
      place.openingHours && place.openingHours.length > 0
        ? place.openingHours
        : undefined,
  };
}

export function mapStoredPlaceToDetail(
  place: PlaceRecord,
  googlePlaceId: string,
  fecaReviews: FecaPlaceReview[],
): GooglePlaceDetailView {
  const summary = mapStoredPlaceToNearby(place);

  return {
    ...summary,
    googlePlaceId,
    editorialSummary: undefined,
    fecaReviews,
    openingHours: place.openingHours,
    photos: place.coverPhotoUrl ? [place.coverPhotoUrl] : [],
    reviews: undefined,
  };
}

export function mapVisitToFecaReview(visit: {
  id: string;
  note: string;
  rating: number;
  visitedAt: Date;
  user: {
    displayName: string;
    username: string;
  };
}): FecaPlaceReview {
  return {
    id: visit.id,
    userDisplayName: visit.user.displayName || visit.user.username,
    rating: visit.rating,
    note: visit.note,
    visitedAt: visit.visitedAt.toISOString().slice(0, 10),
    relativeTime: formatRelativeTimeEs(visit.visitedAt),
  };
}

export function formatRelativeTimeEs(date: Date) {
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / (60 * 1000));
  const absMinutes = Math.abs(diffMinutes);
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

  if (absMinutes < 60) {
    return rtf.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) {
    return rtf.format(diffDays, "day");
  }

  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) {
    return rtf.format(diffMonths, "month");
  }

  const diffYears = Math.round(diffMonths / 12);
  return rtf.format(diffYears, "year");
}

export function nearbyPoolRankSlotKey(
  _now: Date,
  type: NearbyQueryResolved["type"] | undefined,
): string {
  return type ? "typed" : "dist";
}

export function shuffleSeed(
  userId: string,
  resolved: Pick<NearbyQueryResolved, "lat" | "lng" | "type">,
  now: Date,
  tag: string,
): string {
  return `${userId}:${utcHourBucketId(now)}:${resolved.lat.toFixed(3)}:${resolved.lng.toFixed(3)}:${resolved.type ?? "mix"}:${tag}`;
}

export function stableShuffleGooglePlaces(
  items: GooglePlaceSummary[],
  seed: string,
): GooglePlaceSummary[] {
  if (items.length <= 1) {
    return [...items];
  }
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const id = arr[i]!.googlePlaceId ?? `${i}`;
    const h = createHash("sha256")
      .update(`${seed}:${id}:${i}`)
      .digest("hex")
      .slice(0, 8);
    const j = Number.parseInt(h, 16) % (i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

type CityCurationRow = {
  boostScore: number;
  isCityPick: boolean;
  showRecommendedBadge: boolean;
  updatedAt: Date;
  place: PlaceRecord;
};

export function mergeCityCurationsIntoNearbyCandidates(
  candidates: GooglePlaceSummary[],
  curationRows: CityCurationRow[],
) {
  const byId = new Map<string, GooglePlaceSummary>();
  for (const place of candidates) {
    if (!place.googlePlaceId) {
      continue;
    }
    byId.set(normalizeGooglePlaceId(place.googlePlaceId), {
      ...place,
      googlePlaceId: normalizeGooglePlaceId(place.googlePlaceId),
    });
  }

  for (const row of curationRows) {
    const sourcePlaceId = row.place.sourcePlaceId?.trim();
    if (!sourcePlaceId) {
      continue;
    }

    const shouldInject =
      row.isCityPick || row.boostScore > 0 || row.showRecommendedBadge;
    if (!shouldInject) {
      continue;
    }

    const googlePlaceId = normalizeGooglePlaceId(sourcePlaceId);

    upsertNearbyCandidate(byId, {
      ...mapStoredPlaceToNearby(row.place),
      googlePlaceId,
    });
  }

  return [...byId.values()];
}

export function prependAdminCuratedPlaces(
  ranked: GooglePlaceSummary[],
  curationRows: CityCurationRow[],
  options: {
    limit: number;
  },
) {
  const prioritized = curationRows
    .filter(
      (row) =>
        row.isCityPick || row.boostScore > 0 || row.showRecommendedBadge,
    )
    .sort(
      (a, b) =>
        Number(b.isCityPick) - Number(a.isCityPick) ||
        b.boostScore - a.boostScore ||
        b.updatedAt.getTime() - a.updatedAt.getTime(),
    );

  const forced: GooglePlaceSummary[] = [];
  const forcedIds = new Set<string>();

  for (const row of prioritized) {
    if (forced.length >= options.limit) {
      break;
    }
    const sourcePlaceId = row.place.sourcePlaceId?.trim();
    if (!sourcePlaceId) {
      continue;
    }

    const place = {
      ...mapStoredPlaceToNearby(row.place),
      googlePlaceId: normalizeGooglePlaceId(sourcePlaceId),
    };

    if (forcedIds.has(place.googlePlaceId)) {
      continue;
    }

    forced.push(place);
    forcedIds.add(place.googlePlaceId);
  }

  const rest = ranked.filter((place) => !forcedIds.has(place.googlePlaceId));
  return [...forced, ...rest].slice(0, options.limit);
}

export function normalizeGooglePlaceId(value: string) {
  const trimmed = value.trim();
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed;
  }
  const resourceNameMatch = decoded.match(/(?:^|\/)places\/([^/?#]+)/);
  return resourceNameMatch?.[1] ?? decoded;
}
