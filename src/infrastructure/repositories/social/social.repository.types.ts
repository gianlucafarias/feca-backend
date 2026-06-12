import {
  ContentVisibility,
  GroupInvitePolicy,
  Prisma,
  type UserSettings,
} from "@prisma/client";

export type PaginationInput = {
  limit: number;
  offset: number;
};

export type FeedMode = "network" | "nearby" | "now" | "city";

export type FeedInput = PaginationInput & {
  mode: FeedMode;
  lat?: number;
  lng?: number;
  /** Con mode=city: filtrar por este cityId en lugar del perfil del viewer */
  cityIdOverride?: string;
};

export type UserStats = {
  followersCount: number;
  followingCount: number;
  savedCount: number;
  visitCount: number;
};

export type SocialState = {
  followsYou: boolean;
  following: boolean;
  mutual: boolean;
};

export type UserPermissions = {
  canInviteToGroup: boolean;
  canViewActivity: boolean;
  canViewDiaries: boolean;
};

export type SocialSettingsView = Pick<
  UserSettings,
  "activityVisibility" | "diaryVisibility" | "groupInvitePolicy" | "pushEnabled"
>;

export type UserWithSettings = Prisma.UserGetPayload<{
  include: { settings: true };
}>;

export const visitInclude = Prisma.validator<Prisma.VisitInclude>()({
  place: true,
  user: {
    include: {
      settings: true,
    },
  },
});

export type VisitWithRelations = Prisma.VisitGetPayload<{
  include: typeof visitInclude;
}>;

export const groupEventInclude = Prisma.validator<Prisma.GroupEventInclude>()({
  place: true,
  proposedBy: true,
  rsvps: true,
});

export const groupInclude = Prisma.validator<Prisma.GroupInclude>()({
  createdBy: true,
  events: {
    include: groupEventInclude,
    orderBy: [{ date: "asc" }, { createdAt: "desc" }],
  },
  members: {
    include: {
      invitedBy: true,
      user: true,
    },
    orderBy: [{ createdAt: "asc" }],
  },
});

export const diaryInclude = Prisma.validator<Prisma.DiaryInclude>()({
  createdBy: {
    include: {
      settings: true,
    },
  },
  places: {
    include: {
      place: true,
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  },
});

export const DEFAULT_SOCIAL_SETTINGS: SocialSettingsView = {
  activityVisibility: ContentVisibility.public,
  diaryVisibility: ContentVisibility.public,
  groupInvitePolicy: GroupInvitePolicy.anyone,
  pushEnabled: true,
};

export const GOOGLE_DATA_PORTABILITY_IMPORT_REASON = "google_data_portability";
