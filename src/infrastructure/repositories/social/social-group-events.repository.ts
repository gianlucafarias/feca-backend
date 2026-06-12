import { Injectable } from "@nestjs/common";
import { GroupEventRsvpStatus, GroupEventStatus } from "@prisma/client";

import { PrismaService } from "../../../database/prisma.service";
import { groupEventInclude, groupInclude } from "./social.repository.types";

@Injectable()
export class SocialGroupEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findGroupEventById(groupId: string, eventId: string) {
    return this.prisma.groupEvent.findFirst({
      where: {
        groupId,
        id: eventId,
      },
      include: groupEventInclude,
    });
  }

  createGroupEvent(input: {
    date: string;
    groupId: string;
    placeId: string;
    proposedById: string;
    status?: GroupEventStatus;
  }) {
    return this.prisma.groupEvent.create({
      data: {
        date: new Date(input.date),
        groupId: input.groupId,
        placeId: input.placeId,
        proposedById: input.proposedById,
        status: input.status ?? GroupEventStatus.proposed,
      },
      include: groupEventInclude,
    });
  }

  setGroupEventRsvp(input: {
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
}
