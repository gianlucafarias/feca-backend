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

export type GroupEventWithRelations = GroupEvent & {
  place: Place;
  proposedBy: User;
  rsvps?: GroupEventRsvp[];
};

export type GroupMemberWithRelations = GroupMember & {
  invitedBy?: User | null;
  user: User;
};

export type GroupWithRelations = Group & {
  createdBy: User;
  events: GroupEventWithRelations[];
  members: GroupMemberWithRelations[];
};

export type DiaryPlaceWithRelations = DiaryPlace & {
  place: Place;
};

export type DiaryWithRelations = Diary & {
  createdBy: User;
  places: DiaryPlaceWithRelations[];
};

export type VisitWithRelations = Visit & {
  place: Place;
  user: User;
};

export type SavedPlaceWithRelations = PlaceSave & {
  place: Place;
};

export type NotificationActor = Pick<
  User,
  "avatarUrl" | "city" | "displayName" | "id" | "username"
>;

export type NotificationWithRelations = Notification & {
  actor?: NotificationActor | null;
};

export type GroupEventCapabilityContext = Pick<
  Group,
  "createdById" | "memberProposalInteraction" | "placeProposalPolicy"
>;

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

export type NotificationEntity = {
  id: string;
  kind: NotificationEntityType;
};

export type NotificationPresentation = {
  body: string;
  deepLink: string | null;
  title: string;
};
