import { describe, expect, it, vi } from "vitest";

import { AuthRepository } from "./auth.repository";

describe("AuthRepository.rotateActiveSession", () => {
  it("creates the replacement only when the old session is revoked once", async () => {
    const create = vi.fn().mockResolvedValue({});
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      $transaction: (callback: (tx: unknown) => unknown) =>
        callback({ session: { create, updateMany } }),
    };
    const repository = new AuthRepository(prisma as never);

    await expect(
      repository.rotateActiveSession("session-1", {
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        refreshTokenHash: "hash",
        userId: "user-1",
      }),
    ).resolves.toBe(true);
    expect(create).toHaveBeenCalledOnce();
  });

  it("rejects a replay without creating a second session", async () => {
    const create = vi.fn();
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      $transaction: (callback: (tx: unknown) => unknown) =>
        callback({ session: { create, updateMany } }),
    };
    const repository = new AuthRepository(prisma as never);

    await expect(
      repository.rotateActiveSession("already-revoked", {
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        refreshTokenHash: "hash",
        userId: "user-1",
      }),
    ).resolves.toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});
