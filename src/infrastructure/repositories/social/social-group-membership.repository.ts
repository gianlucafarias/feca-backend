import { Injectable } from "@nestjs/common";
import {
  GroupMemberRole,
  GroupMemberStatus,
  Prisma,
} from "@prisma/client";

import { PrismaService } from "../../../database/prisma.service";
import {
  buildPermissions,
  buildSocialState,
  normalizeSettings,
} from "./social.repository.helpers";
import { SocialRepositorySupport } from "./social.repository.support";
import { groupInclude } from "./social.repository.types";

@Injectable()
export class SocialGroupMembershipRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: SocialRepositorySupport,
  ) {}

  findGroupMembership(groupId: string, userId: string) {
    return this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });
  }

  async addGroupMembers(input: {
    groupId: string;
    invitedById: string;
    memberIds: string[];
  }) {
    const group = await this.prisma.group.findUnique({
      where: { id: input.groupId },
      select: { id: true },
    });

    if (!group) {
      return null;
    }

    const dedupedMemberIds = Array.from(
      new Set(input.memberIds.filter((memberId) => memberId !== input.invitedById)),
    );

    await this.support.ensureUserSettingsForUsers([
      input.invitedById,
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
      input.invitedById,
      invitees.map((invitee) => invitee.id),
    );
    const existingMemberships = dedupedMemberIds.length
      ? await this.prisma.groupMember.findMany({
          where: {
            groupId: input.groupId,
            userId: { in: dedupedMemberIds },
          },
          select: {
            id: true,
            status: true,
            userId: true,
          },
        })
      : [];
    const existingMembershipsByUserId = new Map(
      existingMemberships.map((membership) => [membership.userId, membership]),
    );

    const rejectedInvites: Array<{ reason: string; userId: string }> = [];
    const createRows: Prisma.GroupMemberCreateManyInput[] = [];
    const membershipsToRevive: Array<{ id: string; userId: string }> = [];

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
        input.invitedById,
        memberId,
        settings,
        social,
      ).canInviteToGroup;

      if (!canInvite) {
        rejectedInvites.push({
          reason: "invite_policy",
          userId: memberId,
        });
        continue;
      }

      const existingMembership = existingMembershipsByUserId.get(memberId);
      if (!existingMembership) {
        createRows.push({
          groupId: input.groupId,
          invitedById: input.invitedById,
          role: GroupMemberRole.member,
          status: GroupMemberStatus.pending,
          userId: memberId,
        });
        continue;
      }

      if (
        existingMembership.status === GroupMemberStatus.accepted ||
        existingMembership.status === GroupMemberStatus.pending
      ) {
        continue;
      }

      membershipsToRevive.push({
        id: existingMembership.id,
        userId: existingMembership.userId,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      if (createRows.length > 0) {
        await tx.groupMember.createMany({
          data: createRows,
          skipDuplicates: true,
        });
      }

      for (const membership of membershipsToRevive) {
        await tx.groupMember.update({
          where: { id: membership.id },
          data: {
            invitedById: input.invitedById,
            role: GroupMemberRole.member,
            status: GroupMemberStatus.pending,
          },
        });
      }
    });

    const updatedGroup = await this.prisma.group.findUnique({
      where: { id: input.groupId },
      include: groupInclude,
    });

    if (!updatedGroup) {
      return null;
    }

    return {
      group: updatedGroup,
      invitedUserIds: [
        ...createRows.map((row) => row.userId),
        ...membershipsToRevive.map((membership) => membership.userId),
      ],
      rejectedInvites,
    };
  }

  joinGroupByCode(userId: string, inviteCode: string) {
    const normalizedCode = inviteCode.trim().toUpperCase();

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.group.findUnique({
        where: { inviteCode: normalizedCode },
        select: { id: true },
      });

      if (!group) {
        return null;
      }

      let joinedNow = false;
      const existing = await tx.groupMember.findUnique({
        where: {
          groupId_userId: {
            groupId: group.id,
            userId,
          },
        },
      });

      if (existing) {
        joinedNow = existing.status !== GroupMemberStatus.accepted;

        if (joinedNow) {
          await tx.groupMember.update({
            where: { id: existing.id },
            data: {
              status: GroupMemberStatus.accepted,
            },
          });
        }
      } else {
        joinedNow = true;
        await tx.groupMember.create({
          data: {
            groupId: group.id,
            role: GroupMemberRole.member,
            status: GroupMemberStatus.accepted,
            userId,
          },
        });
      }

      const hydratedGroup = await tx.group.findUnique({
        where: { id: group.id },
        include: groupInclude,
      });

      if (!hydratedGroup) {
        return null;
      }

      return {
        group: hydratedGroup,
        joinedNow,
      };
    });
  }

  async leaveGroup(groupId: string, userId: string) {
    const membership = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });

    if (!membership) {
      return null;
    }

    if (membership.role === GroupMemberRole.owner) {
      return { kind: "owner_cannot_leave" as const };
    }

    if (
      membership.status !== GroupMemberStatus.accepted &&
      membership.status !== GroupMemberStatus.pending
    ) {
      return null;
    }

    await this.prisma.groupMember.update({
      data: {
        status: GroupMemberStatus.left,
      },
      where: { id: membership.id },
    });

    const group = await this.prisma.group.findUnique({
      include: groupInclude,
      where: { id: groupId },
    });

    if (!group) {
      return null;
    }

    return { group, kind: "left" as const };
  }
}
