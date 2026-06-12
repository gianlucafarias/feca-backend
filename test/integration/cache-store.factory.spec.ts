import { describe, expect, it } from "vitest";

import { buildCacheManagerOptions } from "../../src/infrastructure/cache/cache-store.factory";

describe("buildCacheManagerOptions", () => {
  it("returns in-memory cache options when redis is not configured", () => {
    expect(buildCacheManagerOptions({ ttlMs: 300_000 })).toEqual({
      ttl: 300_000,
    });
  });

  it("returns a redis-backed store when redis url is provided", () => {
    const options = buildCacheManagerOptions({
      redisUrl: "redis://localhost:6379",
      ttlMs: 300_000,
    });

    expect(options.ttl).toBe(300_000);
    expect(options.stores).toBeDefined();
  });
});
