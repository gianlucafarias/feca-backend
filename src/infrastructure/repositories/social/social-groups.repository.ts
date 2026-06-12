import { Injectable } from "@nestjs/common";
import {
  GroupMemberRole,
  GroupMemberStatus,
  GroupVisibility,
  MemberProposalInteraction,
  PlaceProposalPolicy,
  Prisma,
} from "@prisma/client";

import { PrismaService } from "../../../database/prisma.service";
import {
  buildPermissions,
  buildSocialState,
  normalizeSettings,
} from "./social.repository.helpers";
import { SocialGraphRepository } from "./social-graph.repository";
import { SocialGroupEventsRepository } from "./social-group-events.repository";
import { SocialGroupMembershipRepository } from "./social-group-membership.repository";
import { SocialRepositorySupport } from "./social.repository.support";
import { groupInclude } from "./social.repository.types";

@Injectable()
export class SocialGroupsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: SocialRepositorySupport,
    private readonly graphRepository: SocialGraphRepository,
    private readonly eventsRepository: SocialGroupEventsRepository,
    private readonly membershipRepository: SocialGroupMembershipRepository,
  ) {}

  async listGroupsByUser(userId: string) {
    return this.prisma.group.findMany({
      where: {
        OR: [
          { createdById: userId },
          {
            members: {
              some: {
                status: {
                  in: [GroupMemberStatus.accepted, GroupMemberStatus.pending],
                },
                userId,
              },
            },
          },
        ],
      },
      include: groupInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  async createGroup(input: {
    createdById: string;
    inviteCode: string;
    memberIds: string[];
    memberProposalInteraction?: MemberProposalInteraction;
    name: string;
    placeProposalPolicy?: PlaceProposalPolicy;
    visibility?: GroupVisibility;
  }) {
    const dedupedMemberIds = Array.from(
      new Set(input.memberIds.filter((memberId) => memberId !== input.createdById)),
    );

    await this.support.ensureUserSettingsForUsers([
      input.createdById,
      ...dedupedMemberIds,
    ]);

    const invitees = dedupedMemberIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: {
              in: dedupedMemberIds,
            },
          },
          include: {
            settings: true,
          },
        })
      : [];

    const inviteesById = new Map(invitees.map((invitee) => [invitee.id, invitee]));
    const relationships = await this.support.getRelationshipMaps(
      input.createdById,
      invitees.map((invitee) => invitee.id),
    );

    const allowedMemberIds: string[] = [];
    const rejectedInvites: Array<{ reason: string; userId: string }> = [];

    for (const memberId of dedupedMemberIds) {
      const invitee = inviteesById.get(memberId);

      if (!invitee) {
        rejectedInvites.push({
          reason: "not_found",
          userId: memberId,
        });
        continue;
      }

      const settings = normalizeSettings(invitee.settings);
      const social = buildSocialState(memberId, relationships);
      const canInvite = buildPermissions(
        input.createdById,
        memberId,
        settings,
        social,
      ).canInviteToGroup;

      if (canInvite) {
        allowedMemberIds.push(memberId);
        continue;
      }

      rejectedInvites.push({
        reason: "invite_policy",
        userId: memberId,
      });
    }

    const group = await this.prisma.group.create({
      data: {
        createdById: input.createdById,
        inviteCode: input.inviteCode,
        memberProposalInteraction:
          input.memberProposalInteraction ?? MemberProposalInteraction.collaborative,
        members: {
          create: [
            {
              role: GroupMemberRole.owner,
              status: GroupMemberStatus.accepted,
              userId: input.createdById,
            },
            ...allowedMemberIds.map((memberId) => ({
              invitedById: input.createdById,
              role: GroupMemberRole.member,
              status: GroupMemberStatus.pending,
              userId: memberId,
            })),
          ],
        },
        name: input.name,
        placeProposalPolicy:
          input.placeProposalPolicy ?? PlaceProposalPolicy.all_members,
        visibility: input.visibility ?? GroupVisibility.private,
      },
      include: groupInclude,
    });

    return {
      group,
      invitedUserIds: allowedMemberIds,
      rejectedInvites,
    };
  }

  addGroupMembers(input: Parameters<SocialGroupMembershipRepository["addGroupMembers"]>[0]) {
    return this.membershipRepository.addGroupMembers(input);
  }

  async findGroupById(groupId: string) {
    return this.prisma.group.findUnique({
      where: { id: groupId },
      include: groupInclude,
    });
  }

  async findGroupByInviteCode(inviteCode: string) {
    return this.prisma.group.findUnique({
      where: { inviteCode },
      include: groupInclude,
    });
  }

  findGroupMembership(groupId: string, userId: string) {
    return this.membershipRepository.findGroupMembership(groupId, userId);
  }

  joinGroupByCode(userId: string, inviteCode: string) {
    return this.membershipRepository.joinGroupByCode(userId, inviteCode);
  }

  async updateGroup(input: {
    groupId: string;
    memberProposalInteraction?: MemberProposalInteraction;
    name?: string;
    placeProposalPolicy?: PlaceProposalPolicy;
    visibility?: GroupVisibility;
  }) {
    return this.prisma.group.update({
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        ...(input.placeProposalPolicy !== undefined
          ? { placeProposalPolicy: input.placeProposalPolicy }
          : {}),
        ...(input.memberProposalInteraction !== undefined
          ? { memberProposalInteraction: input.memberProposalInteraction }
          : {}),
      },
      include: groupInclude,
      where: { id: input.groupId },
    });
  }

  leaveGroup(groupId: string, userId: string) {
    return this.membershipRepository.leaveGroup(groupId, userId);
  }

  /**
   * Candidatos para GET /v1/me/friends/public-group-plans (sin paginar).
   * El orden estable (por nextEvent, nombre, id) se aplica en SocialService.
   */
  async listPublicFriendGroupPlanCandidates(input: {
    excludeMember: boolean;
    viewerId: string;
  }) {
    const followingIds = await this.graphRepository.listFollowedUserIds(input.viewerId);

    if (followingIds.length === 0) {
      return { groups: [], total: 0 };
    }

    const memberMatch = {
      some: {
        status: GroupMemberStatus.accepted,
        userId: { in: followingIds },
      },
    };

    const whereFixed: Prisma.GroupWhereInput = {
      AND: [
        { visibility: GroupVisibility.public_followers },
        { members: memberMatch },
        ...(input.excludeMember
          ? [
              {
                members: {
                  none: {
                    userId: input.viewerId,
                    status: {
                      in: [GroupMemberStatus.accepted, GroupMemberStatus.pending],
                    },
                  },
                },
              } as Prisma.GroupWhereInput,
            ]
          : []),
      ],
    };

    const [total, groups] = await Promise.all([
      this.prisma.group.count({ where: whereFixed }),
      this.prisma.group.findMany({
        include: {
          createdBy: true,
          events: {
            include: { place: true },
            orderBy: [{ date: "asc" }],
          },
          members: {
            include: { user: true },
            where: { status: GroupMemberStatus.accepted },
          },
        },
        where: whereFixed,
      }),
    ]);

    return { groups, total };
  }

  findGroupEventById(groupId: string, eventId: string) {
    return this.eventsRepository.findGroupEventById(groupId, eventId);
  }

  createGroupEvent(input: Parameters<SocialGroupEventsRepository["createGroupEvent"]>[0]) {
    return this.eventsRepository.createGroupEvent(input);
  }

  setGroupEventRsvp(input: Parameters<SocialGroupEventsRepository["setGroupEventRsvp"]>[0]) {
    return this.eventsRepository.setGroupEventRsvp(input);
  }
}
