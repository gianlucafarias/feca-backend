import { Injectable, Logger } from "@nestjs/common";
import { GroupEventStatus, GuideVisibility, Prisma } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import { type OutingPreferencesV1 } from "../lib/outing-preferences";
import { PlacesService } from "../places/places.service";
import type { ExploreIntent } from "../places/explore-context";
import { SocialRepository } from "../infrastructure/repositories/social.repository";
import { NotificationsService } from "./notifications.service";

type LocalDateTime = {
  date: string;
  hour: number;
  minute: number;
  weekday: number;
};

type UserTimezoneContext = {
  city: string | null;
  cityId: string | null;
  id: string;
  lat: number | null;
  lng: number | null;
  outingPreferences: Prisma.JsonValue | null;
  timezone: string;
};

type ContextualSlot =
  | "weekday_morning"
  | "weekday_afternoon"
  | "weekday_evening"
  | "weekend_day"
  | "weekend_night";

type ContextualSchedule = {
  hour: number;
  minute: number;
  slot: ContextualSlot;
  weekdays: number[];
};

const CONTEXTUAL_SCHEDULES: ContextualSchedule[] = [
  {
    hour: 7,
    minute: 30,
    slot: "weekday_morning",
    weekdays: [1, 2, 3, 4, 5],
  },
  {
    hour: 11,
    minute: 0,
    slot: "weekday_afternoon",
    weekdays: [1, 2, 3, 4, 5],
  },
  {
    hour: 16,
    minute: 30,
    slot: "weekday_evening",
    weekdays: [1, 2, 3, 4, 5],
  },
  {
    hour: 9,
    minute: 0,
    slot: "weekend_day",
    weekdays: [0, 6],
  },
  {
    hour: 17,
    minute: 0,
    slot: "weekend_night",
    weekdays: [5, 6],
  },
];

@Injectable()
export class NotificationsAutomationService {
  private readonly logger = new Logger(NotificationsAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly placesService: PlacesService,
    private readonly socialRepository: SocialRepository,
  ) {}

  async runDueAutomations(now = new Date()) {
    const usersWithTimezone = await this.listUsersWithLatestTimezone();
    const localTimeByUserId = new Map<string, LocalDateTime>();

    for (const user of usersWithTimezone) {
      const local = tryGetLocalDateTime(now, user.timezone);
      if (local) {
        localTimeByUserId.set(user.id, local);
      }
    }

    const inviteReminders = await this.runInviteReminders(now);
    const rsvpReminders = await this.runRsvpReminders(now, localTimeByUserId);
    const todayReminders = await this.runTodayReminders(now, localTimeByUserId);
    const weeklyDigests = await this.runWeeklyDigests(
      now,
      usersWithTimezone,
      localTimeByUserId,
    );
    const contextualRecommendations = await this.runContextualRecommendations(
      now,
      usersWithTimezone,
      localTimeByUserId,
    );

    return {
      contextualRecommendations,
      inviteReminders,
      rsvpReminders,
      todayReminders,
      weeklyDigests,
    };
  }

  private async runInviteReminders(now: Date) {
    const rows = await this.prisma.groupMember.findMany({
      where: {
        createdAt: {
          lte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        },
        status: "pending",
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }],
    });

    let published = 0;

    for (const member of rows) {
      const result = await this.notificationsService.publish({
        actorId: member.invitedById ?? undefined,
        dedupeKey: `group-invite-reminder:${member.id}`,
        entity: {
          id: member.group.id,
          type: "group",
        },
        payload: {
          body: `Todavia tenes pendiente la invitacion a ${member.group.name}.`,
          deepLink: `/group/${member.group.id}`,
          groupId: member.group.id,
          groupName: member.group.name,
          title: "Invitacion pendiente",
        },
        recipientIds: [member.userId],
        type: "group_invite_reminder",
      });

      published += result.count;
    }

    return published;
  }

  private async runRsvpReminders(
    now: Date,
    localTimeByUserId: Map<string, LocalDateTime>,
  ) {
    const events = await this.prisma.groupEvent.findMany({
      where: {
        date: {
          gte: startOfUtcDay(addDays(now, -1)),
          lt: startOfUtcDay(addDays(now, 3)),
        },
        status: {
          in: [GroupEventStatus.proposed, GroupEventStatus.confirmed],
        },
      },
      select: {
        date: true,
        group: {
          select: {
            id: true,
            members: {
              select: {
                status: true,
                userId: true,
              },
              where: {
                status: "accepted",
              },
            },
            name: true,
          },
        },
        id: true,
        place: {
          select: {
            name: true,
          },
        },
        rsvps: {
          select: {
            userId: true,
          },
        },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });

    let published = 0;

    for (const event of events) {
      const eventDate = toDateOnlyString(event.date);
      const reminderDate = shiftDateOnly(eventDate, -1);
      const respondedUserIds = new Set(event.rsvps.map((rsvp) => rsvp.userId));

      for (const member of event.group.members) {
        const local = localTimeByUserId.get(member.userId);
        if (!local) {
          continue;
        }

        if (respondedUserIds.has(member.userId)) {
          continue;
        }

        if (local.date !== reminderDate || !isDueAtLocalTime(local, 18, 0)) {
          continue;
        }

        const result = await this.notificationsService.publish({
          dedupeKey: `group-event-rsvp-reminder:${event.id}:${member.userId}:${eventDate}`,
          entity: {
            id: event.id,
            type: "group_event",
          },
          payload: {
            body: `Falta tu respuesta para ${event.place.name} en ${event.group.name}.`,
            deepLink: `/group/${event.group.id}`,
            eventDate,
            eventId: event.id,
            groupId: event.group.id,
            groupName: event.group.name,
            placeName: event.place.name,
            title: "Recordatorio de RSVP",
          },
          recipientIds: [member.userId],
          type: "group_event_rsvp_reminder",
        });

        published += result.count;
      }
    }

    return published;
  }

  private async runTodayReminders(
    now: Date,
    localTimeByUserId: Map<string, LocalDateTime>,
  ) {
    const events = await this.prisma.groupEvent.findMany({
      where: {
        date: {
          gte: startOfUtcDay(addDays(now, -1)),
          lt: startOfUtcDay(addDays(now, 2)),
        },
        status: GroupEventStatus.confirmed,
      },
      select: {
        date: true,
        group: {
          select: {
            id: true,
            members: {
              select: {
                status: true,
                userId: true,
              },
              where: {
                status: "accepted",
              },
            },
            name: true,
          },
        },
        id: true,
        place: {
          select: {
            name: true,
          },
        },
        rsvps: {
          select: {
            rsvp: true,
            userId: true,
          },
        },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });

    let published = 0;

    for (const event of events) {
      const eventDate = toDateOnlyString(event.date);
      const rsvpByUserId = new Map(
        event.rsvps.map((rsvp) => [rsvp.userId, rsvp.rsvp]),
      );

      for (const member of event.group.members) {
        const local = localTimeByUserId.get(member.userId);
        if (!local) {
          continue;
        }

        if (rsvpByUserId.get(member.userId) === "declined") {
          continue;
        }

        if (local.date !== eventDate || !isDueAtLocalTime(local, 9, 0)) {
          continue;
        }

        const result = await this.notificationsService.publish({
          dedupeKey: `group-event-today-reminder:${event.id}:${member.userId}:${eventDate}`,
          entity: {
            id: event.id,
            type: "group_event",
          },
          payload: {
            body: `Hoy tenes ${event.place.name} con ${event.group.name}.`,
            deepLink: `/group/${event.group.id}`,
            eventDate,
            eventId: event.id,
            groupId: event.group.id,
            groupName: event.group.name,
            placeName: event.place.name,
            title: "Plan para hoy",
          },
          recipientIds: [member.userId],
          type: "group_event_today_reminder",
        });

        published += result.count;
      }
    }

    return published;
  }

  private async runWeeklyDigests(
    now: Date,
    usersWithTimezone: UserTimezoneContext[],
    localTimeByUserId: Map<string, LocalDateTime>,
  ) {
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    let published = 0;

    for (const user of usersWithTimezone) {
      const local = localTimeByUserId.get(user.id);
      if (!local) {
        continue;
      }

      if (local.weekday !== 0 || !isDueAtLocalTime(local, 18, 0)) {
        continue;
      }

      const followingRows = await this.prisma.userFollow.findMany({
        where: {
          followerId: user.id,
        },
        select: {
          followedId: true,
        },
      });
      const followedIds = followingRows.map((row) => row.followedId);

      const [visitCount, diaryCount, guide] = await Promise.all([
        followedIds.length > 0
          ? this.prisma.visit.count({
              where: {
                createdAt: {
                  gte: since,
                },
                user: {
                  id: {
                    in: followedIds,
                  },
                  settings: {
                    is: {
                      OR: [
                        { activityVisibility: "public" },
                        { activityVisibility: "followers" },
                      ],
                    },
                  },
                },
              },
            })
          : 0,
        followedIds.length > 0
          ? this.prisma.diary.count({
              where: {
                createdById: {
                  in: followedIds,
                },
                publishedAt: {
                  gte: since,
                },
                visibility: GuideVisibility.public,
              },
            })
          : 0,
        this.findWeeklyGuide(user.cityId),
      ]);

      if (visitCount === 0 && diaryCount === 0 && !guide) {
        continue;
      }

      const body = buildWeeklyDigestBody({
        city: user.city,
        diaryCount,
        guideName: guide?.name,
        visitCount,
      });
      const deepLink = guide ? `/diary/${guide.id}` : "/notifications";

      const result = await this.notificationsService.publish({
        dedupeKey: `weekly-digest:${user.id}:${local.date}`,
        payload: {
          body,
          deepLink,
          diaryCount,
          guideId: guide?.id ?? null,
          guideName: guide?.name ?? null,
          title: "Resumen semanal",
          visitCount,
        },
        recipientIds: [user.id],
        type: "weekly_digest",
      });

      published += result.count;
    }

    return published;
  }

  private async runContextualRecommendations(
    now: Date,
    usersWithTimezone: UserTimezoneContext[],
    localTimeByUserId: Map<string, LocalDateTime>,
  ) {
    let published = 0;
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const user of usersWithTimezone) {
      const local = localTimeByUserId.get(user.id);
      if (!local) {
        continue;
      }

      const preferences = readOutingPreferences(user.outingPreferences);
      const slot = pickDueContextualSlot(local, preferences.typicalOutingSlots);
      if (!slot) {
        continue;
      }

      if (!user.city || user.lat == null || user.lng == null) {
        continue;
      }

      const intent = mapContextualIntent(slot, preferences.typicalCompanies);
      const dedupeKey = `contextual:${slot}:${user.id}:${local.date}`;

      try {
        const [explore, recentRouteIds] = await Promise.all([
          this.placesService.exploreContext(user.id, {
            intent,
            limit: 12,
          }),
          this.socialRepository.listRecentlyInteractedPlaceRouteIds(user.id, since),
        ]);

        const recentSet = new Set(recentRouteIds);
        const place = explore.places.find(
          (candidate) => !recentSet.has(candidate.googlePlaceId),
        );

        if (!place) {
          continue;
        }

        const deepLink = `/place/${place.googlePlaceId}`;
        const result = await this.notificationsService.publish({
          dedupeKey,
          entity: {
            id: place.googlePlaceId,
            type: "place",
          },
          payload: {
            body: buildContextualBody(slot, place.name),
            deepLink,
            intent,
            placeGooglePlaceId: place.googlePlaceId,
            placeName: place.name,
            slot,
            title: "Recomendacion para vos",
          },
          recipientIds: [user.id],
          type: "contextual_recommendation",
        });

        published += result.count;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "contextual recommendation failed";
        this.logger.error(`Contextual recommendation failed for ${user.id}: ${message}`);
      }
    }

    return published;
  }

  private async listUsersWithLatestTimezone() {
    const users = await this.prisma.user.findMany({
      where: {
        pushInstallations: {
          some: {
            disabledAt: null,
            revokedAt: null,
          },
        },
      },
      select: {
        city: true,
        cityId: true,
        id: true,
        lat: true,
        lng: true,
        outingPreferences: true,
        pushInstallations: {
          orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
          select: {
            timezone: true,
          },
          take: 1,
          where: {
            disabledAt: null,
            revokedAt: null,
          },
        },
      },
    });

    return users
      .map((user) => ({
        city: user.city,
        cityId: user.cityId,
        id: user.id,
        lat: user.lat,
        lng: user.lng,
        outingPreferences: user.outingPreferences,
        timezone: user.pushInstallations[0]?.timezone ?? "",
      }))
      .filter((user): user is UserTimezoneContext => Boolean(user.timezone));
  }

  private async findWeeklyGuide(cityId: string | null) {
    if (cityId) {
      const cityGuide = await this.prisma.diary.findFirst({
        where: {
          createdBy: {
            isEditor: true,
          },
          featuredCityId: cityId,
          publishedAt: {
            not: null,
          },
          visibility: GuideVisibility.public,
        },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          name: true,
        },
      });

      if (cityGuide) {
        return cityGuide;
      }
    }

    return this.prisma.diary.findFirst({
      where: {
        createdBy: {
          isEditor: true,
        },
        publishedAt: {
          not: null,
        },
        visibility: GuideVisibility.public,
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
      },
    });
  }
}

function readOutingPreferences(raw: Prisma.JsonValue | null | undefined) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      typicalCompanies: [] as Array<
        NonNullable<OutingPreferencesV1["typicalCompanies"]>[number]
      >,
      typicalOutingSlots: [] as ContextualSlot[],
    };
  }

  const object = raw as Partial<OutingPreferencesV1>;
  const slots = Array.isArray(object.typicalOutingSlots)
    ? object.typicalOutingSlots.filter(isContextualSlot)
    : [];
  const companies = Array.isArray(object.typicalCompanies)
    ? object.typicalCompanies.filter(isTypicalCompany)
    : object.typicalCompany && isTypicalCompany(object.typicalCompany)
      ? [object.typicalCompany]
      : [];

  return {
    typicalCompanies: companies,
    typicalOutingSlots: slots,
  };
}

function pickDueContextualSlot(
  local: LocalDateTime,
  configuredSlots: ContextualSlot[],
) {
  if (configuredSlots.length === 0) {
    return null;
  }

  const configured = new Set(configuredSlots);
  const dueSchedules = CONTEXTUAL_SCHEDULES.filter(
    (schedule) =>
      configured.has(schedule.slot) &&
      schedule.weekdays.includes(local.weekday) &&
      isDueAtLocalTime(local, schedule.hour, schedule.minute),
  );

  if (dueSchedules.length === 0) {
    return null;
  }

  dueSchedules.sort(
    (left, right) =>
      right.hour * 60 +
      right.minute -
      (left.hour * 60 + left.minute),
  );

  return dueSchedules[0]!.slot;
}

function mapContextualIntent(
  slot: ContextualSlot,
  companies: Array<
    NonNullable<OutingPreferencesV1["typicalCompanies"]>[number]
  >,
): ExploreIntent {
  switch (slot) {
    case "weekday_morning":
      return "work_2h";
    case "weekday_afternoon":
      return "snack_fast";
    case "weekday_evening":
      return "reading";
    case "weekend_day":
      return "brunch_long";
    case "weekend_night":
      if (companies.includes("couple")) {
        return "first_date";
      }
      if (
        companies.includes("small_group") ||
        companies.includes("large_group")
      ) {
        return "group_4";
      }
      return "reading";
  }
}

function buildWeeklyDigestBody(input: {
  city: string | null;
  diaryCount: number;
  guideName?: string;
  visitCount: number;
}) {
  const parts: string[] = [];

  if (input.visitCount > 0) {
    parts.push(
      `Tu red compartio ${input.visitCount} visita${input.visitCount === 1 ? "" : "s"} en los ultimos 7 dias.`,
    );
  }

  if (input.diaryCount > 0) {
    parts.push(
      `Tambien aparecieron ${input.diaryCount} guia${input.diaryCount === 1 ? "" : "s"} nueva${input.diaryCount === 1 ? "" : "s"}.`,
    );
  }

  if (input.guideName) {
    if (input.city) {
      parts.push(`Te dejamos ${input.guideName} para ${input.city}.`);
    } else {
      parts.push(`Te dejamos ${input.guideName} para inspirarte.`);
    }
  }

  return parts.join(" ");
}

function buildContextualBody(slot: ContextualSlot, placeName: string) {
  switch (slot) {
    case "weekday_morning":
      return `Te recomendamos ${placeName} para trabajar un rato.`;
    case "weekday_afternoon":
      return `Te recomendamos ${placeName} para una pausa rapida.`;
    case "weekday_evening":
      return `Te recomendamos ${placeName} para bajar el ritmo.`;
    case "weekend_day":
      return `Te recomendamos ${placeName} para un plan largo de dia.`;
    case "weekend_night":
      return `Te recomendamos ${placeName} para salir esta tarde.`;
  }
}

function isDueAtLocalTime(local: LocalDateTime, hour: number, minute: number) {
  const currentMinutes = local.hour * 60 + local.minute;
  const targetMinutes = hour * 60 + minute;
  return currentMinutes >= targetMinutes && currentMinutes < targetMinutes + 60;
}

function tryGetLocalDateTime(date: Date, timezone: string): LocalDateTime | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      month: "2-digit",
      timeZone: timezone,
      weekday: "short",
      year: "numeric",
    });

    const parts = formatter.formatToParts(date);
    const read = (type: string) => parts.find((part) => part.type === type)?.value;
    const year = read("year");
    const month = read("month");
    const day = read("day");
    const hour = read("hour");
    const minute = read("minute");
    const weekday = read("weekday");

    if (!year || !month || !day || !hour || !minute || !weekday) {
      return null;
    }

    return {
      date: `${year}-${month}-${day}`,
      hour: Number(hour),
      minute: Number(minute),
      weekday: mapWeekday(weekday),
    };
  } catch {
    return null;
  }
}

function mapWeekday(value: string) {
  switch (value) {
    case "Sun":
      return 0;
    case "Mon":
      return 1;
    case "Tue":
      return 2;
    case "Wed":
      return 3;
    case "Thu":
      return 4;
    case "Fri":
      return 5;
    case "Sat":
      return 6;
    default:
      return -1;
  }
}

function toDateOnlyString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function shiftDateOnly(dateOnly: string, offsetDays: number) {
  const shifted = addDays(new Date(`${dateOnly}T00:00:00.000Z`), offsetDays);
  return toDateOnlyString(shifted);
}

function startOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function isContextualSlot(value: unknown): value is ContextualSlot {
  return (
    value === "weekday_morning" ||
    value === "weekday_afternoon" ||
    value === "weekday_evening" ||
    value === "weekend_day" ||
    value === "weekend_night"
  );
}

function isTypicalCompany(
  value: unknown,
): value is NonNullable<OutingPreferencesV1["typicalCompanies"]>[number] {
  return (
    value === "solo" ||
    value === "couple" ||
    value === "small_group" ||
    value === "large_group"
  );
}
