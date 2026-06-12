import type { Prisma } from "@prisma/client";

import type { GooglePlaceSummary } from "../infrastructure/google-places/google-places.client";
import type { ExploreIntent } from "../places/explore-context";
import { rankCandidatesWithRotation } from "./dynamic-ranking";
import { distanceInMeters } from "./geo";
import { scoreOutingAgainstIntent } from "./outing-preferences";
import {
  buildNearbyPlaceScore,
  isHomeCarouselVariant,
  LIKED_VISIT_AFFINITY_BOOST,
  MAX_CURATED_SLOTS_IN_TOP,
  MAX_FORCED_CITY_PICKS,
  parsePlacePriorities,
  scaleAdminBoostScore,
  scoreGoogleQualityPenalty,
  scorePlacePrioritiesAgainstPlace,
  shouldExcludeLowQualityGooglePlace,
  SIMILAR_TO_LIKED_BOOST,
  tasteScoreMultiplier,
} from "./nearby-place-score";
import {
  scoreFecaPlaceQuality,
  shouldExcludeByFecaQuality,
  type FecaPlaceQualityStats,
} from "./score-feca-place-quality";
import { scoreExploreIntent } from "./explore-intent-score";
import {
  scoreCategoryAffinityAgainstPlace,
  scoreTasteAgainstPlace,
} from "./taste-place-score";
import { utcHourBucketId, utcWeekBucketId } from "./ranking-time-seed";

export type NearbyRankingInput = {
  lat: number;
  lng: number;
  limit: number;
  type?: "cafe" | "restaurant";
  variant?:
    | "home_city"
    | "home_network"
    | "home_nearby"
    | "home_open_now"
    | "home_friends_liked"
    | "onboarding_past";
  rotate?: number;
};

const ONBOARDING_PAST_TASTE_BOOST = 2.4;
const ONBOARDING_PAST_PRIORITY_BOOST = 1.9;
const ONBOARDING_PAST_OUTING_BOOST = 1.6;

type ScoreComponentBreakdown = {
  distance: number;
  taste: number;
  importedAffinity: number;
  visitedAffinity: number;
  visitedPenalty: number;
  outing: number;
  priorities: number;
  googleQuality: number;
  fecaQuality: number;
  network: number;
  adminBoost: number;
  likedVisit: number;
  similarToLiked: number;
};

export type NearbyScoreBreakdown = ScoreComponentBreakdown & {
  googlePlaceId: string;
  name: string;
  baseScore: number;
  jitter: number;
  finalScore: number;
};

export type NearbyRankingContext = {
  tastePreferenceIds: string[];
  importedPlaceCategoryIds: string[];
  likedVisitedPlaceCategoryIds: string[];
  dislikedVisitedPlaceCategoryIds: string[];
  outingPreferences: Prisma.JsonValue | null;
  inferredIntent: ExploreIntent;
  /** Si viene de explore/context, usa scoring por intent explícito. */
  explicitExploreIntent?: ExploreIntent;
  likedNearbyGooglePlaceIds: Set<string>;
  fecaQualityByGoogleId: Map<string, FecaPlaceQualityStats>;
  adminBoostByGoogleId: Map<string, number>;
  curatedGoogleIds: Set<string>;
  cityPickPlaces: GooglePlaceSummary[];
  networkBoostByGoogleId?: Map<string, number>;
  debugScores?: boolean;
};

function networkBoostScoreForVariant(
  variant: NearbyRankingInput["variant"],
  rawBoost: number,
): number {
  if (variant === "home_network") {
    return Math.min(56, rawBoost);
  }
  if (variant === "home_friends_liked") {
    return Math.min(72, rawBoost * 2.45 + 6);
  }
  return 0;
}

function placeVarietyKey(place: GooglePlaceSummary): string {
  const t = (place.primaryType ?? place.types?.[0] ?? "place").toLowerCase();
  return t.includes("restaurant")
    ? "restaurant"
    : t.includes("cafe")
      ? "cafe"
      : t;
}

function diversifyTopPlacesByCategory(
  rankedOrdered: GooglePlaceSummary[],
  limit: number,
): GooglePlaceSummary[] {
  if (rankedOrdered.length <= limit) {
    return rankedOrdered;
  }
  const pool = [...rankedOrdered];
  const out: GooglePlaceSummary[] = [];
  while (out.length < limit && pool.length) {
    const prevKey =
      out.length > 0 ? placeVarietyKey(out[out.length - 1]!) : null;
    const idx =
      prevKey == null
        ? 0
        : pool.findIndex((p) => placeVarietyKey(p) !== prevKey);
    if (idx === -1) {
      out.push(pool.shift()!);
    } else {
      out.push(pool.splice(idx, 1)[0]!);
    }
  }
  return out;
}

function buildPlacesRankingSeed(
  userId: string,
  scope: string,
  lat: number,
  lng: number,
  type: string,
  variant?: string,
  rotate?: number,
) {
  const v = variant?.trim() ? variant : "";
  const week = utcWeekBucketId(new Date());
  const hour = utcHourBucketId(new Date());
  const r =
    rotate != null && Number.isFinite(rotate) && rotate > 0
      ? utcHourBucketId(new Date(rotate))
      : "";
  return `${userId}:${scope}:${type}:${v}:${week}:${hour}:${lat.toFixed(2)}:${lng.toFixed(2)}:${r}`;
}

function isSimilarToLikedCategories(
  place: GooglePlaceSummary,
  likedCategories: string[],
): boolean {
  if (likedCategories.length === 0) {
    return false;
  }
  const candidate = (place.types ?? []).map((c) => c.toLowerCase());
  return likedCategories.some((liked) =>
    candidate.some(
      (type) =>
        type === liked || type.includes(liked) || liked.includes(type),
    ),
  );
}

function buildPinnedCurationPlaces(
  cityPicks: GooglePlaceSummary[],
  candidates: GooglePlaceSummary[],
  adminBoostByGoogleId: Map<string, number>,
) {
  const pinned: GooglePlaceSummary[] = [];
  const pinnedIds = new Set<string>();

  for (const place of cityPicks) {
    if (pinned.length >= MAX_FORCED_CITY_PICKS) {
      break;
    }
    if (pinnedIds.has(place.googlePlaceId)) {
      continue;
    }
    pinned.push(place);
    pinnedIds.add(place.googlePlaceId);
  }

  const boostedCandidates = candidates
    .filter((place) => (adminBoostByGoogleId.get(place.googlePlaceId) ?? 0) > 0)
    .sort(
      (a, b) =>
        (adminBoostByGoogleId.get(b.googlePlaceId) ?? 0) -
          (adminBoostByGoogleId.get(a.googlePlaceId) ?? 0) ||
        a.googlePlaceId.localeCompare(b.googlePlaceId),
    );

  for (const place of boostedCandidates) {
    if (pinned.length >= MAX_FORCED_CITY_PICKS) {
      break;
    }
    if (pinnedIds.has(place.googlePlaceId)) {
      continue;
    }
    pinned.push(place);
    pinnedIds.add(place.googlePlaceId);
  }

  return pinned;
}

function applyCityPickSlots(
  ranked: GooglePlaceSummary[],
  cityPicks: GooglePlaceSummary[],
  limit: number,
): GooglePlaceSummary[] {
  if (cityPicks.length === 0) {
    return ranked.slice(0, limit);
  }

  const forced = cityPicks.slice(0, MAX_FORCED_CITY_PICKS);
  const forcedIds = new Set(forced.map((p) => p.googlePlaceId));
  const rest = ranked.filter((p) => !forcedIds.has(p.googlePlaceId));
  return [...forced, ...rest].slice(0, limit);
}

/** Evita que el carrusel sea solo picks curados: tope de slots con curación activa. */
function applyCuratedSlotCap(
  ordered: GooglePlaceSummary[],
  curatedIds: Set<string>,
  limit: number,
  boostedGoogleIds: Set<string>,
): GooglePlaceSummary[] {
  if (curatedIds.size === 0) {
    return ordered.slice(0, limit);
  }

  const result: GooglePlaceSummary[] = [];
  const used = new Set<string>();
  let curatedCount = 0;

  for (const place of ordered) {
    if (result.length >= limit) {
      break;
    }
    if (used.has(place.googlePlaceId)) {
      continue;
    }
    const isCurated = curatedIds.has(place.googlePlaceId);
    const isBoosted = boostedGoogleIds.has(place.googlePlaceId);
    if (isCurated && !isBoosted && curatedCount >= MAX_CURATED_SLOTS_IN_TOP) {
      continue;
    }
    if (isCurated) {
      curatedCount += 1;
    }
    result.push(place);
    used.add(place.googlePlaceId);
  }

  for (const place of ordered) {
    if (result.length >= limit) {
      break;
    }
    if (used.has(place.googlePlaceId)) {
      continue;
    }
    if (curatedIds.has(place.googlePlaceId)) {
      continue;
    }
    result.push(place);
    used.add(place.googlePlaceId);
  }

  return result;
}

export function rankNearbyPlaceResults(
  userId: string,
  input: NearbyRankingInput,
  places: GooglePlaceSummary[],
  context: NearbyRankingContext,
): { places: GooglePlaceSummary[]; debugScores?: NearbyScoreBreakdown[] } {
  const variant = input.variant;
  const useNetworkInRank =
    variant === "home_network" || variant === "home_friends_liked";
  const onboardingPast = variant === "onboarding_past";
  const homeMix =
    !useNetworkInRank &&
    (variant === undefined ||
      variant === "home_city" ||
      variant === "home_nearby" ||
      variant === "home_open_now" ||
      onboardingPast);
  const placePriorities = parsePlacePriorities(context.outingPreferences);
  const tasteMultiplier = tasteScoreMultiplier(placePriorities);
  const hasPersonalization =
    context.tastePreferenceIds.length > 0 ||
    (placePriorities?.length ?? 0) > 0 ||
    context.likedVisitedPlaceCategoryIds.length > 0 ||
    context.likedNearbyGooglePlaceIds.size > 0 ||
    context.importedPlaceCategoryIds.length > 0;
  const scoringIntent =
    context.explicitExploreIntent ?? context.inferredIntent;

  const protectedGoogleIds = new Set<string>([
    ...context.curatedGoogleIds,
    ...context.adminBoostByGoogleId.keys(),
  ]);

  let work = places;
  if (homeMix) {
    work = places.filter((place) => {
      if (protectedGoogleIds.has(place.googlePlaceId)) {
        return true;
      }
      const feca = context.fecaQualityByGoogleId.get(place.googlePlaceId);
      if (shouldExcludeByFecaQuality(feca)) {
        return false;
      }
      return !shouldExcludeLowQualityGooglePlace(place);
    });
  }

  if (work.length === 0) {
    return { places: [] };
  }

  const topWindow = Math.min(
    work.length,
    homeMix ? Math.max(input.limit * 3, 21) : Math.max(input.limit * 4, 20),
  );

  const breakdownById = new Map<string, ScoreComponentBreakdown>();

  const ranked = rankCandidatesWithRotation(
    work.map((place, index) => {
      const distance =
        Number.isFinite(place.lat) && Number.isFinite(place.lng)
          ? distanceInMeters(input.lat, input.lng, place.lat, place.lng)
          : 5000;
      const rawBoost = context.networkBoostByGoogleId?.get(place.googlePlaceId) ?? 0;
      const taste = Math.round(
        scoreTasteAgainstPlace(
          context.tastePreferenceIds,
          place.types ?? [],
          scoringIntent,
        ) *
          tasteMultiplier *
          (onboardingPast ? ONBOARDING_PAST_TASTE_BOOST : 1),
      );
      const importedAffinity = scoreCategoryAffinityAgainstPlace(
        context.importedPlaceCategoryIds,
        place.types ?? [],
      );
      const visitedAffinity = Math.round(
        scoreCategoryAffinityAgainstPlace(
          context.likedVisitedPlaceCategoryIds,
          place.types ?? [],
        ) * 1.5,
      );
      const visitedPenalty = Math.round(
        scoreCategoryAffinityAgainstPlace(
          context.dislikedVisitedPlaceCategoryIds,
          place.types ?? [],
        ) * 1.6,
      );
      const outing = Math.round(
        scoreOutingAgainstIntent(scoringIntent, context.outingPreferences) *
          (onboardingPast ? ONBOARDING_PAST_OUTING_BOOST : 1),
      );
      const priorities = Math.round(
        scorePlacePrioritiesAgainstPlace(placePriorities, place, distance) *
          (onboardingPast ? ONBOARDING_PAST_PRIORITY_BOOST : 1),
      );
      const googleQuality = homeMix ? scoreGoogleQualityPenalty(place) : 0;
      const fecaQuality = scoreFecaPlaceQuality(
        context.fecaQualityByGoogleId.get(place.googlePlaceId),
      );
      const network = useNetworkInRank
        ? networkBoostScoreForVariant(variant, rawBoost)
        : variant === "home_nearby" || variant === "home_open_now"
          ? Math.min(18, Math.round(rawBoost * 0.35))
          : 0;
      const adminBoost = scaleAdminBoostScore(
        context.adminBoostByGoogleId.get(place.googlePlaceId) ?? 0,
      );
      const likedVisit = context.likedNearbyGooglePlaceIds.has(
        place.googlePlaceId,
      )
        ? LIKED_VISIT_AFFINITY_BOOST
        : 0;
      const similarToLiked =
        likedVisit === 0 &&
        isSimilarToLikedCategories(
          place,
          context.likedVisitedPlaceCategoryIds,
        )
          ? SIMILAR_TO_LIKED_BOOST
          : 0;

      const distanceBase = context.explicitExploreIntent
        ? scoreExploreIntent(context.explicitExploreIntent, place, distance)
        : buildNearbyPlaceScore(input, place, 0, placePriorities);

      const baseScore =
        distanceBase +
        taste +
        importedAffinity +
        visitedAffinity -
        visitedPenalty +
        outing +
        priorities +
        googleQuality +
        fecaQuality +
        network +
        adminBoost +
        likedVisit +
        similarToLiked;

      breakdownById.set(place.googlePlaceId, {
        distance,
        taste,
        importedAffinity,
        visitedAffinity,
        visitedPenalty,
        outing,
        priorities,
        googleQuality,
        fecaQuality,
        network,
        adminBoost,
        likedVisit,
        similarToLiked,
      });

      return {
        baseScore,
        id: place.googlePlaceId,
        item: place,
      };
    }),
    {
      bucketHours: 1,
      jitterRatio: homeMix ? (hasPersonalization ? 0.02 : 0.05) : 0.12,
      maxJitter: homeMix ? (hasPersonalization ? 3 : 6) : 14,
      seed: buildPlacesRankingSeed(
        userId,
        "nearby",
        input.lat,
        input.lng,
        input.type ?? "all",
        input.variant,
        input.rotate,
      ),
      topWindow,
    },
  );

  const ordered = ranked.map((entry) => entry.item);
  const diversified = homeMix
    ? diversifyTopPlacesByCategory(ordered, input.limit)
    : ordered.slice(0, input.limit);
  const boostedGoogleIds = new Set(
    [...context.adminBoostByGoogleId.entries()]
      .filter(([, boost]) => boost > 0)
      .map(([googlePlaceId]) => googlePlaceId),
  );
  const pinnedCurationPlaces =
    homeMix && !onboardingPast
      ? buildPinnedCurationPlaces(
          context.cityPickPlaces,
          work,
          context.adminBoostByGoogleId,
        )
      : [];
  const withCityPicks =
    homeMix && !onboardingPast
      ? applyCityPickSlots(diversified, pinnedCurationPlaces, input.limit)
      : diversified;
  const finalPlaces = homeMix
    ? applyCuratedSlotCap(
        withCityPicks,
        context.curatedGoogleIds,
        input.limit,
        boostedGoogleIds,
      )
    : withCityPicks;

  if (!context.debugScores) {
    return { places: finalPlaces };
  }

  const finalIds = new Set(finalPlaces.map((p) => p.googlePlaceId));
  const debugScores = ranked
    .filter((entry) => finalIds.has(entry.id))
    .map((entry) => {
      const b = breakdownById.get(entry.id);
      const jitter = entry.score - entry.baseScore;
      return {
        googlePlaceId: entry.id,
        name: entry.item.name,
        baseScore: entry.baseScore,
        distance: b?.distance ?? 0,
        taste: b?.taste ?? 0,
        importedAffinity: b?.importedAffinity ?? 0,
        visitedAffinity: b?.visitedAffinity ?? 0,
        visitedPenalty: b?.visitedPenalty ?? 0,
        outing: b?.outing ?? 0,
        priorities: b?.priorities ?? 0,
        googleQuality: b?.googleQuality ?? 0,
        fecaQuality: b?.fecaQuality ?? 0,
        network: b?.network ?? 0,
        adminBoost: b?.adminBoost ?? 0,
        likedVisit: b?.likedVisit ?? 0,
        similarToLiked: b?.similarToLiked ?? 0,
        jitter,
        finalScore: entry.score,
      };
    });

  return { places: finalPlaces, debugScores };
}
