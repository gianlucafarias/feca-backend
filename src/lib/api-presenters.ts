import type {
  Diary,
  DiaryPlace,
  Group,
  GroupEvent,
  GroupEventRsvp,
  GroupMember,
  Notification,
  NotificationEntityType,
  NotificationType,
  Place,
  PlaceSave,
  Prisma,
  User,
  UserSettings,
  Visit,
} from "@prisma/client";
import {
  GroupEventStatus,
  GroupInvitePolicy,
  MemberProposalInteraction,
  PlaceProposalPolicy,
} from "@prisma/client";

type UserStats = {
  followersCount: number;
  followingCount: number;
  savedCount: number;
  visitCount: number;
};

type SocialState = {
  followsYou: boolean;
  following: boolean;
  mutual: boolean;
};

type UserPermissions = {
  canInviteToGroup: boolean;
  canViewActivity: boolean;
  canViewDiaries: boolean;
};

type GroupEventWithRelations = GroupEvent & {
  place: Place;
  proposedBy: User;
  rsvps?: GroupEventRsvp[];
};

type GroupMemberWithRelations = GroupMember & {
  invitedBy?: User | null;
  user: User;
};

type GroupWithRelations = Group & {
  createdBy: User;
  events: GroupEventWithRelations[];
  members: GroupMemberWithRelations[];
};

type DiaryPlaceWithRelations = DiaryPlace & {
  place: Place;
};

type DiaryWithRelations = Diary & {
  createdBy: User;
  places: DiaryPlaceWithRelations[];
};

type VisitWithRelations = Visit & {
  place: Place;
  user: User;
};

type SavedPlaceWithRelations = PlaceSave & {
  place: Place;
};

type NotificationActor = Pick<
  User,
  "avatarUrl" | "city" | "displayName" | "id" | "username"
>;

type NotificationWithRelations = Notification & {
  actor?: NotificationActor | null;
};

type SocialSettingsView = Pick<
  UserSettings,
  "activityVisibility" | "diaryVisibility" | "groupInvitePolicy" | "pushEnabled"
>;

export function serializeUserSummary(
  user: Pick<User, "avatarUrl" | "city" | "displayName" | "id" | "username">,
) {
  return {
    avatarUrl: user.avatarUrl ?? undefined,
    city: user.city ?? undefined,
    displayName: user.displayName,
    id: user.id,
    username: user.username,
  };
}

export function serializeUserPublic(
  user: Pick<
    User,
    | "avatarUrl"
    | "bio"
    | "city"
    | "displayName"
    | "email"
    | "id"
    | "lat"
    | "lng"
    | "username"
  >,
  options?: { includeEmail?: boolean },
) {
  return {
    ...(options?.includeEmail ? { email: user.email } : {}),
    avatarUrl: user.avatarUrl ?? undefined,
    bio: user.bio ?? undefined,
    city: user.city ?? undefined,
    displayName: user.displayName,
    id: user.id,
    lat: user.lat ?? undefined,
    lng: user.lng ?? undefined,
    username: user.username,
  };
}

export function serializeAuthenticatedUser(
  user: Pick<
    User,
    | "avatarUrl"
    | "bio"
    | "city"
    | "displayName"
    | "email"
    | "id"
    | "isEditor"
    | "lat"
    | "lng"
    | "outingPreferences"
    | "username"
  > & {
    cityRef?: {
      googlePlaceId: string;
    } | null;
  },
  options: { isAdmin: boolean },
) {
  return {
    avatarUrl: user.avatarUrl ?? undefined,
    bio: user.bio ?? undefined,
    city: user.city ?? undefined,
    cityGooglePlaceId: user.cityRef?.googlePlaceId ?? undefined,
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    isAdmin: options.isAdmin,
    isEditor: user.isEditor,
    lat: user.lat ?? undefined,
    lng: user.lng ?? undefined,
    outingPreferences: user.outingPreferences ?? null,
    username: user.username,
  };
}

export function mergeSerializedUserStats<T extends Record<string, unknown>>(
  user: T,
  stats: UserStats,
) {
  return {
    ...user,
    followersCount: stats.followersCount,
    followingCount: stats.followingCount,
    savedCount: stats.savedCount,
    visitCount: stats.visitCount,
  };
}

export function serializeUserStats(stats: UserStats) {
  return {
    followersCount: stats.followersCount,
    followingCount: stats.followingCount,
    savedCount: stats.savedCount,
    visitCount: stats.visitCount,
  };
}

/** Valores expuestos en API para alinear con el cliente móvil. */
export type ApiGroupInvitePolicy = "everyone" | "from_following_only";

export function mapGroupInvitePolicyToApi(
  policy: GroupInvitePolicy,
): ApiGroupInvitePolicy {
  if (policy === GroupInvitePolicy.following_only) {
    return "from_following_only";
  }

  return "everyone";
}

export function mapApiGroupInvitePolicyToPrisma(
  policy: ApiGroupInvitePolicy,
): GroupInvitePolicy {
  return policy === "from_following_only"
    ? GroupInvitePolicy.following_only
    : GroupInvitePolicy.anyone;
}

export function serializeSocialSettings(settings: SocialSettingsView) {
  return {
    activityVisibility: settings.activityVisibility,
    diaryVisibility: settings.diaryVisibility,
    groupInvitePolicy: mapGroupInvitePolicyToApi(settings.groupInvitePolicy),
    pushEnabled: settings.pushEnabled,
  };
}

export function serializeSocialState(social: SocialState) {
  return {
    followsYou: social.followsYou,
    following: social.following,
    mutual: social.mutual,
  };
}

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
    id: visit.id,
    note: visit.note,
    orderedItems: visit.orderedItems ?? undefined,
    place: serializePlaceSummary(visit.place),
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

export function serializeNotification(notification: NotificationWithRelations) {
  const actor = notification.actor
    ? serializeUserSummary(notification.actor)
    : null;
  const data = normalizeNotificationData(notification.payload);
  const entity =
    notification.entityType && notification.entityId
      ? {
          id: notification.entityId,
          kind: notification.entityType,
        }
      : null;
  const presentation = buildNotificationPresentation(
    notification.type,
    actor,
    data,
    entity,
  );

  return {
    actor,
    body: presentation.body,
    createdAt: notification.createdAt.toISOString(),
    data,
    deepLink: presentation.deepLink,
    entity,
    id: notification.id,
    read: Boolean(notification.readAt),
    title: presentation.title,
    type: notification.type,
  };
}

type GroupEventCapabilityContext = Pick<
  Group,
  "createdById" | "memberProposalInteraction" | "placeProposalPolicy"
>;

export function computeGroupEventCapabilityFlags(
  group: GroupEventCapabilityContext,
  event: Pick<GroupEvent, "proposedById" | "status">,
) {
  if (event.status === GroupEventStatus.completed) {
    return {
      allowsConfirm: false,
      allowsCounterProposals: false,
      allowsRsvp: false,
    };
  }

  if (event.status === GroupEventStatus.announcement) {
    return {
      allowsConfirm: false,
      allowsCounterProposals: false,
      allowsRsvp: false,
    };
  }

  if (event.status === GroupEventStatus.confirmed) {
    return {
      allowsConfirm: false,
      allowsCounterProposals: false,
      allowsRsvp: true,
    };
  }

  const isOwnerProposal = event.proposedById === group.createdById;
  const lockedMemberProposal =
    group.memberProposalInteraction === MemberProposalInteraction.announcement_locked &&
    !isOwnerProposal;

  if (lockedMemberProposal) {
    return {
      allowsConfirm: false,
      allowsCounterProposals: false,
      allowsRsvp: false,
    };
  }

  return {
    allowsConfirm: true,
    allowsCounterProposals: group.placeProposalPolicy === PlaceProposalPolicy.all_members,
    allowsRsvp: true,
  };
}

export function serializeGroupEvent(
  event: GroupEventWithRelations,
  options?: {
    group: GroupEventCapabilityContext;
    redactPlaceForPublic?: boolean;
    viewerUserId?: string;
  },
) {
  const myRsvp = options?.viewerUserId
    ? event.rsvps?.find((rsvp) => rsvp.userId === options.viewerUserId)?.rsvp ??
      "none"
    : undefined;

  const flags = options?.group
    ? computeGroupEventCapabilityFlags(options.group, event)
    : {
        allowsConfirm: false,
        allowsCounterProposals: false,
        allowsRsvp: true,
      };

  const placePayload = options?.redactPlaceForPublic
    ? serializePlaceSummaryForPublicGroupViewer(event.place)
    : serializePlaceSummary(event.place);

  return {
    ...flags,
    date: formatDateOnly(event.date),
    id: event.id,
    myRsvp,
    place: placePayload,
    proposedBy: serializeUserPublic(event.proposedBy),
    status: event.status,
  };
}

export function serializeGroup(
  group: GroupWithRelations,
  options?: { publicPreview?: boolean; viewerUserId?: string },
) {
  const acceptedCount = group.members.filter(
    (member) => member.status === "accepted",
  ).length;

  const myMembership = options?.viewerUserId
    ? group.members.find((member) => member.userId === options.viewerUserId)
    : undefined;

  const viewerMembership: "active" | "invited" | "none" | undefined = options?.publicPreview
    ? "none"
    : myMembership?.status === "accepted"
      ? "active"
      : myMembership?.status === "pending"
        ? "invited"
        : myMembership
          ? "none"
          : undefined;

  const groupContext: GroupEventCapabilityContext = {
    createdById: group.createdById,
    memberProposalInteraction: group.memberProposalInteraction,
    placeProposalPolicy: group.placeProposalPolicy,
  };

  return {
    createdBy: serializeUserPublic(group.createdBy),
    events: group.events.map((event) =>
      serializeGroupEvent(event, {
        group: groupContext,
        redactPlaceForPublic: options?.publicPreview,
        viewerUserId: options?.viewerUserId,
      }),
    ),
    id: group.id,
    inviteCode: options?.publicPreview ? null : group.inviteCode,
    memberCount: acceptedCount,
    memberProposalInteraction: group.memberProposalInteraction,
    members: options?.publicPreview
      ? []
      : group.members.map((member) => ({
          accepted: member.status === "accepted",
          invitedBy: member.invitedBy
            ? serializeUserPublic(member.invitedBy)
            : undefined,
          role: member.role,
          status: mapGroupMemberStatus(member.status),
          user: serializeUserPublic(member.user),
        })),
    name: group.name,
    placeProposalPolicy: group.placeProposalPolicy,
    visibility: group.visibility,
    ...(viewerMembership !== undefined ? { viewerMembership } : {}),
  };
}

export type PublicFriendGroupPlanRow = {
  createdBy: User;
  events: Array<{
    date: Date;
    place: Place;
    status: GroupEvent["status"];
  }>;
  id: string;
  members: GroupMemberWithRelations[];
  name: string;
};

export function serializePublicFriendGroupPlan(
  group: PublicFriendGroupPlanRow,
  options: {
    followedMemberIds: Set<string>;
    nextEvent: PublicFriendGroupPlanRow["events"][number] | null;
    viewerId: string;
  },
) {
  const friendParticipantUser = pickFriendParticipant(
    group.members,
    options.followedMemberIds,
    options.viewerId,
  );

  const next = options.nextEvent;

  /**
   * ApiGroupEventStatus en cliente: proposed | confirmed | completed.
   * "announcement" se expone como proposed en el resumen de listado.
   */
  const nextStatusForApi = next
    ? next.status === GroupEventStatus.announcement
      ? ("proposed" as const)
      : next.status === GroupEventStatus.proposed ||
          next.status === GroupEventStatus.confirmed ||
          next.status === GroupEventStatus.completed
        ? next.status
        : ("proposed" as const)
    : null;

  const areaRaw = next?.place.city?.trim();
  const placeTitle = next?.place.name?.trim() ?? "";

  return {
    createdBy: serializeUserPublic(group.createdBy),
    friendParticipant: friendParticipantUser
      ? serializeUserPublic(friendParticipantUser)
      : null,
    id: group.id,
    memberCount: group.members.filter((m) => m.status === "accepted").length,
    name: group.name,
    nextEvent: next && nextStatusForApi
      ? {
          ...(areaRaw && areaRaw.length > 0 ? { areaLabel: areaRaw } : {}),
          date: formatDateOnly(next.date),
          placeName: placeTitle,
          status: nextStatusForApi,
        }
      : null,
  };
}

/**
 * Elegible: miembro activo que el viewer sigue (distinto del viewer).
 * Estabilidad entre páginas: menor user_id lexicográfico (ver spec §2.5).
 */
function pickFriendParticipant(
  members: GroupMemberWithRelations[],
  followedMemberIds: Set<string>,
  viewerId: string,
) {
  const candidates = members.filter(
    (member) =>
      member.status === "accepted" &&
      member.userId !== viewerId &&
      followedMemberIds.has(member.userId),
  );

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => left.userId.localeCompare(right.userId));

  return candidates[0].user;
}

export function serializeDiary(diary: DiaryWithRelations) {
  const orderedPlaces = [...diary.places].sort((a, b) => {
    if (a.position !== b.position) {
      return a.position - b.position;
    }

    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return {
    createdAt: diary.createdAt.toISOString(),
    createdBy: serializeUserPublic(diary.createdBy),
    coverImageUrl: diary.coverImageUrl ?? undefined,
    description: diary.description ?? undefined,
    editorialReason: diary.editorialReason ?? undefined,
    id: diary.id,
    intro: diary.intro ?? undefined,
    name: diary.name,
    orderedPlaces: orderedPlaces.map((entry) => ({
      note: entry.note ?? undefined,
      place: serializePlaceSummary(entry.place),
      position: entry.position,
    })),
    places: orderedPlaces.map((entry) => serializePlaceSummary(entry.place)),
    publishedAt: diary.publishedAt?.toISOString(),
    visibility: diary.visibility,
  };
}

function mapGroupMemberStatus(status: GroupMember["status"]) {
  switch (status) {
    case "accepted":
      return "active";
    case "pending":
      return "invited";
    default:
      return status;
  }
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function normalizeNotificationData(payload: Prisma.JsonValue | null) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  return payload as Record<string, unknown>;
}

function buildNotificationPresentation(
  type: NotificationType,
  actor: ReturnType<typeof serializeUserSummary> | null,
  data: Record<string, unknown> | null,
  entity: { id: string; kind: NotificationEntityType } | null,
) {
  const actorName = actor?.displayName || actor?.username || "Alguien";
  const custom = readCustomNotificationPresentation(data);

  switch (type) {
    case "follow":
      return {
        body: `${actorName} empezo a seguirte`,
        deepLink: actor ? `/user/${actor.id}` : null,
        title: "Nuevo seguidor",
      };
    case "group_invite": {
      const groupId = readNotificationString(data, "groupId") ?? entity?.id ?? null;
      const groupName = readNotificationString(data, "groupName") ?? "tu plan";
      return {
        body: `${actorName} te invito a ${groupName}`,
        deepLink: groupId ? `/group/${groupId}` : null,
        title: "Invitacion a un plan",
      };
    }
    case "group_joined": {
      const groupId = readNotificationString(data, "groupId") ?? entity?.id ?? null;
      const groupName = readNotificationString(data, "groupName") ?? "tu plan";
      return {
        body: `${actorName} se sumo a ${groupName}`,
        deepLink: groupId ? `/group/${groupId}` : null,
        title: "Nuevo miembro en el plan",
      };
    }
    case "group_event_proposed": {
      const groupId = readNotificationString(data, "groupId") ?? null;
      const groupName = readNotificationString(data, "groupName") ?? "tu plan";
      const placeName = readNotificationString(data, "placeName") ?? "un lugar";
      return {
        body: `${actorName} propuso ${placeName} para ${groupName}`,
        deepLink: groupId ? `/group/${groupId}` : null,
        title: "Nuevo plan propuesto",
      };
    }
    case "group_event_rsvp": {
      const groupId = readNotificationString(data, "groupId") ?? null;
      const placeName = readNotificationString(data, "placeName") ?? "el plan";
      const rsvp = mapRsvpLabel(readNotificationString(data, "rsvp"));
      return {
        body: `${actorName} respondio ${rsvp} para ${placeName}`,
        deepLink: groupId ? `/group/${groupId}` : null,
        title: "Nuevo RSVP",
      };
    }
    case "visit_created": {
      const placeName = readNotificationString(data, "placeName") ?? "un lugar";
      const placeRouteId =
        readNotificationString(data, "placeGooglePlaceId") ??
        readNotificationString(data, "placeId") ??
        null;
      return {
        body: `${actorName} visito ${placeName}`,
        deepLink: placeRouteId ? `/place/${placeRouteId}` : null,
        title: "Nueva visita",
      };
    }
    case "diary_published": {
      const diaryId = readNotificationString(data, "diaryId") ?? entity?.id ?? null;
      const diaryName = readNotificationString(data, "diaryName") ?? "una guia";
      return {
        body: `${actorName} publico ${diaryName}`,
        deepLink: diaryId ? `/diary/${diaryId}` : null,
        title: "Nueva guia publicada",
      };
    }
    case "group_invite_reminder": {
      const groupId = readNotificationString(data, "groupId") ?? entity?.id ?? null;
      const groupName = readNotificationString(data, "groupName") ?? "tu plan";
      return custom ?? {
        body: `Todavia tenes pendiente la invitacion a ${groupName}`,
        deepLink: groupId ? `/group/${groupId}` : null,
        title: "Invitacion pendiente",
      };
    }
    case "group_event_rsvp_reminder": {
      const groupId = readNotificationString(data, "groupId") ?? null;
      const placeName = readNotificationString(data, "placeName") ?? "tu plan";
      return custom ?? {
        body: `Falta tu respuesta para ${placeName}`,
        deepLink: groupId ? `/group/${groupId}` : null,
        title: "Recordatorio de RSVP",
      };
    }
    case "group_event_today_reminder": {
      const groupId = readNotificationString(data, "groupId") ?? null;
      const placeName = readNotificationString(data, "placeName") ?? "tu plan";
      return custom ?? {
        body: `Tu plan de hoy sigue en pie: ${placeName}`,
        deepLink: groupId ? `/group/${groupId}` : null,
        title: "Plan para hoy",
      };
    }
    case "weekly_digest":
      return (
        custom ?? {
          body: "Mira lo mas interesante de tu red esta semana.",
          deepLink: "/notifications",
          title: "Resumen semanal",
        }
      );
    case "contextual_recommendation": {
      const placeRouteId =
        readNotificationString(data, "placeGooglePlaceId") ??
        readNotificationString(data, "placeId") ??
        entity?.id ??
        null;
      const placeName = readNotificationString(data, "placeName") ?? "un lugar";
      return custom ?? {
        body: `Tenemos una recomendacion para tu proxima salida: ${placeName}`,
        deepLink: placeRouteId ? `/place/${placeRouteId}` : null,
        title: "Recomendacion para vos",
      };
    }
  }
}

function readCustomNotificationPresentation(
  data: Record<string, unknown> | null,
) {
  const title = readNotificationString(data, "title");
  const body = readNotificationString(data, "body");
  const deepLink = readNotificationString(data, "deepLink") ?? null;

  if (!title || !body) {
    return null;
  }

  return {
    body,
    deepLink,
    title,
  };
}

function readNotificationString(
  data: Record<string, unknown> | null,
  key: string,
) {
  const value = data?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function mapRsvpLabel(value?: string) {
  switch (value) {
    case "going":
      return '"voy"';
    case "maybe":
      return '"quizas"';
    case "declined":
      return '"no voy"';
    default:
      return '"sin respuesta"';
  }
}
