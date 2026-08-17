import type { NotificationType, Prisma } from "@prisma/client";

import type {
  NotificationEntity,
  NotificationPresentation,
  NotificationWithRelations,
} from "./presenter.types";
import { serializeUserSummary } from "./user.presenter";

export function serializeNotification(notification: NotificationWithRelations) {
  const actor = notification.actor
    ? serializeUserSummary(notification.actor)
    : null;
  const data = normalizeNotificationData(notification.payload);
  const entity =
    notification.entityType && notification.entityId
      ? {
          id: notification.entityId,
          kind: notification.entityType,
        }
      : null;
  const presentation = buildNotificationPresentation(
    notification.type,
    actor,
    data,
    entity,
  );

  return {
    actor,
    body: presentation.body,
    createdAt: notification.createdAt.toISOString(),
    data,
    deepLink: presentation.deepLink,
    entity,
    id: notification.id,
    read: Boolean(notification.readAt),
    title: presentation.title,
    type: notification.type,
  };
}

function normalizeNotificationData(payload: Prisma.JsonValue | null) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  return payload as Record<string, unknown>;
}

export function buildNotificationPresentation(
  type: NotificationType,
  actor: ReturnType<typeof serializeUserSummary> | null,
  data: Record<string, unknown> | null,
  entity: NotificationEntity | null,
): NotificationPresentation {
  const actorName = actor?.displayName || actor?.username || "Alguien";
  const custom = readCustomNotificationPresentation(data);

  switch (type) {
    case "follow":
      return {
        body: `${actorName} empezó a seguirte`,
        deepLink: actor ? `/user/${actor.id}` : null,
        title: "Nuevo seguidor",
      };
    case "group_invite": {
      const groupId = readNotificationString(data, "groupId") ?? entity?.id ?? null;
      const groupName = readNotificationString(data, "groupName") ?? "tu plan";
      return {
        body: `${actorName} te invitó a ${groupName}`,
        deepLink: groupId ? `/group/${groupId}` : null,
        title: "Invitación a un plan",
      };
    }
    case "group_joined": {
      const groupId = readNotificationString(data, "groupId") ?? entity?.id ?? null;
      const groupName = readNotificationString(data, "groupName") ?? "tu plan";
      return {
        body: `${actorName} se sumó a ${groupName}`,
        deepLink: groupId ? `/group/${groupId}` : null,
        title: "Nuevo miembro en el plan",
      };
    }
    case "group_join_request": {
      const groupId = readNotificationString(data, "groupId") ?? entity?.id ?? null;
      const groupName = readNotificationString(data, "groupName") ?? "tu plan";
      return { body: `${actorName} quiere sumarse a ${groupName}`, deepLink: groupId ? `/group/${groupId}` : null, title: "Nueva solicitud para tu plan" };
    }
    case "group_join_approved": {
      const groupId = readNotificationString(data, "groupId") ?? entity?.id ?? null;
      const groupName = readNotificationString(data, "groupName") ?? "un plan";
      return { body: `Ya podés participar en ${groupName}`, deepLink: groupId ? `/group/${groupId}` : null, title: "Solicitud aprobada" };
    }
    case "group_join_rejected": {
      const groupId = readNotificationString(data, "groupId") ?? entity?.id ?? null;
      const groupName = readNotificationString(data, "groupName") ?? "ese plan";
      return { body: `Tu solicitud para ${groupName} no fue aprobada`, deepLink: groupId ? `/group/${groupId}` : null, title: "Solicitud rechazada" };
    }
    case "group_message": {
      const groupId = readNotificationString(data, "groupId") ?? entity?.id ?? null;
      const groupName = readNotificationString(data, "groupName") ?? "un plan";
      return { body: `Hay un mensaje nuevo en ${groupName}`, deepLink: groupId ? `/group/${groupId}/chat` : null, title: "Mensaje nuevo" };
    }
    case "group_report": {
      const groupId = readNotificationString(data, "groupId") ?? entity?.id ?? null;
      const groupName = readNotificationString(data, "groupName") ?? "tu plan";
      const reason = readNotificationString(data, "reason");
      return {
        body: reason
          ? `${actorName} reportó ${groupName}: ${reason}`
          : `${actorName} reportó ${groupName}`,
        deepLink: groupId ? `/group/${groupId}` : null,
        title: "Plan reportado",
      };
    }
    case "group_event_proposed": {
      const groupId = readNotificationString(data, "groupId") ?? null;
      const groupName = readNotificationString(data, "groupName") ?? "tu plan";
      const placeName = readNotificationString(data, "placeName") ?? "un lugar";
      return {
        body: `${actorName} propuso ${placeName} para ${groupName}`,
        deepLink: groupId ? `/group/${groupId}` : null,
        title: "Nuevo plan propuesto",
      };
    }
    case "group_event_rsvp": {
      const groupId = readNotificationString(data, "groupId") ?? null;
      const placeName = readNotificationString(data, "placeName") ?? "el plan";
      const rsvp = mapRsvpLabel(readNotificationString(data, "rsvp"));
      return {
        body: `${actorName} respondió ${rsvp} para ${placeName}`,
        deepLink: groupId ? `/group/${groupId}` : null,
        title: "Nuevo RSVP",
      };
    }
    case "visit_created": {
      const placeName = readNotificationString(data, "placeName") ?? "un lugar";
      const placeRouteId =
        readNotificationString(data, "placeGooglePlaceId") ??
        readNotificationString(data, "placeId") ??
        null;
      return {
        body: `${actorName} visitó ${placeName}`,
        deepLink: placeRouteId ? `/place/${placeRouteId}` : null,
        title: "Nueva visita",
      };
    }
    case "diary_published": {
      const diaryId = readNotificationString(data, "diaryId") ?? entity?.id ?? null;
      const diaryName = readNotificationString(data, "diaryName") ?? "una guía";
      return {
        body: `${actorName} publicó ${diaryName}`,
        deepLink: diaryId ? `/diary/${diaryId}` : null,
        title: "Nueva guía publicada",
      };
    }
    case "group_invite_reminder": {
      const groupId = readNotificationString(data, "groupId") ?? entity?.id ?? null;
      const groupName = readNotificationString(data, "groupName") ?? "tu plan";
      return custom ?? {
        body: `Todavía tenés pendiente la invitación a ${groupName}`,
        deepLink: groupId ? `/group/${groupId}` : null,
        title: "Invitación pendiente",
      };
    }
    case "group_event_rsvp_reminder": {
      const groupId = readNotificationString(data, "groupId") ?? null;
      const placeName = readNotificationString(data, "placeName") ?? "tu plan";
      return custom ?? {
        body: `Falta tu respuesta para ${placeName}`,
        deepLink: groupId ? `/group/${groupId}` : null,
        title: "Recordatorio de RSVP",
      };
    }
    case "group_event_today_reminder": {
      const groupId = readNotificationString(data, "groupId") ?? null;
      const placeName = readNotificationString(data, "placeName") ?? "tu plan";
      return custom ?? {
        body: `Tu plan de hoy sigue en pie: ${placeName}`,
        deepLink: groupId ? `/group/${groupId}` : null,
        title: "Plan para hoy",
      };
    }
    case "weekly_digest":
      return (
        custom ?? {
          body: "Mirá lo más interesante de tu red esta semana.",
          deepLink: "/notifications",
          title: "Resumen semanal",
        }
      );
    case "contextual_recommendation": {
      const placeRouteId =
        readNotificationString(data, "placeGooglePlaceId") ??
        readNotificationString(data, "placeId") ??
        entity?.id ??
        null;
      const placeName = readNotificationString(data, "placeName") ?? "un lugar";
      return custom ?? {
        body: `Tenemos una recomendación para tu próxima salida: ${placeName}`,
        deepLink: placeRouteId ? `/place/${placeRouteId}` : null,
        title: "Recomendación para vos",
      };
    }
    default: {
      const unexpected: never = type;
      return {
        body: String(unexpected),
        deepLink: null,
        title: "Notificación",
      };
    }
  }
}

function readCustomNotificationPresentation(
  data: Record<string, unknown> | null,
) {
  const title = readNotificationString(data, "title");
  const body = readNotificationString(data, "body");
  const deepLink = readNotificationString(data, "deepLink") ?? null;

  if (!title || !body) {
    return null;
  }

  return {
    body,
    deepLink,
    title,
  };
}

function readNotificationString(
  data: Record<string, unknown> | null,
  key: string,
) {
  const value = data?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function mapRsvpLabel(value?: string) {
  switch (value) {
    case "going":
      return '"voy"';
    case "maybe":
      return '"quizás"';
    case "declined":
      return '"no voy"';
    default:
      return '"sin respuesta"';
  }
}
