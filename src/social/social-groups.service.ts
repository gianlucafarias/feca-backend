import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { GroupVisibility } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import {
  serializeGroup,
  serializePublicFriendGroupPlan,
} from "../lib/api-presenters";
import { SocialRepository } from "../infrastructure/repositories/social.repository";
import { PaginationQueryDto } from "../common/dto/pagination-query.dto";
import { AddGroupMembersDto } from "./dto/add-group-members.dto";
import { AddGroupEventDto } from "./dto/add-group-event.dto";
import { CreateGroupDto } from "./dto/create-group.dto";
import { JoinGroupDto } from "./dto/join-group.dto";
import { UpdateGroupDto } from "./dto/update-group.dto";
import { UpdateGroupEventRsvpDto } from "./dto/update-group-event-rsvp.dto";
import { NotificationsService } from "./notifications.service";
import { SocialGroupEventsService } from "./social-group-events.service";
import {
  assertNoInvitePolicyRejections,
  buildGroupAdminRecipientIds,
  generateInviteCode,
  pickNextEventForPublicFriendList,
} from "./social.helpers";

@Injectable()
export class SocialGroupsService {
  constructor(
    private readonly socialRepository: SocialRepository,
    private readonly notificationsService: NotificationsService,
    private readonly eventsService: SocialGroupEventsService,
  ) {}

  async listMyGroups(userId: string) {
    const groups = await this.socialRepository.listGroupsByUser(userId);

    return {
      groups: groups.map((group) =>
        serializeGroup(group, { viewerUserId: userId }),
      ),
      total: groups.length,
    };
  }

  async createGroup(userId: string, body: CreateGroupDto) {
    try {
      const result = await this.socialRepository.createGroup({
        createdById: userId,
        inviteCode: generateInviteCode(),
        memberIds: body.memberIds,
        memberProposalInteraction: body.memberProposalInteraction,
        name: body.name.trim(),
        placeProposalPolicy: body.placeProposalPolicy,
        visibility: body.visibility,
      });

      assertNoInvitePolicyRejections(result.rejectedInvites);

      if (result.invitedUserIds.length > 0) {
        await this.notificationsService.publish({
          actorId: userId,
          entity: {
            id: result.group.id,
            type: "group",
          },
          payload: {
            groupId: result.group.id,
            groupName: result.group.name,
            inviteCode: result.group.inviteCode,
          },
          recipientIds: result.invitedUserIds,
          type: "group_invite",
        });
      }

      return {
        group: serializeGroup(result.group, { viewerUserId: userId }),
        rejectedInvites: result.rejectedInvites,
      };
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("No se pudo generar un código de invitación");
      }

      throw error;
    }
  }

  async joinGroupByCode(userId: string, body: JoinGroupDto) {
    const result = await this.socialRepository.joinGroupByCode(userId, body.code);

    if (!result) {
      throw new NotFoundException("Group not found");
    }

    if (result.joinedNow) {
      await this.notificationsService.publish({
        actorId: userId,
        entity: {
          id: result.group.id,
          type: "group",
        },
        payload: {
          groupId: result.group.id,
          groupName: result.group.name,
        },
        recipientIds: buildGroupAdminRecipientIds(result.group, [userId]),
        type: "group_joined",
      });
    }

    return {
      group: serializeGroup(result.group, { viewerUserId: userId }),
    };
  }

  async getGroup(userId: string, groupId: string) {
    const group = await this.socialRepository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    const membership = await this.socialRepository.findGroupMembership(
      groupId,
      userId,
    );

    if (
      membership &&
      (membership.status === "accepted" || membership.status === "pending")
    ) {
      return {
        group: serializeGroup(group, { viewerUserId: userId }),
      };
    }

    if (group.visibility === GroupVisibility.private) {
      throw new NotFoundException("Group not found");
    }

    const followedIds = new Set(
      await this.socialRepository.listFollowedUserIds(userId),
    );

    const followsCreator = followedIds.has(group.createdById);
    const followsActiveMember = group.members.some(
      (member) =>
        member.status === "accepted" && followedIds.has(member.userId),
    );

    if (!followsCreator && !followsActiveMember) {
      throw new NotFoundException("Group not found");
    }

    return {
      group: serializeGroup(group, {
        publicPreview: true,
        viewerUserId: userId,
      }),
    };
  }

  async addGroupMembers(
    userId: string,
    groupId: string,
    body: AddGroupMembersDto,
  ) {
    const group = await this.socialRepository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    await this.assertGroupAdminAccess(userId, groupId);

    const result = await this.socialRepository.addGroupMembers({
      groupId,
      invitedById: userId,
      memberIds: body.memberIds,
    });

    if (!result) {
      throw new NotFoundException("Group not found");
    }

    assertNoInvitePolicyRejections(result.rejectedInvites);

    if (result.invitedUserIds.length > 0) {
      await this.notificationsService.publish({
        actorId: userId,
        entity: {
          id: result.group.id,
          type: "group",
        },
        payload: {
          groupId: result.group.id,
          groupName: result.group.name,
          inviteCode: result.group.inviteCode,
        },
        recipientIds: result.invitedUserIds,
        type: "group_invite",
      });
    }

    return {
      group: serializeGroup(result.group, { viewerUserId: userId }),
      rejectedInvites: result.rejectedInvites,
    };
  }

  async updateGroup(userId: string, groupId: string, body: UpdateGroupDto) {
    const group = await this.socialRepository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    if (
      body.name === undefined &&
      body.visibility === undefined &&
      body.placeProposalPolicy === undefined &&
      body.memberProposalInteraction === undefined
    ) {
      throw new BadRequestException("No hay campos para actualizar");
    }

    await this.assertGroupAdminAccess(userId, groupId);

    const updated = await this.socialRepository.updateGroup({
      groupId,
      memberProposalInteraction: body.memberProposalInteraction,
      name: body.name,
      placeProposalPolicy: body.placeProposalPolicy,
      visibility: body.visibility,
    });

    return {
      group: serializeGroup(updated, { viewerUserId: userId }),
    };
  }

  async leaveGroup(userId: string, groupId: string) {
    const group = await this.socialRepository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    const result = await this.socialRepository.leaveGroup(groupId, userId);

    if (!result) {
      throw new NotFoundException("No formas parte de este plan");
    }

    if (result.kind === "owner_cannot_leave") {
      throw new ForbiddenException(
        "El creador no puede abandonar el plan sin transferir la administracion.",
      );
    }

    return {
      group: serializeGroup(result.group, { viewerUserId: userId }),
    };
  }

  async listPublicFriendGroupPlans(userId: string, query: PaginationQueryDto) {
    const { groups, total } =
      await this.socialRepository.listPublicFriendGroupPlanCandidates({
        excludeMember: true,
        viewerId: userId,
      });

    const followedIds = new Set(
      await this.socialRepository.listFollowedUserIds(userId),
    );

    type CandidateRow = (typeof groups)[number];

    const decorated = groups.map((group: CandidateRow) => {
      const next = pickNextEventForPublicFriendList(group.events);

      return {
        group,
        next,
        sortKey: next ? next.date.getTime() : null,
      };
    });

    decorated.sort((left, right) => {
      if (left.sortKey === null && right.sortKey === null) {
        return (
          left.group.name.localeCompare(right.group.name) ||
          left.group.id.localeCompare(right.group.id)
        );
      }

      if (left.sortKey === null) {
        return 1;
      }

      if (right.sortKey === null) {
        return -1;
      }

      if (left.sortKey !== right.sortKey) {
        return left.sortKey - right.sortKey;
      }

      return (
        left.group.name.localeCompare(right.group.name) ||
        left.group.id.localeCompare(right.group.id)
      );
    });

    const page = decorated.slice(query.offset, query.offset + query.limit);

    const plans = page.map((row) =>
      serializePublicFriendGroupPlan(row.group, {
        followedMemberIds: followedIds,
        nextEvent: row.next,
        viewerId: userId,
      }),
    );

    return {
      plans,
      total,
    };
  }

  addGroupEvent(userId: string, groupId: string, body: AddGroupEventDto) {
    return this.eventsService.addGroupEvent(userId, groupId, body);
  }

  setGroupEventRsvp(
    userId: string,
    groupId: string,
    eventId: string,
    body: UpdateGroupEventRsvpDto,
  ) {
    return this.eventsService.setGroupEventRsvp(userId, groupId, eventId, body);
  }

  private async assertGroupAdminAccess(userId: string, groupId: string) {
    const membership = await this.socialRepository.findGroupMembership(groupId, userId);

    if (!membership) {
      throw new ForbiddenException({
        code: "GROUP_ACTION_REQUIRES_MEMBERSHIP",
        message: "Tenés que ser miembro del plan para realizar esta acción.",
      });
    }

    if (membership.status !== "accepted") {
      throw new ForbiddenException({
        code: "GROUP_ADMIN_REQUIRED",
        message: "Solo miembros activos pueden gestionar el plan.",
      });
    }

    if (membership.role !== "owner" && membership.role !== "admin") {
      throw new ForbiddenException({
        code: "GROUP_ADMIN_REQUIRED",
        message: "Solo el creador o un administrador puede gestionar el plan.",
      });
    }
  }
}
