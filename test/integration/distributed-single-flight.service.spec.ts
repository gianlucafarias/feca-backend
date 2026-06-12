import { describe, expect, it, vi } from "vitest";

import { DistributedSingleFlightService } from "../../src/infrastructure/cache/distributed-single-flight.service";

describe("DistributedSingleFlightService", () => {
  it("deduplicates concurrent calls in memory", async () => {
    const service = new DistributedSingleFlightService(null);
    const load = vi.fn(async () => {
      await delay(20);
      return "value";
    });

    const [first, second] = await Promise.all([
      service.run("key", load),
      service.run("key", load),
    ]);

    expect(first).toBe("value");
    expect(second).toBe("value");
    expect(load).toHaveBeenCalledOnce();
  });

  it("uses readCached while waiting for redis leader", async () => {
    const redis = {
      set: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(1),
      exists: vi.fn().mockResolvedValue(1),
    };

    const service = new DistributedSingleFlightService(redis as never);
    const readCached = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce("cached-value");
    const load = vi.fn(async () => "loaded-value");

    const result = await service.run("cache-key", load, { readCached });

    expect(result).toBe("cached-value");
    expect(load).not.toHaveBeenCalled();
  });
});

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
