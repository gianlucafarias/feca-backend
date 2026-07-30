import { describe, expect, it, vi } from "vitest";

import { SocialGroupEventsService } from "./social-group-events.service";

describe("SocialGroupEventsService", () => {
  it("does not let a pending invitee create an event", async () => {
    const createGroupEvent = vi.fn();
    const socialRepository = {
      createGroupEvent,
      findGroupById: vi.fn().mockResolvedValue({
        createdById: "owner-1",
        id: "group-1",
      }),
      findGroupMembership: vi.fn().mockResolvedValue({
        role: "member",
        status: "pending",
      }),
    };
    const service = new SocialGroupEventsService(
      socialRepository as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.addGroupEvent("invitee-1", "group-1", {} as never),
    ).rejects.toMatchObject({
      response: {
        code: "GROUP_INVITE_PENDING",
      },
    });
    expect(createGroupEvent).not.toHaveBeenCalled();
  });
});
