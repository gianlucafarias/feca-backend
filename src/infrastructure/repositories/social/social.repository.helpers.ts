import { createHash } from "node:crypto";

import {
  ContentVisibility,
  GroupInvitePolicy,
  type UserSettings,
} from "@prisma/client";

import { distanceInMeters } from "../../../lib/geo";
import { utcHourBucketId } from "../../../lib/ranking-time-seed";
import { scoreTasteAgainstVisitTags } from "../../../lib/taste-place-score";
import {
  DEFAULT_SOCIAL_SETTINGS,
  type SocialSettingsView,
  type SocialState,
  type UserPermissions,
  type VisitWithRelations,
} from "./social.repository.types";

export function normalizeSettings(
  settings: UserSettings | null | undefined,
): SocialSettingsView {
  return {
    activityVisibility:
      settings?.activityVisibility ?? DEFAULT_SOCIAL_SETTINGS.activityVisibility,
    diaryVisibility:
      settings?.diaryVisibility ?? DEFAULT_SOCIAL_SETTINGS.diaryVisibility,
    groupInvitePolicy:
      settings?.groupInvitePolicy ?? DEFAULT_SOCIAL_SETTINGS.groupInvitePolicy,
    pushEnabled: settings?.pushEnabled ?? DEFAULT_SOCIAL_SETTINGS.pushEnabled,
  };
}

export function buildSocialState(
  userId: string,
  relationships: {
    followersOfViewer: Set<string>;
    followingByViewer: Set<string>;
  },
): SocialState {
  const following = relationships.followingByViewer.has(userId);
  const followsYou = relationships.followersOfViewer.has(userId);

  return {
    followsYou,
    following,
    mutual: following && followsYou,
  };
}

export function buildPermissions(
  viewerId: string,
  targetUserId: string,
  settings: SocialSettingsView,
  social: SocialState,
): UserPermissions {
  if (viewerId === targetUserId) {
    return {
      canInviteToGroup: false,
      canViewActivity: true,
      canViewDiaries: true,
    };
  }

  return {
    canInviteToGroup: canInviteToGroup(settings.groupInvitePolicy, social),
    canViewActivity: canViewContent(settings.activityVisibility, social.following),
    canViewDiaries: canViewContent(settings.diaryVisibility, social.following),
  };
}

export function canViewContent(
  visibility: ContentVisibility,
  viewerFollowsTarget: boolean,
) {
  if (visibility === ContentVisibility.public) {
    return true;
  }

  if (visibility === ContentVisibility.followers) {
    return viewerFollowsTarget;
  }

  return false;
}

export function canInviteToGroup(policy: GroupInvitePolicy, social: SocialState) {
  if (policy === GroupInvitePolicy.anyone) {
    return true;
  }

  if (policy === GroupInvitePolicy.following_only) {
    return social.followsYou;
  }

  return social.mutual;
}

export function isVisitVisibleToViewer(
  viewerId: string,
  visitUserId: string,
  settings: SocialSettingsView,
  viewerFollowsTarget: boolean,
) {
  if (viewerId === visitUserId) {
    return true;
  }

  return canViewContent(settings.activityVisibility, viewerFollowsTarget);
}

export function buildNetworkFeedScore(
  viewerTasteIds: string[],
  visit: VisitWithRelations,
) {
  let score = visit.rating * 4;

  if (visit.wouldReturn === "yes") {
    score += 28;
  } else if (visit.wouldReturn === "maybe") {
    score += 12;
  }

  const authorTaste = visit.user.tastePreferenceIds ?? [];
  const overlap = viewerTasteIds.filter((id) => authorTaste.includes(id)).length;
  score += overlap * 12;
  score += scoreTasteAgainstVisitTags(viewerTasteIds, visit.tags);

  const days =
    (Date.now() - visit.visitedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 7) {
    score += 14;
  } else if (days <= 21) {
    score += 8;
  } else if (days <= 45) {
    score += 4;
  }

  return score;
}

export function buildNearbyScore(
  viewerLocation: { lat: number; lng: number },
  visit: VisitWithRelations,
  viewerTasteIds: string[],
) {
  const distance =
    typeof visit.place.lat === "number" && typeof visit.place.lng === "number"
      ? distanceInMeters(
          viewerLocation.lat,
          viewerLocation.lng,
          visit.place.lat,
          visit.place.lng,
        )
      : 5000;

  const ratingScore = visit.rating * 12;
  const returnScore =
    visit.wouldReturn === "yes" ? 20 : visit.wouldReturn === "maybe" ? 8 : 0;
  const recencyPenalty =
    (Date.now() - visit.visitedAt.getTime()) / (1000 * 60 * 60 * 24 * 5);

  return (
    200 -
    distance / 25 +
    ratingScore +
    returnScore -
    recencyPenalty +
    scoreTasteAgainstVisitTags(viewerTasteIds, visit.tags)
  );
}

export function buildNowScore(
  now: Date,
  visit: VisitWithRelations,
  viewerTasteIds: string[],
) {
  const hour = now.getHours();
  const isSunday = now.getDay() === 0;
  const tags = new Set(visit.tags);

  let score = visit.rating * 10;

  if (visit.wouldReturn === "yes") {
    score += 18;
  } else if (visit.wouldReturn === "maybe") {
    score += 8;
  }

  if (hour >= 8 && hour <= 17 && (visit.wifiQuality ?? 0) >= 4) {
    score += 18;
  }

  if (hour >= 8 && hour <= 12 && tags.has("brunch")) {
    score += 16;
  }

  if (isSunday && tags.has("brunch")) {
    score += 20;
  }

  if ((visit.waitLevel ?? 5) <= 2) {
    score += 8;
  }

  if ((visit.noiseLevel ?? 5) <= 2) {
    score += 6;
  }

  return score + scoreTasteAgainstVisitTags(viewerTasteIds, visit.tags);
}

export function buildRankingSeed(
  userId: string,
  scope: string,
  lat?: number,
  lng?: number,
  now: Date = new Date(),
) {
  const latPart = typeof lat === "number" ? lat.toFixed(2) : "na";
  const lngPart = typeof lng === "number" ? lng.toFixed(2) : "na";

  return `${userId}:${scope}:${latPart}:${lngPart}:${utcHourBucketId(now)}`;
}

export function visitPositiveSignalWeight(
  rating: number,
  wouldReturn: "yes" | "maybe" | "no" | null,
) {
  if (wouldReturn === "yes") {
    return rating >= 4 ? 4 : 3;
  }
  if (rating >= 5) {
    return 3;
  }
  if (rating >= 4 || wouldReturn === "maybe") {
    return 2;
  }
  return 0;
}

export function visitNegativeSignalWeight(
  rating: number,
  wouldReturn: "yes" | "maybe" | "no" | null,
) {
  if (wouldReturn === "no") {
    return rating <= 2 ? 4 : 3;
  }
  if (rating <= 2) {
    return 2;
  }
  return 0;
}

export function categorySignalWinners(
  primary: Map<string, number>,
  opposing: Map<string, number>,
  limit: number,
) {
  return Array.from(primary.entries())
    .filter(([category, score]) => score > (opposing.get(category) ?? 0))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([category]) => category);
}

export function buildBestMoments(visits: VisitWithRelations[]) {
  const lines: string[] = [];

  if (visits.some((visit) => (visit.wifiQuality ?? 0) >= 4)) {
    lines.push("Bueno para trabajar con cafe y wifi estable");
  }

  if (visits.some((visit) => (visit.noiseLevel ?? 5) <= 2)) {
    lines.push("Tranqui para leer o conversar sin apuro");
  }

  if (visits.some((visit) => (visit.waitLevel ?? 5) <= 2)) {
    lines.push("Suele funcionar bien para una salida rápida");
  }

  if (visits.some((visit) => visit.tags.includes("brunch"))) {
    lines.push("Aparece seguido en planes de brunch");
  }

  if (visits.filter((visit) => visit.wouldReturn === "yes").length >= 2) {
    lines.push("La comunidad volvería por café y experiencia");
  }

  return lines.slice(0, 4);
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleDeterministic<T>(items: T[], seedMaterial: string): T[] {
  if (items.length <= 1) {
    return [...items];
  }
  const hash = createHash("sha256").update(seedMaterial).digest();
  const seed =
    hash.readUInt32BE(0) ^ hash.readUInt32BE(4) ^ hash.readUInt32BE(8);
  const rnd = mulberry32(seed >>> 0);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}
