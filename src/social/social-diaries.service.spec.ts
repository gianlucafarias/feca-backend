import { describe, expect, it, vi } from "vitest";

import { SocialDiariesService } from "./social-diaries.service";

describe("SocialDiariesService", () => {
  it("returns no diaries when the owner's global privacy disallows access", async () => {
    const listDiariesByUser = vi.fn();
    const socialRepository = {
      findUserByIdWithContext: vi.fn().mockResolvedValue({
        permissions: { canViewDiaries: false },
      }),
      listDiariesByUser,
    };
    const service = new SocialDiariesService(
      socialRepository as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.listUserDiaries("viewer-1", "owner-1"),
    ).resolves.toEqual({
      diaries: [],
      total: 0,
    });
    expect(listDiariesByUser).not.toHaveBeenCalled();
  });
});
