import type { GroupInvitePolicy, User } from "@prisma/client";

import type { SocialSettingsView, SocialState, UserStats } from "./presenter.types";

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
  if (policy === "following_only") {
    return "from_following_only";
  }

  return "everyone";
}

export function mapApiGroupInvitePolicyToPrisma(
  policy: ApiGroupInvitePolicy,
): GroupInvitePolicy {
  return policy === "from_following_only"
    ? "following_only"
    : "anyone";
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
