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
  "activityVisibility" | "diaryVisibility" | "groupInvitePolicy"
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
    | "lat"
    | "lng"
    | "username"
  > & {
    cityRef?: {
      googlePlaceId: string;
    } | null;
  },
) {
  return {
    avatarUrl: user.avatarUrl ?? undefined,
    bio: user.bio ?? undefined,
    city: user.city ?? undefined,
    cityGooglePlaceId: user.cityRef?.googlePlaceId ?? undefined,
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    lat: user.lat ?? undefined,
    lng: user.lng ?? undefined,
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

export function serializeSocialSettings(settings: SocialSettingsView) {
  return {
    activityVisibility: settings.activityVisibility,
    diaryVisibility: settings.diaryVisibility,
    groupInvitePolicy: settings.groupInvitePolicy,
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

export function serializeGroupEvent(
  event: GroupEventWithRelations,
  options?: { viewerUserId?: string },
) {
  const myRsvp = options?.viewerUserId
    ? event.rsvps?.find((rsvp) => rsvp.userId === options.viewerUserId)?.rsvp ??
      "none"
    : undefined;

  return {
    date: formatDateOnly(event.date),
    id: event.id,
    myRsvp,
    place: serializePlaceSummary(event.place),
    proposedBy: serializeUserPublic(event.proposedBy),
    status: event.status,
  };
}

export function serializeGroup(
  group: GroupWithRelations,
  options?: { viewerUserId?: string },
) {
  return {
    createdBy: serializeUserPublic(group.createdBy),
    events: group.events.map((event) => serializeGroupEvent(event, options)),
    id: group.id,
    inviteCode: group.inviteCode,
    members: group.members.map((member) => ({
      accepted: member.status === "accepted",
      invitedBy: member.invitedBy
        ? serializeUserPublic(member.invitedBy)
        : undefined,
      role: member.role,
      status: mapGroupMemberStatus(member.status),
      user: serializeUserPublic(member.user),
    })),
    name: group.name,
  };
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
  }
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
