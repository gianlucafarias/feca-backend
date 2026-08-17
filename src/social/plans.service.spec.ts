import { describe, expect, it, vi } from "vitest";

import { PlansService } from "./plans.service";

function user(id: string) {
  return {
    avatarUrl: null,
    bio: null,
    city: "Ceres",
    displayName: id,
    email: `${id}@example.com`,
    id,
    lat: -32.1,
    lng: -61.8,
    username: id,
  };
}

function plan(
  id: string,
  date: Date,
  options: { viewerStatus?: "accepted" | "requested" } = {},
) {
  const owner = user(`owner-${id}`);
  return {
    createdBy: owner,
    description: "Una salida",
    events: [
      {
        date,
        id: `event-${id}`,
        place: {
          address: "Calle exacta 123",
          city: "Ceres",
          coverPhotoUrl: "https://img.example/place.jpg",
          id: `place-${id}`,
          lat: -32.1234,
          lng: -61.8234,
          name: "Café Central",
        },
        status: "confirmed",
      },
    ],
    id,
    joinPolicy: "open",
    members: [
      {
        role: "owner",
        status: "accepted",
        user: owner,
        userId: owner.id,
      },
      ...(options.viewerStatus
        ? [
            {
              role: "member",
              status: options.viewerStatus,
              user: user("viewer-1"),
              userId: "viewer-1",
            },
          ]
        : []),
    ],
    name: `Plan ${id}`,
    visibility: "public",
  } as never;
}

function service(overrides: Record<string, unknown> = {}) {
  const dependencies = {
    eventsService: { setGroupEventRsvp: vi.fn() },
    notificationsService: { publish: vi.fn().mockResolvedValue({ count: 1 }) },
    placesRepository: { getPlaceById: vi.fn() },
    placesService: { resolve: vi.fn() },
    plansRepository: {
      cancelJoinRequest: vi.fn(),
      createMessage: vi.fn(),
      createPlan: vi.fn(),
      decideJoinRequest: vi.fn(),
      deleteMessage: vi.fn(),
      findMembership: vi.fn(),
      findPlanById: vi.fn(),
      joinPlan: vi.fn(),
      leavePlan: vi.fn(),
      listAcceptedMemberIds: vi.fn().mockResolvedValue([]),
      listAdminIds: vi.fn().mockResolvedValue([{ userId: "owner-1" }]),
      listDiscoverablePlans: vi.fn(),
      listJoinRequests: vi.fn(),
      listMessages: vi.fn(),
      updatePlan: vi.fn(),
    },
    socialRepository: { listFollowedUserIds: vi.fn().mockResolvedValue([]) },
    ...overrides,
  };
  return {
    dependencies,
    service: new PlansService(
      dependencies.plansRepository as never,
      dependencies.socialRepository as never,
      dependencies.placesRepository as never,
      dependencies.placesService as never,
      dependencies.notificationsService as never,
      dependencies.eventsService as never,
    ),
  };
}

describe("PlansService", () => {
  it("discovers future plans with a stable cursor and redacts non-approved location and roster", async () => {
    const first = plan("a", new Date("2099-01-01T10:00:00.000Z"));
    const second = plan("b", new Date("2099-01-02T10:00:00.000Z"));
    const { dependencies, service: plans } = service();
    dependencies.plansRepository.listDiscoverablePlans.mockResolvedValue([first, second]);

    const page = await plans.discover("viewer-1", {
      cityGooglePlaceId: "city-1",
      from: "2099-01-01",
      limit: 1,
      maxLat: -32,
      maxLng: -61,
      minLat: -33,
      minLng: -62,
      to: "2099-01-03",
    } as never);

    expect(dependencies.plansRepository.listDiscoverablePlans).toHaveBeenCalledWith(
      expect.objectContaining({
        cityGooglePlaceId: "city-1",
        maxLat: -32,
        minLng: -62,
        toDate: new Date("2099-01-03T23:59:59.999Z"),
      }),
    );

    expect(page.plans).toHaveLength(1);
    expect(page.plans[0]).toMatchObject({
      id: "a",
      joinPolicy: "open",
      memberCount: 1,
      memberPreview: [],
      nextEvent: {
        date: "2099-01-01",
        place: {
          address: "Ceres",
          areaLabel: "Ceres",
          mapLat: -32.12,
          mapLng: -61.82,
        },
      },
      participationState: "none",
      visibility: "public",
    });
    expect(page.nextCursor).toBeTruthy();

    const next = await plans.discover("viewer-1", {
      cursor: page.nextCursor,
      limit: 1,
    } as never);
    expect(next.plans[0].id).toBe("b");
  });

  it("shows exact place data and member preview to an approved participant", async () => {
    const approved = plan("approved", new Date("2099-01-01T10:00:00.000Z"), {
      viewerStatus: "accepted",
    });
    const { dependencies, service: plans } = service();
    dependencies.plansRepository.listDiscoverablePlans.mockResolvedValue([approved]);

    const result = await plans.discover("viewer-1", {} as never);

    expect(result.plans[0]).toMatchObject({
      nextEvent: {
        place: {
          address: "Calle exacta 123",
          mapLat: -32.1234,
          mapLng: -61.8234,
        },
      },
      participationState: "approved",
    });
    expect(result.plans[0].memberPreview[0]).toMatchObject({ id: "owner-approved" });
  });

  it("makes request approval idempotent and notifies admins only on the transition", async () => {
    const row = plan("request", new Date("2099-01-01T10:00:00.000Z"));
    const { dependencies, service: plans } = service();
    dependencies.plansRepository.findPlanById.mockResolvedValue(row);
    dependencies.plansRepository.joinPlan
      .mockResolvedValueOnce({ changed: true, kind: "requested", membership: {} })
      .mockResolvedValueOnce({ changed: false, kind: "requested", membership: {} });
    dependencies.plansRepository.findMembership.mockResolvedValue({ status: "requested" });

    await plans.join("viewer-1", "request");
    await plans.join("viewer-1", "request");

    expect(dependencies.notificationsService.publish).toHaveBeenCalledTimes(1);
    expect(dependencies.notificationsService.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "group_join_request" }),
    );
  });

  it("lets an owner approve or reject a requested participant and exposes canonical states", async () => {
    const row = plan("moderation", new Date("2099-01-01T10:00:00.000Z")) as any;
    row.members.push({ role: "admin", status: "accepted", user: user("admin-1"), userId: "admin-1" });
    const target = { createdAt: new Date("2098-01-01"), id: "membership-1", status: "requested", user: user("viewer-1"), userId: "viewer-1" };
    const { dependencies, service: plans } = service();
    dependencies.plansRepository.findPlanById.mockResolvedValue(row);
    dependencies.plansRepository.listJoinRequests.mockResolvedValue([target]);
    dependencies.plansRepository.decideJoinRequest.mockResolvedValue({ count: 1 });

    const requests = await plans.listJoinRequests("admin-1", "moderation");
    const decision = await plans.decideJoinRequest("admin-1", "moderation", "membership-1", true);

    expect(requests.requests[0]).toMatchObject({
      id: "membership-1",
      participationState: "requested",
    });
    expect(decision).toEqual({ participationState: "approved", requestId: "membership-1" });
    expect(dependencies.notificationsService.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "group_join_approved" }),
    );

    await expect(
      plans.listJoinRequests("not-an-admin", "moderation"),
    ).rejects.toMatchObject({ response: { code: "PLAN_ADMIN_REQUIRED" } });
  });

  it("keeps join policies and repeated open joins idempotent", async () => {
    const row = plan("open", new Date("2099-01-01T10:00:00.000Z"));
    (row as any).members.push({
      role: "member",
      status: "accepted",
      user: user("viewer-1"),
      userId: "viewer-1",
    });
    const { dependencies, service: plans } = service();
    dependencies.plansRepository.findPlanById.mockResolvedValue(row);
    dependencies.plansRepository.joinPlan.mockResolvedValue({ changed: false, kind: "accepted", membership: {} });
    dependencies.plansRepository.findMembership.mockResolvedValue({ status: "accepted" });

    await expect(plans.join("viewer-1", "open")).resolves.toMatchObject({
      plan: { participationState: "approved" },
    });
    expect(dependencies.notificationsService.publish).not.toHaveBeenCalled();
  });

  it("blocks RSVP and chat for requested participants", async () => {
    const { dependencies, service: plans } = service();
    dependencies.plansRepository.findMembership.mockResolvedValue({ status: "requested" });

    await expect(
      plans.setRsvp("viewer-1", "plan-1", "event-1", { rsvp: "going" }),
    ).rejects.toMatchObject({ response: { code: "PLAN_ACCEPTED_MEMBERS_ONLY" } });
    await expect(
      plans.listMessages("viewer-1", "plan-1", { limit: 20 } as never),
    ).rejects.toMatchObject({ response: { code: "PLAN_ACCEPTED_MEMBERS_ONLY" } });
    expect(dependencies.eventsService.setGroupEventRsvp).not.toHaveBeenCalled();
    expect(dependencies.plansRepository.listMessages).not.toHaveBeenCalled();
  });

  it("sends and paginates text-only chat for approved members", async () => {
    const { dependencies, service: plans } = service();
    const message = { author: user("viewer-1"), body: "Llegamos", createdAt: new Date("2099-01-01"), id: "m1" };
    dependencies.plansRepository.findMembership.mockResolvedValue({ status: "accepted" });
    dependencies.plansRepository.listMessages.mockResolvedValue({ hasMore: true, messages: [message] });
    dependencies.plansRepository.createMessage.mockResolvedValue(message);
    dependencies.plansRepository.findPlanById.mockResolvedValue(plan("chat", new Date("2099-01-01")));

    const listed = await plans.listMessages("viewer-1", "chat", { limit: 20 } as never);
    const sent = await plans.sendMessage("viewer-1", "chat", { body: "Llegamos" });

    expect(listed.messages[0]).toMatchObject({ body: "Llegamos", id: "m1" });
    expect(listed.nextCursor).toBeTruthy();
    expect(sent.message).toMatchObject({ body: "Llegamos", id: "m1" });
    expect(dependencies.notificationsService.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "group_message" }),
    );
  });
});
