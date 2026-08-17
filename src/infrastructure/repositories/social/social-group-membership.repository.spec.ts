import { describe, expect, it, vi } from "vitest";

import { SocialGroupMembershipRepository } from "./social-group-membership.repository";

describe("SocialGroupMembershipRepository legacy code joins", () => {
  it("still accepts a member who arrives through an existing invitation code", async () => {
    const update = vi.fn();
    const hydratedGroup = { id: "group-1", members: [] };
    const tx = {
      group: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ id: "group-1" })
          .mockResolvedValueOnce(hydratedGroup),
      },
      groupMember: {
        findUnique: vi.fn().mockResolvedValue({
          id: "membership-1",
          status: "pending",
        }),
        update,
        create: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new SocialGroupMembershipRepository(prisma as never, {} as never);

    const result = await repository.joinGroupByCode("user-1", " legacy ");

    expect(update).toHaveBeenCalledWith({
      data: { status: "accepted" },
      where: { id: "membership-1" },
    });
    expect(result).toMatchObject({ group: hydratedGroup, joinedNow: true });
  });
});
