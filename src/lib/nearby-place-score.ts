import type { Prisma } from "@prisma/client";

import type { GooglePlaceSummary } from "../infrastructure/google-places/google-places.client";
import { distanceInMeters } from "./geo";
import type { OutingPreferencesV1 } from "./outing-preferences";

const HOME_VARIANTS = new Set([
  "home_nearby",
  "home_open_now",
  "home_friends_liked",
  "home_city",
]);

export function isHomeCarouselVariant(variant?: string) {
  return variant == null || HOME_VARIANTS.has(variant);
}

export function parsePlacePriorities(
  prefs: Prisma.JsonValue | null | undefined,
): OutingPreferencesV1["placePriorities"] {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) {
    return undefined;
  }
  const raw = (prefs as Partial<OutingPreferencesV1>).placePriorities;
  return Array.isArray(raw) && raw.length > 0 ? raw : undefined;
}

export function tasteScoreMultiplier(
  priorities: OutingPreferencesV1["placePriorities"],
): number {
  const top = priorities?.slice(0, 3) ?? [];
  if (top.includes("atmosphere") || top.includes("quiet")) {
    return 1.35;
  }
  return 1;
}

export function distanceScoreMultiplier(
  priorities: OutingPreferencesV1["placePriorities"],
): number {
  const top = priorities?.slice(0, 3) ?? [];
  return top.includes("distance") ? 1.4 : 1;
}

export function buildNearbyPlaceScore(
  input: { lat: number; lng: number },
  place: GooglePlaceSummary,
  index: number,
  placePriorities?: OutingPreferencesV1["placePriorities"],
) {
  const distance =
    Number.isFinite(place.lat) && Number.isFinite(place.lng)
      ? distanceInMeters(input.lat, input.lng, place.lat, place.lng)
      : 5000;

  const distanceMultiplier = distanceScoreMultiplier(placePriorities);

  return (
    180 -
    (distance / 45) * distanceMultiplier +
    (place.rating ?? 0) * 8 +
    (place.openNow ? 34 : 0) -
    index * 0.35
  );
}

export function scorePlacePrioritiesAgainstPlace(
  priorities: OutingPreferencesV1["placePriorities"],
  place: GooglePlaceSummary,
  distanceMeters: number,
): number {
  if (!priorities?.length) {
    return 0;
  }

  const top2 = new Set(priorities.slice(0, 3));
  const types = new Set((place.types ?? []).map((t) => t.toLowerCase()));
  const hasType = (...needles: string[]) =>
    needles.some((needle) =>
      [...types].some((type) => type.includes(needle)),
    );

  let score = 0;

  if (top2.has("food_drink") && hasType("restaurant", "cafe", "bakery", "bar")) {
    score += 18;
  }
  if (top2.has("atmosphere") && (place.rating ?? 0) >= 4.3) {
    score += 16;
  }
  if (top2.has("quiet") && hasType("cafe", "library", "book")) {
    score += 14;
  }
  if (top2.has("service") && (place.userRatingCount ?? 0) >= 50) {
    score += 10;
  }
  if (top2.has("distance") && distanceMeters < 800) {
    score += 16;
  } else if (top2.has("distance") && distanceMeters < 1500) {
    score += 8;
  }

  return score;
}

/** Excluye lugares con señal Google claramente mala en carruseles home. */
export function shouldExcludeLowQualityGooglePlace(place: GooglePlaceSummary) {
  const rating = place.rating;
  const count = place.userRatingCount ?? 0;

  if (rating != null && rating < 3.5) {
    return true;
  }
  if (rating != null && rating < 3.8 && count >= 10) {
    return true;
  }
  return false;
}

export function scoreGoogleQualityPenalty(place: GooglePlaceSummary) {
  const rating = place.rating;
  const count = place.userRatingCount ?? 0;

  if (rating != null && rating < 3.8 && count >= 5) {
    return -25;
  }
  if (count > 0 && count < 15) {
    return -10;
  }
  return 0;
}

export const ADMIN_BOOST_CAP = 45;
export const MAX_FORCED_CITY_PICKS = 2;
/** Máx lugares con curación activa en el top del carrusel home (anti-repetición). */
export const MAX_CURATED_SLOTS_IN_TOP = 5;
export const LIKED_VISIT_AFFINITY_BOOST = 30;
export const SIMILAR_TO_LIKED_BOOST = 20;

export function scaleAdminBoostScore(boostScore: number) {
  if (boostScore <= 0) {
    return 0;
  }
  return Math.min(
    ADMIN_BOOST_CAP,
    Math.round(boostScore * (ADMIN_BOOST_CAP / 100)),
  );
}
