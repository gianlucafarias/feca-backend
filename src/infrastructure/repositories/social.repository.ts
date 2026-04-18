import { Injectable } from "@nestjs/common";
import {
  ContentVisibility,
  GroupEventRsvpStatus,
  GroupInvitePolicy,
  GroupMemberRole,
  GroupMemberStatus,
  GuideVisibility,
  Prisma,
  type UserSettings,
} from "@prisma/client";

import { rankCandidatesWithRotation } from "../../lib/dynamic-ranking";
import { distanceInMeters } from "../../lib/geo";
import { PrismaService } from "../../database/prisma.service";

type PaginationInput = {
  limit: number;
  offset: number;
};

type FeedMode = "network" | "nearby" | "now" | "city";

type FeedInput = PaginationInput & {
  mode: FeedMode;
  lat?: number;
  lng?: number;
  /** Con mode=city: filtrar por este cityId en lugar del perfil del viewer */
  cityIdOverride?: string;
};

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

type SocialSettingsView = Pick<
  UserSettings,
  "activityVisibility" | "diaryVisibility" | "groupInvitePolicy"
>;

type UserWithSettings = Prisma.UserGetPayload<{
  include: { settings: true };
}>;

type VisitWithRelations = Prisma.VisitGetPayload<{
  include: typeof visitInclude;
}>;

const visitInclude = Prisma.validator<Prisma.VisitInclude>()({
  place: true,
  user: {
    include: {
      settings: true,
    },
  },
});

const groupEventInclude = Prisma.validator<Prisma.GroupEventInclude>()({
  place: true,
  proposedBy: true,
  rsvps: true,
});

const groupInclude = Prisma.validator<Prisma.GroupInclude>()({
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

const diaryInclude = Prisma.validator<Prisma.DiaryInclude>()({
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

const DEFAULT_SOCIAL_SETTINGS: SocialSettingsView = {
  activityVisibility: ContentVisibility.public,
  diaryVisibility: ContentVisibility.public,
  groupInvitePolicy: GroupInvitePolicy.anyone,
};

@Injectable()
export class SocialRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByIdWithStats(userId: string) {
    await this.ensureUserSettingsForAllUsers();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        settings: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      settings: normalizeSettings(user.settings),
      stats: await this.getProfileStats(userId),
      user,
    };
  }

  async findUserByIdWithContext(viewerId: string, userId: string) {
    await this.ensureUserSettingsForAllUsers();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        settings: true,
      },
    });

    if (!user) {
      return null;
    }

    const [stats, relationship] = await Promise.all([
      this.getProfileStats(userId),
      this.getUserRelationshipContext(viewerId, user),
    ]);

    return {
      permissions: relationship.permissions,
      settings: relationship.settings,
      social: relationship.social,
      stats,
      user,
    };
  }

  async searchUsers(
    viewerId: string,
    input: PaginationInput & { q?: string },
  ) {
    const where: Prisma.UserWhereInput = {
      id: { not: viewerId },
      ...(input.q
        ? {
            OR: [
              { displayName: { contains: input.q, mode: "insensitive" } },
              { username: { contains: input.q, mode: "insensitive" } },
              { city: { contains: input.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          avatarUrl: true,
          city: true,
          displayName: true,
          id: true,
          username: true,
        },
        orderBy: [{ displayName: "asc" }, { username: "asc" }],
        skip: input.offset,
        take: input.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      total,
      users,
    };
  }

  async getUserPlaceCreationContext(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        city: true,
        cityId: true,
        lat: true,
        lng: true,
      },
    });
  }

  async followUser(viewerId: string, targetUserId: string) {
    await this.ensureUserSettingsForAllUsers();

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        settings: true,
      },
    });

    if (!user) {
      return null;
    }

    const existingFollow = await this.prisma.userFollow.findUnique({
      where: {
        followerId_followedId: {
          followerId: viewerId,
          followedId: targetUserId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!existingFollow) {
      await this.prisma.userFollow.create({
        data: {
          followedId: targetUserId,
          followerId: viewerId,
        },
      });
    }

    return {
      ...(await this.getUserRelationshipContext(viewerId, user)),
      created: !existingFollow,
    };
  }

  async unfollowUser(viewerId: string, targetUserId: string) {
    await this.prisma.userFollow.deleteMany({
      where: {
        followedId: targetUserId,
        followerId: viewerId,
      },
    });

    await this.ensureUserSettingsForAllUsers();

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        settings: true,
      },
    });

    if (!user) {
      return null;
    }

    return this.getUserRelationshipContext(viewerId, user);
  }

  async listFollowing(userId: string, input: PaginationInput) {
    const where = { followerId: userId };
    const [rows, total] = await Promise.all([
      this.prisma.userFollow.findMany({
        where,
        include: {
          followed: {
            select: {
              avatarUrl: true,
              city: true,
              displayName: true,
              id: true,
              username: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: input.offset,
        take: input.limit,
      }),
      this.prisma.userFollow.count({ where }),
    ]);

    return {
      total,
      users: rows.map((row) => row.followed),
    };
  }

  async listFollowers(userId: string, input: PaginationInput) {
    const where = { followedId: userId };
    const [rows, total] = await Promise.all([
      this.prisma.userFollow.findMany({
        where,
        include: {
          follower: {
            select: {
              avatarUrl: true,
              city: true,
              displayName: true,
              id: true,
              username: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: input.offset,
        take: input.limit,
      }),
      this.prisma.userFollow.count({ where }),
    ]);

    return {
      total,
      users: rows.map((row) => row.follower),
    };
  }

  async getSocialSettings(userId: string) {
    await this.ensureUserSettingsForAllUsers();

    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    return normalizeSettings(settings);
  }

  async updateSocialSettings(
    userId: string,
    input: Partial<SocialSettingsView>,
  ) {
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: {
        ...(input.activityVisibility !== undefined
          ? { activityVisibility: input.activityVisibility }
          : {}),
        ...(input.diaryVisibility !== undefined
          ? { diaryVisibility: input.diaryVisibility }
          : {}),
        ...(input.groupInvitePolicy !== undefined
          ? { groupInvitePolicy: input.groupInvitePolicy }
          : {}),
      },
      create: {
        activityVisibility:
          input.activityVisibility ?? DEFAULT_SOCIAL_SETTINGS.activityVisibility,
        diaryVisibility:
          input.diaryVisibility ?? DEFAULT_SOCIAL_SETTINGS.diaryVisibility,
        groupInvitePolicy:
          input.groupInvitePolicy ?? DEFAULT_SOCIAL_SETTINGS.groupInvitePolicy,
        userId,
      },
    });

    return normalizeSettings(settings);
  }

  async getProfileStats(userId: string): Promise<UserStats> {
    const [visitCount, savedCount, followingCount, followersCount] =
      await Promise.all([
        this.prisma.visit.count({ where: { userId } }),
        this.prisma.placeSave.count({ where: { userId } }),
        this.prisma.userFollow.count({ where: { followerId: userId } }),
        this.prisma.userFollow.count({ where: { followedId: userId } }),
      ]);

    return {
      followersCount,
      followingCount,
      savedCount,
      visitCount,
    };
  }

  async getUserTastePreferenceIds(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tastePreferenceIds: true,
      },
    });
  }

  async updateUserTastePreferenceIds(userId: string, tastePreferenceIds: string[]) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        tastePreferenceIds,
      },
      select: {
        id: true,
        tastePreferenceIds: true,
      },
    });
  }

  async createVisit(input: {
    note: string;
    noiseLevel?: number;
    orderedItems?: string;
    placeId: string;
    photoUrls: string[];
    priceTier?: number;
    rating: number;
    tags: string[];
    userId: string;
    visitedAt: string;
    waitLevel?: number;
    wifiQuality?: number;
    wouldReturn?: "yes" | "maybe" | "no";
  }) {
    return this.prisma.visit.create({
      data: {
        note: input.note,
        noiseLevel: input.noiseLevel ?? null,
        orderedItems: input.orderedItems ?? null,
        photoUrls: input.photoUrls,
        placeId: input.placeId,
        priceTier: input.priceTier ?? null,
        rating: input.rating,
        tags: input.tags,
        userId: input.userId,
        visitedAt: new Date(input.visitedAt),
        waitLevel: input.waitLevel ?? null,
        wifiQuality: input.wifiQuality ?? null,
        wouldReturn: input.wouldReturn ?? null,
      },
      include: visitInclude,
    });
  }

  async listVisitsByUser(userId: string, input: PaginationInput) {
    const where = { userId };
    const [visits, total] = await Promise.all([
      this.prisma.visit.findMany({
        where,
        include: visitInclude,
        orderBy: [{ visitedAt: "desc" }, { createdAt: "desc" }],
        skip: input.offset,
        take: input.limit,
      }),
      this.prisma.visit.count({ where }),
    ]);

    return { total, visits };
  }

  async listFeed(userId: string, input: FeedInput) {
    await this.ensureUserSettingsForAllUsers();

    switch (input.mode) {
      case "city":
        return this.listCityFeed(userId, input);
      case "nearby":
        return this.listNearbyFeed(userId, input);
      case "now":
        return this.listNowFeed(userId, input);
      default:
        return this.listNetworkFeed(userId, input);
    }
  }

  async listSavedPlaces(userId: string, input: PaginationInput) {
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.placeSave.findMany({
        where,
        include: {
          place: true,
        },
        orderBy: { createdAt: "desc" },
        skip: input.offset,
        take: input.limit,
      }),
      this.prisma.placeSave.count({ where }),
    ]);

    return { rows, total };
  }

  async isPlaceSaved(userId: string, placeId: string) {
    const row = await this.prisma.placeSave.findUnique({
      where: {
        userId_placeId: {
          placeId,
          userId,
        },
      },
    });

    return Boolean(row);
  }

  async savePlace(userId: string, placeId: string) {
    return this.prisma.placeSave.upsert({
      where: {
        userId_placeId: {
          placeId,
          userId,
        },
      },
      update: {},
      create: {
        placeId,
        userId,
      },
      include: {
        place: true,
      },
    });
  }

  async unsavePlace(userId: string, placeId: string) {
    await this.prisma.placeSave.deleteMany({
      where: {
        placeId,
        userId,
      },
    });
  }

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
    name: string;
  }) {
    await this.ensureUserSettingsForAllUsers();

    const dedupedMemberIds = Array.from(
      new Set(input.memberIds.filter((memberId) => memberId !== input.createdById)),
    );

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
    const relationships = await this.getRelationshipMaps(
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
      },
      include: groupInclude,
    });

    return {
      group,
      invitedUserIds: allowedMemberIds,
      rejectedInvites,
    };
  }

  async addGroupMembers(input: {
    groupId: string;
    invitedById: string;
    memberIds: string[];
  }) {
    await this.ensureUserSettingsForAllUsers();

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
    const relationships = await this.getRelationshipMaps(
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

  async findGroupMembership(groupId: string, userId: string) {
    return this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });
  }

  async joinGroupByCode(userId: string, inviteCode: string) {
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

  async findGroupEventById(groupId: string, eventId: string) {
    return this.prisma.groupEvent.findFirst({
      where: {
        groupId,
        id: eventId,
      },
      include: groupEventInclude,
    });
  }

  async createGroupEvent(input: {
    date: string;
    groupId: string;
    placeId: string;
    proposedById: string;
  }) {
    return this.prisma.groupEvent.create({
      data: {
        date: new Date(input.date),
        groupId: input.groupId,
        placeId: input.placeId,
        proposedById: input.proposedById,
      },
      include: groupEventInclude,
    });
  }

  async setGroupEventRsvp(input: {
    eventId: string;
    rsvp: "going" | "maybe" | "declined" | "none";
    userId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.groupEventRsvp.findUnique({
        where: {
          eventId_userId: {
            eventId: input.eventId,
            userId: input.userId,
          },
        },
        select: {
          rsvp: true,
        },
      });

      const previousRsvp = existing?.rsvp ?? "none";
      const changed = previousRsvp !== input.rsvp;

      if (changed) {
        if (input.rsvp === "none") {
          await tx.groupEventRsvp.deleteMany({
            where: {
              eventId: input.eventId,
              userId: input.userId,
            },
          });
        } else {
          await tx.groupEventRsvp.upsert({
            where: {
              eventId_userId: {
                eventId: input.eventId,
                userId: input.userId,
              },
            },
            update: {
              rsvp: input.rsvp as GroupEventRsvpStatus,
            },
            create: {
              eventId: input.eventId,
              rsvp: input.rsvp as GroupEventRsvpStatus,
              userId: input.userId,
            },
          });
        }
      }

      const event = await tx.groupEvent.findUnique({
        where: { id: input.eventId },
        select: { groupId: true },
      });

      if (!event) {
        return null;
      }

      const group = await tx.group.findUnique({
        where: { id: event.groupId },
        include: groupInclude,
      });

      if (!group) {
        return null;
      }

      return {
        changed,
        currentRsvp: input.rsvp,
        group,
        previousRsvp,
      };
    });
  }

  async listDiariesByUser(userId: string) {
    return this.prisma.diary.findMany({
      where: { createdById: userId },
      include: diaryInclude,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  async createDiary(input: {
    coverImageUrl?: string;
    createdById: string;
    description?: string;
    editorialReason?: string;
    intro?: string;
    name: string;
    publishedAt?: string;
    visibility?: "private" | "unlisted" | "public";
  }) {
    return this.prisma.diary.create({
      data: {
        coverImageUrl: input.coverImageUrl ?? null,
        createdById: input.createdById,
        description: input.description ?? null,
        editorialReason: input.editorialReason ?? null,
        intro: input.intro ?? null,
        name: input.name,
        publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
        visibility: input.visibility ?? GuideVisibility.private,
      },
      include: diaryInclude,
    });
  }

  async searchPublicDiaries(input: PaginationInput & { q: string }) {
    const normalizedQuery = input.q.trim();
    const where: Prisma.DiaryWhereInput = {
      visibility: GuideVisibility.public,
      OR: [
        { name: { contains: normalizedQuery, mode: "insensitive" } },
        { description: { contains: normalizedQuery, mode: "insensitive" } },
        { intro: { contains: normalizedQuery, mode: "insensitive" } },
      ],
    };

    const [diaries, total] = await Promise.all([
      this.prisma.diary.findMany({
        where,
        include: diaryInclude,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      }),
      this.prisma.diary.count({ where }),
    ]);

    return { diaries, total };
  }

  async findDiaryById(diaryId: string) {
    return this.prisma.diary.findUnique({
      where: { id: diaryId },
      include: diaryInclude,
    });
  }

  async addPlaceToDiary(
    diaryId: string,
    placeId: string,
    input?: { note?: string; position?: number },
  ) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.diaryPlace.findUnique({
        where: {
          diaryId_placeId: {
            diaryId,
            placeId,
          },
        },
      });

      const nextPosition =
        input?.position ??
        existing?.position ??
        (((await tx.diaryPlace.aggregate({
          where: { diaryId },
          _max: { position: true },
        }))._max.position ?? -1) + 1);

      await tx.diaryPlace.upsert({
        where: {
          diaryId_placeId: {
            diaryId,
            placeId,
          },
        },
        update: {
          note: input?.note ?? existing?.note ?? null,
          position: nextPosition,
        },
        create: {
          diaryId,
          note: input?.note ?? null,
          placeId,
          position: nextPosition,
        },
      });
    });

    return this.findDiaryById(diaryId);
  }

  async getPlaceSocialContext(viewerId: string, placeId: string) {
    await this.ensureUserSettingsForAllUsers();

    const [followingIds, visits, diaryRows] = await Promise.all([
      this.listFollowingIds(viewerId),
      this.prisma.visit.findMany({
        where: { placeId },
        include: visitInclude,
        orderBy: [{ visitedAt: "desc" }, { createdAt: "desc" }],
        take: 100,
      }),
      this.prisma.diaryPlace.findMany({
        where: {
          placeId,
          diary: {
            OR: [
              { createdById: viewerId },
              { visibility: GuideVisibility.public },
            ],
          },
        },
        include: {
          diary: true,
        },
        orderBy: [{ diary: { publishedAt: "desc" } }, { createdAt: "desc" }],
        take: 20,
      }),
    ]);

    const followingSet = new Set(followingIds);
    const visibleVisits = visits.filter((visit) =>
      isVisitVisibleToViewer(
        viewerId,
        visit.userId,
        normalizeSettings(visit.user.settings),
        followingSet.has(visit.userId),
      ),
    );

    const followersVisited = visibleVisits
      .filter((visit) => followingSet.has(visit.userId))
      .reduce<Array<{ userId: string; displayName: string }>>((acc, visit) => {
        if (acc.some((entry) => entry.userId === visit.userId)) {
          return acc;
        }

        acc.push({
          displayName: visit.user.displayName || visit.user.username,
          userId: visit.userId,
        });
        return acc;
      }, [])
      .slice(0, 6);

    const communityTags = Array.from(
      visibleVisits
        .flatMap((visit) => visit.tags)
        .reduce((counts, tag) => {
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
          return counts;
        }, new Map<string, number>())
        .entries(),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag]) => tag);

    const userPhotoUrls = visibleVisits
      .flatMap((visit) => visit.photoUrls)
      .filter(Boolean)
      .slice(0, 12);

    const diaryAppearances = diaryRows.map((row) => ({
      diaryId: row.diaryId,
      name: row.diary.name,
      visibility: row.diary.visibility,
    }));

    return {
      bestMoments: buildBestMoments(visibleVisits),
      communityTags,
      diaryAppearances,
      followersVisited,
      guideAppearances: diaryAppearances,
      userPhotoUrls,
    };
  }

  private async listNetworkFeed(userId: string, input: PaginationInput) {
    const followingRows = await this.prisma.userFollow.findMany({
      where: {
        followerId: userId,
      },
      select: {
        followedId: true,
      },
    });

    const followedIds = followingRows.map((row) => row.followedId);

    if (followedIds.length === 0) {
      return {
        total: 0,
        visits: [],
      };
    }

    const where: Prisma.VisitWhereInput = {
      user: {
        id: { in: followedIds },
        settings: {
          is: {
            OR: [
              { activityVisibility: ContentVisibility.public },
              { activityVisibility: ContentVisibility.followers },
            ],
          },
        },
      },
    };

    const [visits, total] = await Promise.all([
      this.prisma.visit.findMany({
        where,
        include: visitInclude,
        orderBy: [{ visitedAt: "desc" }, { createdAt: "desc" }],
        skip: input.offset,
        take: input.limit,
      }),
      this.prisma.visit.count({ where }),
    ]);

    return { total, visits };
  }

  private async listNearbyFeed(userId: string, input: FeedInput) {
    const viewerLocation =
      typeof input.lat === "number" && typeof input.lng === "number"
        ? { lat: input.lat, lng: input.lng }
        : await this.getViewerLocation(userId);

    if (!viewerLocation) {
      return {
        total: 0,
        visits: [],
      };
    }

    const nearby = rankCandidatesWithRotation(
      (await this.listVisibleRecentVisits(userId, 220))
        .filter(
          (visit) =>
            typeof visit.place.lat === "number" &&
            typeof visit.place.lng === "number",
        )
        .filter((visit) => {
          const distance = distanceInMeters(
            viewerLocation.lat,
            viewerLocation.lng,
            visit.place.lat!,
            visit.place.lng!,
          );

          return distance <= 3500;
        })
        .map((visit) => ({
          baseScore: buildNearbyScore(viewerLocation, visit),
          id: visit.id,
          item: visit,
        })),
      {
        jitterRatio: 0.07,
        maxJitter: 12,
        seed: buildRankingSeed(
          userId,
          "feed-nearby",
          viewerLocation.lat,
          viewerLocation.lng,
        ),
        topWindow: Math.max(input.limit * 4, 24),
      },
    );

    return {
      total: nearby.length,
      visits: nearby
        .slice(input.offset, input.offset + input.limit)
        .map((entry) => entry.item),
    };
  }

  private async listCityFeed(userId: string, input: FeedInput) {
    const targetCityId =
      typeof input.cityIdOverride === "string" && input.cityIdOverride.length > 0
        ? input.cityIdOverride
        : (
            await this.prisma.user.findUnique({
              where: { id: userId },
              select: { cityId: true },
            })
          )?.cityId;

    if (!targetCityId) {
      return {
        total: 0,
        visits: [],
      };
    }

    const where: Prisma.VisitWhereInput = {
      userId: {
        not: userId,
      },
      place: {
        cityId: targetCityId,
      },
      user: {
        settings: {
          is: {
            activityVisibility: ContentVisibility.public,
          },
        },
      },
    };

    const [visits, total] = await Promise.all([
      this.prisma.visit.findMany({
        where,
        include: visitInclude,
        orderBy: [{ visitedAt: "desc" }, { createdAt: "desc" }],
        skip: input.offset,
        take: input.limit,
      }),
      this.prisma.visit.count({ where }),
    ]);

    return { total, visits };
  }

  private async listNowFeed(userId: string, input: FeedInput) {
    const viewerLocation =
      typeof input.lat === "number" && typeof input.lng === "number"
        ? { lat: input.lat, lng: input.lng }
        : await this.getViewerLocation(userId);

    const ranked = rankCandidatesWithRotation(
      (await this.listVisibleRecentVisits(userId, 220))
        .filter((visit) => {
          if (!viewerLocation) {
            return true;
          }

          if (
            typeof visit.place.lat !== "number" ||
            typeof visit.place.lng !== "number"
          ) {
            return false;
          }

          return (
            distanceInMeters(
              viewerLocation.lat,
              viewerLocation.lng,
              visit.place.lat!,
              visit.place.lng!,
            ) <= 6000
          );
        })
        .map((visit) => ({
          baseScore: buildNowScore(new Date(), visit),
          id: visit.id,
          item: visit,
        })),
      {
        bucketHours: 1,
        jitterRatio: 0.09,
        maxJitter: 10,
        seed: viewerLocation
          ? buildRankingSeed(userId, "feed-now", viewerLocation.lat, viewerLocation.lng)
          : `${userId}:feed-now`,
        topWindow: Math.max(input.limit * 4, 24),
      },
    );

    return {
      total: ranked.length,
      visits: ranked
        .slice(input.offset, input.offset + input.limit)
        .map((entry) => entry.item),
    };
  }

  private async listVisibleRecentVisits(userId: string, take: number) {
    const followingIds = await this.listFollowingIds(userId);
    const followingSet = new Set(followingIds);

    const visits = await this.prisma.visit.findMany({
      include: visitInclude,
      orderBy: [{ visitedAt: "desc" }, { createdAt: "desc" }],
      take,
    });

    return visits.filter((visit) =>
      isVisitVisibleToViewer(
        userId,
        visit.userId,
        normalizeSettings(visit.user.settings),
        followingSet.has(visit.userId),
      ),
    );
  }

  /**
   * Ubicación guardada en el perfil (ciudad + coordenadas). Usada por feed y places si el cliente no envía lat/lng.
   */
  async getUserCoordinates(
    userId: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        lat: true,
        lng: true,
      },
    });

    if (typeof user?.lat !== "number" || typeof user.lng !== "number") {
      return null;
    }

    return {
      lat: user.lat,
      lng: user.lng,
    };
  }

  async listFollowerIds(userId: string) {
    const rows = await this.prisma.userFollow.findMany({
      where: { followedId: userId },
      select: { followerId: true },
    });

    return rows.map((row) => row.followerId);
  }

  private async getViewerLocation(userId: string) {
    return this.getUserCoordinates(userId);
  }

  private async listFollowingIds(userId: string) {
    const rows = await this.prisma.userFollow.findMany({
      where: { followerId: userId },
      select: { followedId: true },
    });

    return rows.map((row) => row.followedId);
  }

  private async getUserRelationshipContext(
    viewerId: string,
    targetUser: UserWithSettings,
  ) {
    const relationships = await this.getRelationshipMaps(viewerId, [
      targetUser.id,
    ]);
    const social = buildSocialState(targetUser.id, relationships);
    const settings = normalizeSettings(targetUser.settings);

    return {
      permissions: buildPermissions(viewerId, targetUser.id, settings, social),
      settings,
      social,
    };
  }

  private async getRelationshipMaps(viewerId: string, userIds: string[]) {
    const distinctUserIds = Array.from(new Set(userIds.filter(Boolean)));

    if (distinctUserIds.length === 0) {
      return {
        followersOfViewer: new Set<string>(),
        followingByViewer: new Set<string>(),
      };
    }

    const rows = await this.prisma.userFollow.findMany({
      where: {
        OR: [
          {
            followerId: viewerId,
            followedId: {
              in: distinctUserIds,
            },
          },
          {
            followerId: {
              in: distinctUserIds,
            },
            followedId: viewerId,
          },
        ],
      },
      select: {
        followedId: true,
        followerId: true,
      },
    });

    const followingByViewer = new Set<string>();
    const followersOfViewer = new Set<string>();

    for (const row of rows) {
      if (row.followerId === viewerId) {
        followingByViewer.add(row.followedId);
      }

      if (row.followedId === viewerId) {
        followersOfViewer.add(row.followerId);
      }
    }

    return {
      followersOfViewer,
      followingByViewer,
    };
  }

  private async ensureUserSettingsForAllUsers() {
    const usersWithoutSettings = await this.prisma.user.findMany({
      where: {
        settings: {
          is: null,
        },
      },
      select: {
        id: true,
      },
    });

    if (usersWithoutSettings.length === 0) {
      return;
    }

    await this.prisma.userSettings.createMany({
      data: usersWithoutSettings.map((user) => ({
        userId: user.id,
      })),
      skipDuplicates: true,
    });
  }
}

function normalizeSettings(settings: UserSettings | null | undefined): SocialSettingsView {
  return {
    activityVisibility:
      settings?.activityVisibility ?? DEFAULT_SOCIAL_SETTINGS.activityVisibility,
    diaryVisibility:
      settings?.diaryVisibility ?? DEFAULT_SOCIAL_SETTINGS.diaryVisibility,
    groupInvitePolicy:
      settings?.groupInvitePolicy ?? DEFAULT_SOCIAL_SETTINGS.groupInvitePolicy,
  };
}

function buildSocialState(
  userId: string,
  relationships: {
    followersOfViewer: Set<string>;
    followingByViewer: Set<string>;
  },
): SocialState {
  const following = relationships.followingByViewer.has(userId);
  const followsYou = relationships.followersOfViewer.has(userId);

  return {
    followsYou,
    following,
    mutual: following && followsYou,
  };
}

function buildPermissions(
  viewerId: string,
  targetUserId: string,
  settings: SocialSettingsView,
  social: SocialState,
): UserPermissions {
  if (viewerId === targetUserId) {
    return {
      canInviteToGroup: false,
      canViewActivity: true,
      canViewDiaries: true,
    };
  }

  return {
    canInviteToGroup: canInviteToGroup(settings.groupInvitePolicy, social),
    canViewActivity: canViewContent(settings.activityVisibility, social.following),
    canViewDiaries: canViewContent(settings.diaryVisibility, social.following),
  };
}

function canViewContent(
  visibility: ContentVisibility,
  viewerFollowsTarget: boolean,
) {
  if (visibility === ContentVisibility.public) {
    return true;
  }

  if (visibility === ContentVisibility.followers) {
    return viewerFollowsTarget;
  }

  return false;
}

function canInviteToGroup(
  policy: GroupInvitePolicy,
  social: SocialState,
) {
  if (policy === GroupInvitePolicy.anyone) {
    return true;
  }

  if (policy === GroupInvitePolicy.following_only) {
    return social.followsYou;
  }

  return social.mutual;
}

function isVisitVisibleToViewer(
  viewerId: string,
  visitUserId: string,
  settings: SocialSettingsView,
  viewerFollowsTarget: boolean,
) {
  if (viewerId === visitUserId) {
    return true;
  }

  return canViewContent(settings.activityVisibility, viewerFollowsTarget);
}

function buildNearbyScore(
  viewerLocation: { lat: number; lng: number },
  visit: VisitWithRelations,
) {
  const distance =
    typeof visit.place.lat === "number" && typeof visit.place.lng === "number"
      ? distanceInMeters(
          viewerLocation.lat,
          viewerLocation.lng,
          visit.place.lat,
          visit.place.lng,
        )
      : 5000;

  const ratingScore = visit.rating * 12;
  const returnScore =
    visit.wouldReturn === "yes" ? 20 : visit.wouldReturn === "maybe" ? 8 : 0;
  const recencyPenalty =
    (Date.now() - visit.visitedAt.getTime()) / (1000 * 60 * 60 * 24 * 5);

  return 200 - distance / 25 + ratingScore + returnScore - recencyPenalty;
}

function buildNowScore(now: Date, visit: VisitWithRelations) {
  const hour = now.getHours();
  const isSunday = now.getDay() === 0;
  const tags = new Set(visit.tags);

  let score = visit.rating * 10;

  if (visit.wouldReturn === "yes") {
    score += 18;
  } else if (visit.wouldReturn === "maybe") {
    score += 8;
  }

  if (hour >= 8 && hour <= 17 && (visit.wifiQuality ?? 0) >= 4) {
    score += 18;
  }

  if (hour >= 8 && hour <= 12 && tags.has("brunch")) {
    score += 16;
  }

  if (isSunday && tags.has("brunch")) {
    score += 20;
  }

  if ((visit.waitLevel ?? 5) <= 2) {
    score += 8;
  }

  if ((visit.noiseLevel ?? 5) <= 2) {
    score += 6;
  }

  return score;
}

function buildRankingSeed(
  userId: string,
  scope: string,
  lat?: number,
  lng?: number,
) {
  const latPart = typeof lat === "number" ? lat.toFixed(2) : "na";
  const lngPart = typeof lng === "number" ? lng.toFixed(2) : "na";

  return `${userId}:${scope}:${latPart}:${lngPart}`;
}

function buildBestMoments(visits: VisitWithRelations[]) {
  const lines: string[] = [];

  if (visits.some((visit) => (visit.wifiQuality ?? 0) >= 4)) {
    lines.push("Bueno para trabajar con cafe y wifi estable");
  }

  if (visits.some((visit) => (visit.noiseLevel ?? 5) <= 2)) {
    lines.push("Tranqui para leer o conversar sin apuro");
  }

  if (visits.some((visit) => (visit.waitLevel ?? 5) <= 2)) {
    lines.push("Suele funcionar bien para una salida rapida");
  }

  if (visits.some((visit) => visit.tags.includes("brunch"))) {
    lines.push("Aparece seguido en planes de brunch");
  }

  if (visits.filter((visit) => visit.wouldReturn === "yes").length >= 2) {
    lines.push("La comunidad volveria por cafe y experiencia");
  }

  return lines.slice(0, 4);
}
