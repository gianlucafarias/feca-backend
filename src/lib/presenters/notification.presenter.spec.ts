import { describe, expect, it } from "vitest";

import { buildNotificationPresentation } from "./notification.presenter";

describe("buildNotificationPresentation", () => {
  it("uses polished Spanish copy for social notifications", () => {
    expect(
      buildNotificationPresentation("follow", null, null, null),
    ).toMatchObject({
      body: "Alguien empezó a seguirte",
      title: "Nuevo seguidor",
    });

    expect(
      buildNotificationPresentation(
        "group_invite_reminder",
        null,
        { groupName: "Cena del viernes" },
        null,
      ),
    ).toMatchObject({
      body: "Todavía tenés pendiente la invitación a Cena del viernes",
      title: "Invitación pendiente",
    });
  });

  it("localizes the maybe RSVP label", () => {
    expect(
      buildNotificationPresentation(
        "group_event_rsvp",
        null,
        { placeName: "Café Central", rsvp: "maybe" },
        null,
    ).body,
    ).toBe('Alguien respondió "quizás" para Café Central');
  });

  it("routes plan notifications to the plan or its chat", () => {
    expect(
      buildNotificationPresentation(
        "group_join_request",
        null,
        { groupId: "plan-1", groupName: "Café Central" },
        null,
      ).deepLink,
    ).toBe("/group/plan-1");
    expect(
      buildNotificationPresentation(
        "group_message",
        null,
        { groupId: "plan-1", groupName: "Café Central" },
        null,
      ).deepLink,
    ).toBe("/group/plan-1/chat");
    expect(
      buildNotificationPresentation(
        "group_report",
        null,
        { groupId: "plan-1", groupName: "Café Central", reason: "Spam" },
        null,
      ),
    ).toMatchObject({
      body: "Alguien reportó Café Central: Spam",
      deepLink: "/group/plan-1",
      title: "Plan reportado",
    });
  });
});
