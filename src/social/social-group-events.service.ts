import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  GroupEventStatus,
  MemberProposalInteraction,
  PlaceProposalPolicy,
} from "@prisma/client";

import {
  computeGroupEventCapabilityFlags,
  serializeGroup,
  serializeGroupEvent,
} from "../lib/api-presenters";
import { PlacesRepository } from "../infrastructure/repositories/places.repository";
import { SocialRepository } from "../infrastructure/repositories/social.repository";
import { PlacesService } from "../places/places.service";
import { AddGroupEventDto } from "./dto/add-group-event.dto";
import { UpdateGroupEventRsvpDto } from "./dto/update-group-event-rsvp.dto";
import { NotificationsService } from "./notifications.service";
import {
  buildAcceptedGroupMemberRecipientIds,
  buildGroupEventRsvpRecipientIds,
  formatDateOnly,
} from "./social.helpers";

@Injectable()
export class SocialGroupEventsService {
  constructor(
    private readonly socialRepository: SocialRepository,
    private readonly placesRepository: PlacesRepository,
    private readonly placesService: PlacesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async addGroupEvent(userId: string, groupId: string, body: AddGroupEventDto) {
    const group = await this.socialRepository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    await this.assertGroupAccess(userId, groupId);

    if (
      group.placeProposalPolicy === PlaceProposalPolicy.owner_only &&
      userId !== group.createdById
    ) {
      throw new UnprocessableEntityException({
        code: "PROPOSAL_NOT_ALLOWED",
        message: "Solo el creador del plan puede proponer eventos.",
      });
    }

    const place = await this.resolveWritablePlace(body);
    const useAnnouncementStatus =
      group.memberProposalInteraction ===
        MemberProposalInteraction.announcement_locked && userId !== group.createdById;

    const event = await this.socialRepository.createGroupEvent({
      date: body.date,
      groupId,
      placeId: place.id,
      proposedById: userId,
      status: useAnnouncementStatus
        ? GroupEventStatus.announcement
        : GroupEventStatus.proposed,
    });

    await this.notificationsService.publish({
      actorId: userId,
      entity: {
        id: event.id,
        type: "group_event",
      },
      payload: {
        eventDate: body.date,
        eventId: event.id,
        groupId: group.id,
        groupName: group.name,
        placeName: event.place.name,
      },
      recipientIds: buildAcceptedGroupMemberRecipientIds(group, [userId]),
      type: "group_event_proposed",
    });

    return {
      event: serializeGroupEvent(event, {
        group: {
          createdById: group.createdById,
          memberProposalInteraction: group.memberProposalInteraction,
          placeProposalPolicy: group.placeProposalPolicy,
        },
        viewerUserId: userId,
      }),
    };
  }

  async setGroupEventRsvp(
    userId: string,
    groupId: string,
    eventId: string,
    body: UpdateGroupEventRsvpDto,
  ) {
    const group = await this.socialRepository.findGroupById(groupId);
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    await this.assertGroupAccess(userId, groupId);

    const event = await this.socialRepository.findGroupEventById(groupId, eventId);
    if (!event) {
      throw new NotFoundException("Event not found");
    }

    const interactionFlags = computeGroupEventCapabilityFlags(
      {
        createdById: group.createdById,
        memberProposalInteraction: group.memberProposalInteraction,
        placeProposalPolicy: group.placeProposalPolicy,
      },
      event,
    );

    if (!interactionFlags.allowsRsvp && body.rsvp !== "none") {
      throw new UnprocessableEntityException({
        code: "RSVP_NOT_ALLOWED",
        message: "Este evento no admite confirmar asistencia.",
      });
    }

    const updated = await this.socialRepository.setGroupEventRsvp({
      eventId,
      rsvp: body.rsvp,
      userId,
    });

    if (!updated) {
      throw new NotFoundException("Group not found");
    }

    if (updated.changed && body.rsvp !== "none") {
      await this.notificationsService.publish({
        actorId: userId,
        entity: {
          id: event.id,
          type: "group_event",
        },
        payload: {
          eventDate: formatDateOnly(event.date),
          eventId: event.id,
          groupId: updated.group.id,
          groupName: updated.group.name,
          placeName: event.place.name,
          rsvp: body.rsvp,
        },
        recipientIds: buildGroupEventRsvpRecipientIds(updated.group, event, userId),
        type: "group_event_rsvp",
      });
    }

    return {
      group: serializeGroup(updated.group, { viewerUserId: userId }),
    };
  }

  private async resolveWritablePlace(input: {
    googlePlaceId?: string;
    placeId?: string;
    sessionToken?: string;
  }, origin?: string) {
    if (input.placeId) {
      const place = await this.placesRepository.getPlaceById(input.placeId);
      if (place) {
        return place;
      }
    }

    if (input.googlePlaceId) {
      return this.placesService.resolve({
        source: "google",
        sourcePlaceId: input.googlePlaceId,
        sessionToken: input.sessionToken,
      }, origin);
    }

    throw new BadRequestException("placeId or googlePlaceId is required");
  }

  private async assertGroupAccess(userId: string, groupId: string) {
    const membership = await this.socialRepository.findGroupMembership(groupId, userId);

    if (!membership) {
      throw new ForbiddenException({
        code: "GROUP_ACTION_REQUIRES_MEMBERSHIP",
        message: "Tenés que ser miembro del plan para realizar esta acción.",
      });
    }

    if (membership.status === "pending") {
      throw new ForbiddenException({
        code: "GROUP_INVITE_PENDING",
        message: "Acepta la invitación antes de interactuar con el plan.",
      });
    }

    if (membership.status !== "accepted") {
      throw new ForbiddenException({
        code: "GROUP_ACTION_REQUIRES_MEMBERSHIP",
        message: "Ya no formas parte de este plan.",
      });
    }
  }
}
