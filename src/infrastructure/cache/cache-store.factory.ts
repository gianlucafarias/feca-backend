import { createKeyv } from "@keyv/redis";
import type { CacheManagerOptions } from "@nestjs/cache-manager";

export function buildCacheManagerOptions(input: {
  redisUrl?: string;
  ttlMs: number;
}): CacheManagerOptions {
  if (input.redisUrl) {
    return {
      ttl: input.ttlMs,
      stores: createKeyv(input.redisUrl, {
        namespace: "feca",
      }),
    };
  }

  return {
    ttl: input.ttlMs,
  };
}
