import {
  BadRequestException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { GroupEventStatus, GuideVisibility } from "@prisma/client";
import { randomBytes } from "node:crypto";

import { distanceInMeters } from "../lib/geo";
import { PaginationQueryDto } from "../common/dto/pagination-query.dto";
import { CreateDiaryDto } from "./dto/create-diary.dto";
import { UpdateDiaryDto } from "./dto/update-diary.dto";
import { UpdateTasteDto } from "./dto/update-taste.dto";
import { TASTE_OPTIONS, TASTE_OPTION_IDS } from "./taste-options";

export function assertNoInvitePolicyRejections(
  rejectedInvites: Array<{ reason: string; userId: string }>,
) {
  if (rejectedInvites.some((entry) => entry.reason === "invite_policy")) {
    throw new UnprocessableEntityException({
      code: "INVITE_NOT_ALLOWED_BY_TARGET_POLICY",
      message:
        "Esta persona solo acepta invitaciones de usuarios que sigue.",
    });
  }
}

/**
 * Próximo evento para listado "planes de amigos": fecha >= hoy (UTC), prioridad
 * confirmed → proposed/announcement; sin eventos útiles → null (ver spec §2.6).
 */
export function pickNextEventForPublicFriendList<
  T extends { date: Date; status: GroupEventStatus },
>(events: T[]): T | null {
  if (events.length === 0) {
    return null;
  }

  const now = new Date();
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const futureNonCompleted = events.filter(
    (event) =>
      event.date >= startOfToday && event.status !== GroupEventStatus.completed,
  );

  const byDate = (
    left: (typeof events)[number],
    right: (typeof events)[number],
  ) => left.date.getTime() - right.date.getTime();

  const confirmed = futureNonCompleted
    .filter((event) => event.status === GroupEventStatus.confirmed)
    .sort(byDate);
  if (confirmed.length > 0) {
    return confirmed[0];
  }

  const proposedLike = futureNonCompleted
    .filter(
      (event) =>
        event.status === GroupEventStatus.proposed ||
        event.status === GroupEventStatus.announcement,
    )
    .sort(byDate);
  if (proposedLike.length > 0) {
    return proposedLike[0];
  }

  return null;
}

export function generateInviteCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

export function resolveOffset(query: PaginationQueryDto & { cursor?: string }) {
  if (!query.cursor) {
    return query.offset;
  }

  const parsed = Number(query.cursor);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return query.offset;
  }

  return Math.trunc(parsed);
}

export function normalizeTasteIds(body: UpdateTasteDto) {
  const rawIds =
    body.selectedIds ??
    body.preferenceIds ??
    body.preferences?.map((preference) => preference.id) ??
    [];

  return Array.from(
    new Set(rawIds.filter((id) => TASTE_OPTION_IDS.has(id))),
  );
}

export function serializeTasteSelection(selectedIds: string[]) {
  return {
    preferences: TASTE_OPTIONS.filter((option) => selectedIds.includes(option.id)),
    selectedIds,
  };
}

export function resolveDiaryPublishedAt(body: CreateDiaryDto) {
  if (body.publishedAt) {
    return body.publishedAt;
  }

  if (body.visibility && body.visibility !== GuideVisibility.private) {
    return new Date().toISOString();
  }

  return undefined;
}

export function resolveDiaryPublishedAtOnUpdate(
  diary: { publishedAt: Date | null; visibility: GuideVisibility },
  body: UpdateDiaryDto,
): Date | null {
  const nextVisibility =
    body.visibility !== undefined
      ? (body.visibility as GuideVisibility)
      : diary.visibility;

  if (nextVisibility === GuideVisibility.private) {
    return null;
  }

  if (body.publishedAt) {
    return new Date(body.publishedAt);
  }

  if (diary.publishedAt) {
    return diary.publishedAt;
  }

  return new Date();
}

export function canViewDiary(
  viewerId: string,
  diary: {
    createdById: string;
    visibility: GuideVisibility;
  },
  allowUnlisted: boolean,
) {
  if (viewerId === diary.createdById) {
    return true;
  }

  if (diary.visibility === GuideVisibility.public) {
    return true;
  }

  return allowUnlisted && diary.visibility === GuideVisibility.unlisted;
}

export function filterVisibleDiaries<
  T extends { createdById: string; visibility: GuideVisibility },
>(diaries: T[], viewerId: string, allowUnlisted: boolean) {
  return diaries.filter((diary) => canViewDiary(viewerId, diary, allowUnlisted));
}

export function buildFeedAppearanceReason(
  mode: "network" | "nearby" | "now" | "city",
  visit: {
    note: string;
    noiseLevel: number | null;
    place: { lat?: number | null; lng?: number | null; name: string };
    rating: number;
    tags: string[];
    user: {
      displayName: string;
      tastePreferenceIds?: string[];
      username: string;
    };
    waitLevel: number | null;
    wifiQuality: number | null;
    wouldReturn: "yes" | "maybe" | "no" | null;
  },
  viewerTasteIds: string[],
  viewerLat?: number,
  viewerLng?: number,
) {
  const displayName = visit.user.displayName || visit.user.username;

  if (mode === "network") {
    const tasteOverlap = viewerTasteIds.filter((id) =>
      visit.user.tastePreferenceIds?.includes(id),
    ).length;

    if (visit.wouldReturn === "yes" || visit.rating >= 4) {
      return `${displayName} volveria`;
    }

    if (tasteOverlap >= 2) {
      return `${displayName} tiene gustos parecidos al tuyo`;
    }

    if ((visit.wifiQuality ?? 0) >= 4) {
      return `Bueno para trabajar segun ${displayName}`;
    }

    return `${displayName} paso por aca`;
  }

  if (mode === "nearby") {
    if (
      typeof viewerLat === "number" &&
      typeof viewerLng === "number" &&
      typeof visit.place.lat === "number" &&
      typeof visit.place.lng === "number"
    ) {
      const minutes = Math.max(
        2,
        Math.round(
          distanceInMeters(
            viewerLat,
            viewerLng,
            visit.place.lat,
            visit.place.lng,
          ) / 80,
        ),
      );

      if ((visit.wifiQuality ?? 0) >= 4) {
        return `A ${minutes} min caminando · bueno para trabajar`;
      }

      if ((visit.noiseLevel ?? 5) <= 2) {
        return `A ${minutes} min caminando · tranqui para leer`;
      }

      return `A ${minutes} min caminando`;
    }

    return "Cerca tuyo";
  }

  if (mode === "city") {
    if (visit.wouldReturn === "yes" || visit.rating >= 4) {
      return `${displayName} recomienda un lugar en tu ciudad`;
    }

    if ((visit.wifiQuality ?? 0) >= 4) {
      return `${displayName} fue a ${visit.place.name} y lo recomienda para trabajar`;
    }

    return `${displayName} reseño un lugar en tu ciudad`;
  }

  if (new Date().getDay() === 0 && visit.tags.includes("brunch")) {
    return "Muy elegido para brunch de domingo";
  }

  if ((visit.wifiQuality ?? 0) >= 4) {
    return "Abierto ahora y bueno para trabajar";
  }

  if ((visit.waitLevel ?? 5) <= 2) {
    return "Para una pausa rapida";
  }

  if ((visit.noiseLevel ?? 5) <= 2) {
    return "Tranqui para ir ahora";
  }

  return "Buen momento para ir ahora";
}

export function normalizeRequiredSearchQuery(
  query: string | undefined,
  options: { message: string; stripLeadingAt: boolean },
) {
  const trimmed = (query ?? "").trim().replace(/\s+/g, " ");
  const normalized = options.stripLeadingAt
    ? trimmed.replace(/^@+/, "")
    : trimmed;

  if (normalized.length < 2) {
    throw new BadRequestException(options.message);
  }

  return normalized;
}

export function scoreDiarySearchMatch(
  query: string,
  diary: {
    description?: string | null;
    intro?: string | null;
    name: string;
  },
) {
  const normalizedQuery = query.toLocaleLowerCase();
  const fields = [
    { value: diary.name, containsScore: 24, startsWithScore: 36 },
    { value: diary.intro ?? "", containsScore: 14, startsWithScore: 20 },
    { value: diary.description ?? "", containsScore: 10, startsWithScore: 16 },
  ];

  return fields.reduce((score, field) => {
    const normalizedValue = field.value.toLocaleLowerCase();
    if (!normalizedValue) {
      return score;
    }

    if (normalizedValue.startsWith(normalizedQuery)) {
      return score + field.startsWithScore;
    }

    if (normalizedValue.includes(normalizedQuery)) {
      return score + field.containsScore;
    }

    return score;
  }, 0);
}

export function buildAcceptedGroupMemberRecipientIds(
  group: {
    members: Array<{
      status: "accepted" | "pending" | "declined" | "left";
      userId: string;
    }>;
  },
  excludedUserIds: string[] = [],
) {
  const excluded = new Set(excludedUserIds);

  return group.members
    .filter((member) => member.status === "accepted")
    .map((member) => member.userId)
    .filter((userId) => !excluded.has(userId));
}

export function buildGroupAdminRecipientIds(
  group: {
    members: Array<{
      role: "owner" | "admin" | "member";
      status: "accepted" | "pending" | "declined" | "left";
      userId: string;
    }>;
  },
  excludedUserIds: string[] = [],
) {
  const excluded = new Set(excludedUserIds);

  return group.members
    .filter(
      (member) =>
        member.status === "accepted" &&
        (member.role === "owner" || member.role === "admin"),
    )
    .map((member) => member.userId)
    .filter((userId) => !excluded.has(userId));
}

export function buildGroupEventRsvpRecipientIds(
  group: {
    members: Array<{
      role: "owner" | "admin" | "member";
      status: "accepted" | "pending" | "declined" | "left";
      userId: string;
    }>;
  },
  event: {
    proposedById: string;
  },
  actorUserId: string,
) {
  return Array.from(
    new Set([
      event.proposedById,
      ...buildGroupAdminRecipientIds(group),
    ]),
  ).filter((userId) => userId !== actorUserId);
}

export function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function normalizeGooglePlaceRouteId(value: string) {
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
