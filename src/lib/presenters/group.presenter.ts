import {
  GroupEventStatus,
  MemberProposalInteraction,
  PlaceProposalPolicy,
} from "@prisma/client";
import type { GroupEvent, GroupMember } from "@prisma/client";

import type {
  GroupEventCapabilityContext,
  GroupEventWithRelations,
  GroupMemberWithRelations,
  GroupWithRelations,
  PublicFriendGroupPlanRow,
} from "./presenter.types";
import { serializePlaceSummary, serializePlaceSummaryForPublicGroupViewer } from "./place.presenter";
import { serializeUserPublic } from "./user.presenter";

export function computeGroupEventCapabilityFlags(
  group: GroupEventCapabilityContext,
  event: Pick<GroupEvent, "proposedById" | "status">,
) {
  if (
    event.status === GroupEventStatus.completed ||
    event.status === GroupEventStatus.cancelled
  ) {
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

  const viewerMembership: "active" | "invited" | "requested" | "none" | undefined = options?.publicPreview
    ? "none"
    : myMembership?.status === "accepted"
      ? "active"
      : myMembership?.status === "pending"
        ? "invited"
        : myMembership?.status === "requested"
          ? "requested"
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

function mapGroupMemberStatus(status: GroupMember["status"]) {
  switch (status) {
    case "accepted":
      return "active";
    case "pending":
      return "invited";
    case "requested":
      return "requested";
    default:
      return status;
  }
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}
