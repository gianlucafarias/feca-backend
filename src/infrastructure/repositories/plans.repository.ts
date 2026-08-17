import { Injectable } from "@nestjs/common";
import {
  GroupEventStatus,
  GroupJoinPolicy,
  GroupMemberRole,
  GroupMemberStatus,
  GroupVisibility,
  Prisma,
} from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";

const planInclude = Prisma.validator<Prisma.GroupInclude>()({
  createdBy: true,
  events: {
    include: {
      place: true,
      proposedBy: true,
      rsvps: true,
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  },
  members: {
    include: { user: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
});

export type PlanWithRelations = Prisma.GroupGetPayload<{
  include: typeof planInclude;
}>;

const messageInclude = Prisma.validator<Prisma.GroupMessageInclude>()({
  author: true,
});

export type PlanMessageWithAuthor = Prisma.GroupMessageGetPayload<{
  include: typeof messageInclude;
}>;

@Injectable()
export class PlansRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createPlan(input: {
    createdById: string;
    description?: string | null;
    date: string;
    inviteCode: string;
    inviteUserIds?: string[];
    joinPolicy?: GroupJoinPolicy;
    name: string;
    placeId: string;
    visibility?: GroupVisibility;
  }) {
    const invitees = await this.prisma.user.findMany({
      where: {
        id: {
          in: Array.from(
            new Set(
              (input.inviteUserIds ?? []).filter(
                (userId) => userId !== input.createdById,
              ),
            ),
          ),
        },
      },
      select: { id: true },
    });

    const plan = await this.prisma.group.create({
      data: {
        createdById: input.createdById,
        description: input.description ?? null,
        inviteCode: input.inviteCode,
        joinPolicy: input.joinPolicy ?? GroupJoinPolicy.open,
        name: input.name,
        visibility: input.visibility ?? GroupVisibility.public,
        members: {
          create: [
            {
              role: GroupMemberRole.owner,
              status: GroupMemberStatus.accepted,
              userId: input.createdById,
            },
            ...invitees.map(({ id }) => ({
              invitedById: input.createdById,
              role: GroupMemberRole.member,
              status: GroupMemberStatus.pending,
              userId: id,
            })),
          ],
        },
        events: {
          create: {
            date: new Date(input.date),
            placeId: input.placeId,
            proposedById: input.createdById,
            status: GroupEventStatus.confirmed,
          },
        },
      },
      include: planInclude,
    });

    return {
      invitedUserIds: invitees.map(({ id }) => id),
      plan,
    };
  }

  findPlanById(groupId: string) {
    return this.prisma.group.findUnique({
      where: { id: groupId },
      include: planInclude,
    });
  }

  async listDiscoverablePlans(input: {
    now: Date;
    city?: string;
    cityId?: string;
    minLat?: number;
    maxLat?: number;
    minLng?: number;
    cityGooglePlaceId?: string;
    maxLng?: number;
    fromDate?: Date;
    toDate?: Date;
  }) {
    const eventWhere: Prisma.GroupEventWhereInput = {
      date: {
        gte: input.fromDate ?? input.now,
        ...(input.toDate ? { lte: input.toDate } : {}),
      },
      status: { notIn: [GroupEventStatus.cancelled, GroupEventStatus.completed] },
      place: {
        ...(input.cityId ? { cityId: input.cityId } : {}),
        ...(input.city
          ? { city: { contains: input.city.trim(), mode: "insensitive" } }
          : {}),
        ...(input.cityGooglePlaceId
          ? { cityRef: { googlePlaceId: input.cityGooglePlaceId } }
          : {}),
        ...(input.minLat !== undefined || input.maxLat !== undefined
          ? {
              lat: {
                ...(input.minLat !== undefined ? { gte: input.minLat } : {}),
                ...(input.maxLat !== undefined ? { lte: input.maxLat } : {}),
              },
            }
          : {}),
        ...(input.minLng !== undefined || input.maxLng !== undefined
          ? {
              lng: {
                ...(input.minLng !== undefined ? { gte: input.minLng } : {}),
                ...(input.maxLng !== undefined ? { lte: input.maxLng } : {}),
              },
            }
          : {}),
      },
    };

    return this.prisma.group.findMany({
      where: {
        visibility: GroupVisibility.public,
        joinPolicy: { not: GroupJoinPolicy.invite_only },
        events: { some: eventWhere },
      },
      include: {
        ...planInclude,
        events: {
          ...planInclude.events,
          where: eventWhere,
        },
      },
    });
  }

  async updatePlan(input: {
    groupId: string;
    description?: string | null;
    joinPolicy?: GroupJoinPolicy;
    name?: string;
    eventId?: string;
    date?: string;
    placeId?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.group.update({
        where: { id: input.groupId },
        data: {
          ...(input.description !== undefined
            ? { description: input.description?.trim() || null }
            : {}),
          ...(input.joinPolicy !== undefined
            ? { joinPolicy: input.joinPolicy }
            : {}),
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        },
      });

      if (input.eventId && (input.date !== undefined || input.placeId !== undefined)) {
        await tx.groupEvent.update({
          where: { id: input.eventId },
          data: {
            ...(input.date !== undefined ? { date: new Date(input.date) } : {}),
            ...(input.placeId !== undefined ? { placeId: input.placeId } : {}),
          },
        });
      }

      return tx.group.findUniqueOrThrow({
        where: { id: input.groupId },
        include: planInclude,
      });
    });
  }

  findMembership(groupId: string, userId: string) {
    return this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
  }

  async joinPlan(groupId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.group.findUnique({
        where: { id: groupId },
        select: { id: true, joinPolicy: true },
      });

      if (!group) return null;

      const existing = await tx.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
      });

      if (existing?.status === GroupMemberStatus.accepted) {
        return { changed: false, kind: "accepted" as const, membership: existing };
      }

      if (
        existing?.status === GroupMemberStatus.pending &&
        group.joinPolicy === GroupJoinPolicy.invite_only
      ) {
        const membership = await tx.groupMember.update({
          where: { id: existing.id },
          data: { status: GroupMemberStatus.accepted },
        });
        return { changed: true, kind: "accepted" as const, membership };
      }

      if (
        existing?.status === GroupMemberStatus.requested &&
        group.joinPolicy === GroupJoinPolicy.request_approval
      ) {
        return { changed: false, kind: "requested" as const, membership: existing };
      }

      if (group.joinPolicy === GroupJoinPolicy.invite_only) {
        return { changed: false, kind: "denied" as const, membership: existing ?? null };
      }

      const accepted = group.joinPolicy === GroupJoinPolicy.open;
      const membership = existing
        ? await tx.groupMember.update({
            where: { id: existing.id },
            data: {
              role: GroupMemberRole.member,
              status: accepted
                ? GroupMemberStatus.accepted
                : GroupMemberStatus.requested,
            },
          })
        : await tx.groupMember.create({
            data: {
              groupId,
              role: GroupMemberRole.member,
              status: accepted
                ? GroupMemberStatus.accepted
                : GroupMemberStatus.requested,
              userId,
            },
          });

      return {
        changed: true,
        kind: accepted ? ("accepted" as const) : ("requested" as const),
        membership,
      };
    });
  }

  async leavePlan(groupId: string, userId: string) {
    const membership = await this.findMembership(groupId, userId);
    if (!membership) return null;
    if (membership.role === GroupMemberRole.owner) return { kind: "owner" as const };
    if (
      membership.status !== GroupMemberStatus.accepted &&
      membership.status !== GroupMemberStatus.requested &&
      membership.status !== GroupMemberStatus.pending
    ) {
      return null;
    }

    return this.prisma.groupMember.update({
      where: { id: membership.id },
      data: { status: GroupMemberStatus.left },
    });
  }

  listJoinRequests(groupId: string) {
    return this.prisma.groupMember.findMany({
      where: { groupId, status: GroupMemberStatus.requested },
      include: { user: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  async decideJoinRequest(input: {
    groupId: string;
    membershipId: string;
    approve: boolean;
  }) {
    return this.prisma.groupMember.updateMany({
      where: {
        id: input.membershipId,
        groupId: input.groupId,
        status: GroupMemberStatus.requested,
      },
      data: {
        status: input.approve
          ? GroupMemberStatus.accepted
          : GroupMemberStatus.declined,
      },
    });
  }

  async cancelJoinRequest(groupId: string, userId: string) {
    return this.prisma.groupMember.updateMany({
      where: { groupId, userId, status: GroupMemberStatus.requested },
      data: { status: GroupMemberStatus.left },
    });
  }

  async listMessages(
    groupId: string,
    limit: number,
    cursor?: { createdAt: Date; id: string },
    since?: Date,
  ) {
    const rows = await this.prisma.groupMessage.findMany({
      where: {
        groupId,
        deletedAt: null,
        ...(since ? { createdAt: { gt: since } } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      include: messageInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    return {
      messages: rows.slice(0, limit),
      hasMore: rows.length > limit,
    };
  }

  createMessage(groupId: string, authorId: string, body: string) {
    return this.prisma.groupMessage.create({
      data: { authorId, body, groupId },
      include: messageInclude,
    });
  }

  deleteMessage(groupId: string, messageId: string) {
    return this.prisma.groupMessage.updateMany({
      where: { id: messageId, groupId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  listAcceptedMemberIds(groupId: string, excludeUserId?: string) {
    return this.prisma.groupMember.findMany({
      where: {
        groupId,
        status: GroupMemberStatus.accepted,
        ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
      },
      select: { userId: true },
    });
  }

  listAdminIds(groupId: string) {
    return this.prisma.groupMember.findMany({
      where: {
        groupId,
        role: { in: [GroupMemberRole.owner, GroupMemberRole.admin] },
        status: GroupMemberStatus.accepted,
      },
      select: { userId: true },
    });
  }
}
