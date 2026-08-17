import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  GroupEventStatus,
  GroupJoinPolicy,
  GroupMemberRole,
  GroupMemberStatus,
} from "@prisma/client";

import { PlacesRepository } from "../infrastructure/repositories/places.repository";
import {
  PlansRepository,
  type PlanMessageWithAuthor,
  type PlanWithRelations,
} from "../infrastructure/repositories/plans.repository";
import { SocialRepository } from "../infrastructure/repositories/social.repository";
import { serializePlaceSummary } from "../lib/api-presenters";
import { serializeUserPublic } from "../lib/presenters/user.presenter";
import { PlacesService } from "../places/places.service";
import { NotificationsService } from "./notifications.service";
import { SocialGroupEventsService } from "./social-group-events.service";
import { generateInviteCode } from "./social.helpers";
import { CreatePlanDto } from "./dto/create-plan.dto";
import { CreatePlanMessageDto } from "./dto/create-plan-message.dto";
import { DiscoverPlansQueryDto } from "./dto/discover-plans.query.dto";
import { ListPlanMessagesQueryDto } from "./dto/list-plan-messages.query.dto";
import { UpdatePlanDto } from "./dto/update-plan.dto";
import { UpdatePlanRsvpDto } from "./dto/update-plan-rsvp.dto";

const MAX_DISCOVERY_LIMIT = 50;

@Injectable()
export class PlansService {
  constructor(
    private readonly plansRepository: PlansRepository,
    private readonly socialRepository: SocialRepository,
    private readonly placesRepository: PlacesRepository,
    private readonly placesService: PlacesService,
    private readonly notificationsService: NotificationsService,
    private readonly eventsService: SocialGroupEventsService,
  ) {}

  async discover(userId: string, query: DiscoverPlansQueryDto) {
    this.assertBounds(query);
    const now = new Date();
    const requestedFrom = query.fromDate || query.from
      ? new Date(query.fromDate || query.from!)
      : now;
    const fromDate = requestedFrom > now ? requestedFrom : now;
    const rows = await this.plansRepository.listDiscoverablePlans({
      city: query.city,
      cityGooglePlaceId: query.cityGooglePlaceId,
      fromDate,
      maxLat: query.maxLat,
      maxLng: query.maxLng,
      minLat: query.minLat,
      minLng: query.minLng,
      now,
      toDate: query.toDate || query.to
        ? parsePlanToDate(query.toDate || query.to!)
        : undefined,
    });
    const followedIds = new Set(
      await this.socialRepository.listFollowedUserIds(userId),
    );
    const cursor = query.cursor ? decodePlanCursor(query.cursor) : null;

    const decorated = rows
      .map((group) => ({
        group,
        event: group.events[0],
      }))
      .filter(
        (row): row is typeof row & { event: NonNullable<typeof row.event> } =>
          Boolean(row.event),
      )
      .sort((left, right) =>
        comparePlanCursor(
          { date: left.event.date, id: left.group.id },
          { date: right.event.date, id: right.group.id },
        ),
      )
      .filter((row) =>
        cursor
          ? comparePlanCursor(
              { date: row.event.date, id: row.group.id },
              cursor,
            ) > 0
          : true,
      );

    const limit = Math.min(query.limit ?? 20, MAX_DISCOVERY_LIMIT);
    const page = decorated.slice(0, limit);
    const hasMore = decorated.length > limit;

    return {
      nextCursor: hasMore
        ? encodePlanCursor({
            date: page[page.length - 1].event.date,
            id: page[page.length - 1].group.id,
          })
        : null,
      plans: page.map((row) =>
        serializePlan(
          row.group,
          userId,
          followedIds,
          row.group.members.some(
            (member) =>
              member.userId === userId && member.status === GroupMemberStatus.accepted,
          ),
          row.event,
        ),
      ),
    };
  }

  async create(userId: string, body: CreatePlanDto) {
    const place = await this.resolvePlace(body);
    const plan = await this.plansRepository.createPlan({
      createdById: userId,
      date: body.date,
      description: body.description,
      inviteCode: generateInviteCode(),
      joinPolicy: body.joinPolicy,
      name: body.name.trim(),
      placeId: place.id,
    });

    return {
      plan: serializePlan(
        plan,
        userId,
        new Set<string>(),
        true,
        plan.events[0],
      ),
    };
  }

  async get(userId: string, groupId: string) {
    const plan = await this.requirePlan(groupId);
    const membership = await this.plansRepository.findMembership(groupId, userId);
    const isPublic = plan.visibility === "public";

    if (!isPublic && !membership) {
      throw new NotFoundException("Plan not found");
    }

    if (!isPublic && membership?.status !== GroupMemberStatus.accepted) {
      throw new ForbiddenException({
        code: "PLAN_MEMBERSHIP_REQUIRED",
        message: "Aceptá la invitación o solicitud antes de ver este plan.",
      });
    }

    const followedIds = new Set(
      await this.socialRepository.listFollowedUserIds(userId),
    );
    return {
      plan: serializePlan(
        plan,
        userId,
        followedIds,
        membership?.status === GroupMemberStatus.accepted,
      ),
    };
  }

  async update(userId: string, groupId: string, body: UpdatePlanDto) {
    const plan = await this.requirePlan(groupId);
    await this.assertAdmin(userId, plan);
    if (
      body.name === undefined &&
      body.description === undefined &&
      body.joinPolicy === undefined &&
      body.date === undefined &&
      body.placeId === undefined &&
      body.googlePlaceId === undefined
    ) {
      throw new BadRequestException("No hay campos para actualizar");
    }

    const place =
      body.placeId !== undefined || body.googlePlaceId !== undefined
        ? await this.resolvePlace(body)
        : undefined;
    const event = nextEvent(plan) ?? plan.events[0];
    const updated = await this.plansRepository.updatePlan({
      date: body.date,
      description: body.description,
      eventId: event?.id,
      groupId,
      joinPolicy: body.joinPolicy,
      name: body.name,
      placeId: place?.id,
    });
    return { plan: serializePlan(updated, userId, new Set(), true) };
  }

  async join(userId: string, groupId: string) {
    const plan = await this.requirePlan(groupId);
    const result = await this.plansRepository.joinPlan(groupId, userId);
    if (!result) throw new NotFoundException("Plan not found");
    if (result.kind === "denied") {
      throw new ForbiddenException({
        code: "PLAN_INVITE_ONLY",
        message: "Este plan solo admite personas invitadas.",
      });
    }

    if (result.changed) {
      if (result.kind === "requested") {
        await this.notificationsService.publish({
          actorId: userId,
          entity: { id: groupId, type: "group" },
          payload: { groupId, groupName: plan.name },
          recipientIds: await this.adminIds(groupId, userId),
          type: "group_join_request",
        });
      } else {
        await this.notificationsService.publish({
          actorId: userId,
          entity: { id: groupId, type: "group" },
          payload: { groupId, groupName: plan.name },
          recipientIds: await this.adminIds(groupId, userId),
          type: "group_joined",
        });
      }
    }

    return await this.get(userId, groupId);
  }

  async leave(userId: string, groupId: string) {
    await this.requirePlan(groupId);
    const result = await this.plansRepository.leavePlan(groupId, userId);
    if (!result) throw new NotFoundException("No formas parte de este plan");
    if ("kind" in result && result.kind === "owner") {
      throw new ForbiddenException(
        "El creador no puede abandonar el plan sin transferir la administración.",
      );
    }
    return { left: true };
  }

  async listJoinRequests(userId: string, groupId: string) {
    const plan = await this.requirePlan(groupId);
    await this.assertAdmin(userId, plan);
    const requests = await this.plansRepository.listJoinRequests(groupId);
    return {
      requests: requests.map((request) => ({
        createdAt: request.createdAt.toISOString(),
        id: request.id,
        participationState: "requested" as const,
        user: serializeUserPublic(request.user),
      })),
    };
  }

  async decideJoinRequest(
    userId: string,
    groupId: string,
    membershipId: string,
    approve: boolean,
  ) {
    const plan = await this.requirePlan(groupId);
    await this.assertAdmin(userId, plan);
    const request = await this.plansRepository.listJoinRequests(groupId);
    const target = request.find((item) => item.id === membershipId);
    if (!target) throw new NotFoundException("Join request not found");
    const updated = await this.plansRepository.decideJoinRequest({
      approve,
      groupId,
      membershipId,
    });
    if (updated.count === 0) throw new NotFoundException("Join request not found");

    await this.notificationsService.publish({
      actorId: userId,
      entity: { id: groupId, type: "group" },
      payload: { groupId, groupName: plan.name },
      recipientIds: [target.userId],
      type: approve ? "group_join_approved" : "group_join_rejected",
    });

    return {
      participationState: approve ? ("approved" as const) : ("rejected" as const),
      requestId: membershipId,
    };
  }

  async cancelJoinRequest(userId: string, groupId: string) {
    await this.requirePlan(groupId);
    const result = await this.plansRepository.cancelJoinRequest(groupId, userId);
    if (result.count === 0) throw new NotFoundException("Join request not found");
    return { participationState: "left" as const };
  }

  async setRsvp(userId: string, groupId: string, eventId: string, body: UpdatePlanRsvpDto) {
    await this.assertAccepted(userId, groupId);
    await this.eventsService.setGroupEventRsvp(
      userId,
      groupId,
      eventId,
      body,
    );
    return { plan: (await this.get(userId, groupId)).plan, rsvp: body.rsvp };
  }

  async listMessages(userId: string, groupId: string, query: ListPlanMessagesQueryDto) {
    await this.assertAccepted(userId, groupId);
    const page = await this.plansRepository.listMessages(
      groupId,
      query.limit ?? 20,
      query.cursor ? decodeMessageCursor(query.cursor) : undefined,
    );
    const last = page.messages[page.messages.length - 1];
    return {
      messages: page.messages.map(serializeMessage),
      nextCursor: page.hasMore && last ? encodeMessageCursor(last.createdAt, last.id) : null,
    };
  }

  async sendMessage(userId: string, groupId: string, body: CreatePlanMessageDto) {
    await this.assertAccepted(userId, groupId);
    const message = await this.plansRepository.createMessage(
      groupId,
      userId,
      body.body.trim(),
    );
    const recipients = await this.plansRepository.listAcceptedMemberIds(groupId, userId);
    const plan = await this.requirePlan(groupId);
    await this.notificationsService.publish({
      actorId: userId,
      entity: { id: groupId, type: "group" },
      payload: { groupId, groupName: plan.name, messageId: message.id },
      recipientIds: recipients.map((row) => row.userId),
      type: "group_message",
    });
    return { message: serializeMessage(message) };
  }

  async deleteMessage(userId: string, groupId: string, messageId: string) {
    const plan = await this.requirePlan(groupId);
    await this.assertAdmin(userId, plan);
    const result = await this.plansRepository.deleteMessage(groupId, messageId);
    if (result.count === 0) throw new NotFoundException("Message not found");
    return { deleted: true };
  }

  private async resolvePlace(input: { placeId?: string; googlePlaceId?: string }) {
    if (input.placeId) {
      const place = await this.placesRepository.getPlaceById(input.placeId);
      if (place) return place;
    }
    if (input.googlePlaceId) {
      return this.placesService.resolve({
        source: "google",
        sourcePlaceId: input.googlePlaceId,
      });
    }
    throw new BadRequestException("placeId or googlePlaceId is required");
  }

  private async requirePlan(groupId: string) {
    const plan = await this.plansRepository.findPlanById(groupId);
    if (!plan) throw new NotFoundException("Plan not found");
    return plan;
  }

  private async assertAccepted(userId: string, groupId: string) {
    const membership = await this.plansRepository.findMembership(groupId, userId);
    if (membership?.status !== GroupMemberStatus.accepted) {
      throw new ForbiddenException({
        code: "PLAN_ACCEPTED_MEMBERS_ONLY",
        message: "Esta acción requiere ser miembro aprobado del plan.",
      });
    }
  }

  private async assertAdmin(userId: string, plan: PlanWithRelations) {
    const membership = plan.members.find((item) => item.userId === userId);
    if (
      !membership ||
      membership.status !== GroupMemberStatus.accepted ||
      (membership.role !== GroupMemberRole.owner && membership.role !== GroupMemberRole.admin)
    ) {
      throw new ForbiddenException({
        code: "PLAN_ADMIN_REQUIRED",
        message: "Solo el creador o un administrador puede realizar esta acción.",
      });
    }
  }

  private adminIds(groupId: string, excludedUserId: string) {
    return this.plansRepository
      .listAdminIds(groupId)
      .then((rows) => rows.map((row) => row.userId).filter((id) => id !== excludedUserId));
  }

  private assertBounds(query: DiscoverPlansQueryDto) {
    if (
      query.minLat !== undefined && query.maxLat !== undefined &&
      query.minLat > query.maxLat
    ) throw new BadRequestException("minLat must be less than maxLat");
    if (
      query.minLng !== undefined && query.maxLng !== undefined &&
      query.minLng > query.maxLng
    ) throw new BadRequestException("minLng must be less than maxLng");
    const from = query.fromDate || query.from;
    const to = query.toDate || query.to;
    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException("fromDate must be before toDate");
    }
  }
}

function nextEvent(plan: PlanWithRelations) {
  return plan.events.find(
    (event) =>
      event.date >= new Date() &&
      event.status !== GroupEventStatus.cancelled &&
      event.status !== GroupEventStatus.completed,
  );
}

function serializePlan(
  plan: PlanWithRelations,
  viewerId: string,
  followedIds: Set<string>,
  approved: boolean,
  selectedEvent = nextEvent(plan),
) {
  const acceptedMembers = plan.members.filter(
    (member) => member.status === GroupMemberStatus.accepted,
  );
  const friend = acceptedMembers.find(
    (member) => member.userId !== viewerId && followedIds.has(member.userId),
  );
  const membership = plan.members.find((member) => member.userId === viewerId);
  const event = selectedEvent ?? null;

  return {
    description: plan.description,
    friendParticipant: friend ? serializeUserPublic(friend.user) : null,
    id: plan.id,
    joinPolicy: plan.joinPolicy,
    memberCount: acceptedMembers.length,
    memberPreview: approved
      ? acceptedMembers.slice(0, 3).map((member) => serializeUserPublic(member.user))
      : [],
    name: plan.name,
    nextEvent: event ? serializeNextEvent(event, approved) : null,
    participationState: mapParticipationState(membership?.status),
    visibility: plan.visibility,
  };
}

function serializeNextEvent(
  event: PlanWithRelations["events"][number],
  approved: boolean,
) {
  const exactLat = event.place.lat;
  const exactLng = event.place.lng;
  const mapLat = approved ? exactLat : roundApproximateCoordinate(exactLat);
  const mapLng = approved ? exactLng : roundApproximateCoordinate(exactLng);
  const areaLabel = event.place.city?.trim() || null;

  return {
    date: event.date.toISOString().slice(0, 10),
    id: event.id,
    place: {
      address: approved ? event.place.address : areaLabel,
      areaLabel,
      id: event.place.id,
      mapLat,
      mapLng,
      name: event.place.name,
      photoUrl: event.place.coverPhotoUrl,
    },
    status: event.status as "proposed" | "announcement" | "confirmed",
  };
}

function serializeMessage(message: PlanMessageWithAuthor) {
  return {
    author: serializeUserPublic(message.author),
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    id: message.id,
  };
}

function mapParticipationState(
  status: PlanWithRelations["members"][number]["status"] | undefined,
) {
  switch (status) {
    case GroupMemberStatus.accepted:
      return "approved" as const;
    case GroupMemberStatus.requested:
      return "requested" as const;
    case GroupMemberStatus.declined:
      return "rejected" as const;
    case GroupMemberStatus.left:
      return "left" as const;
    default:
      return "none" as const;
  }
}

function roundApproximateCoordinate(value: number | null) {
  return value === null ? null : Math.round(value * 100) / 100;
}

export function encodePlanCursor(cursor: { date: Date; id: string }) {
  return Buffer.from(JSON.stringify([cursor.date.toISOString(), cursor.id])).toString("base64url");
}

export function decodePlanCursor(cursor: string) {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(value) || typeof value[0] !== "string" || typeof value[1] !== "string") {
      throw new Error("invalid cursor");
    }
    const date = new Date(value[0]);
    if (Number.isNaN(date.getTime())) throw new Error("invalid cursor");
    return { date, id: value[1] };
  } catch {
    throw new BadRequestException("Invalid cursor");
  }
}

function comparePlanCursor(left: { date: Date; id: string }, right: { date: Date; id: string }) {
  return left.date.getTime() - right.date.getTime() || left.id.localeCompare(right.id);
}

function parsePlanToDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const end = new Date(`${value}T23:59:59.999Z`);
    return end;
  }

  return new Date(value);
}

function encodeMessageCursor(createdAt: Date, id: string) {
  return Buffer.from(JSON.stringify([createdAt.toISOString(), id])).toString("base64url");
}

function decodeMessageCursor(cursor: string) {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(value) || typeof value[0] !== "string" || typeof value[1] !== "string") {
      throw new Error("invalid cursor");
    }
    const createdAt = new Date(value[0]);
    if (Number.isNaN(createdAt.getTime())) throw new Error("invalid cursor");
    return { createdAt, id: value[1] };
  } catch {
    throw new BadRequestException("Invalid cursor");
  }
}
