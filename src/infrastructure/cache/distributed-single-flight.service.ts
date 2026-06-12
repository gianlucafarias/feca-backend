import { createHash } from "node:crypto";

import { Inject, Injectable, Optional } from "@nestjs/common";
import Redis from "ioredis";

import { REDIS_CLIENT } from "../redis/redis.constants";

const LOCK_TTL_SECONDS = 30;
const POLL_INTERVAL_MS = 50;
const MAX_WAIT_MS = 30_000;

export type SingleFlightOptions<T> = {
  onJoined?: () => void;
  readCached?: () => Promise<T | undefined>;
};

@Injectable()
export class DistributedSingleFlightService {
  private readonly localInflight = new Map<string, Promise<unknown>>();

  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  async run<T>(
    key: string,
    load: () => Promise<T>,
    options: SingleFlightOptions<T> = {},
  ): Promise<T> {
    const existing = this.localInflight.get(key) as Promise<T> | undefined;
    if (existing) {
      options.onJoined?.();
      return existing;
    }

    const promise = this.runWithOptionalRedis(key, load, options);
    this.localInflight.set(key, promise);

    try {
      return await promise;
    } finally {
      this.localInflight.delete(key);
    }
  }

  private async runWithOptionalRedis<T>(
    key: string,
    load: () => Promise<T>,
    options: SingleFlightOptions<T>,
    attempt = 0,
  ): Promise<T> {
    if (!this.redis) {
      return load();
    }

    if (attempt > 3) {
      return load();
    }

    const lockKey = this.buildLockKey(key);
    const acquired = await this.redis.set(lockKey, "1", "EX", LOCK_TTL_SECONDS, "NX");

    if (acquired === "OK") {
      try {
        return await load();
      } finally {
        await this.redis.del(lockKey);
      }
    }

    options.onJoined?.();

    if (options.readCached) {
      const deadline = Date.now() + MAX_WAIT_MS;
      while (Date.now() < deadline) {
        const cached = await options.readCached();
        if (cached !== undefined) {
          return cached;
        }

        const lockStillHeld = await this.redis.exists(lockKey);
        if (lockStillHeld === 0) {
          return this.runWithOptionalRedis(key, load, options, attempt + 1);
        }

        await delay(POLL_INTERVAL_MS);
      }
    }

    return load();
  }

  private buildLockKey(key: string) {
    const digest = createHash("sha256").update(key).digest("hex");
    return `feca:sf:lock:${digest}`;
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
