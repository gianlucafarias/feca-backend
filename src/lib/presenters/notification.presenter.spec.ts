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
});
