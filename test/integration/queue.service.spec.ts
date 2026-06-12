import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppConfigModule } from "../../src/config/app-config.module";
import { validateEnv } from "../../src/config/env.validation";
import { QueueModule } from "../../src/infrastructure/queue/queue.module";
import { QueueService } from "../../src/infrastructure/queue/queue.service";
import { QUEUE_JOBS } from "../../src/infrastructure/queue/queue.types";

describe("QueueService (in-process)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("runs registered handlers asynchronously", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("QUEUE_BACKEND", "in-process");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:test@localhost:5432/feca_test");
    vi.stubEnv("AUTH_JWT_ACCESS_SECRET", "test-jwt-secret-min-16-chars");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-google-maps-server-key");
    vi.stubEnv("GOOGLE_OAUTH_WEB_CLIENT_ID", "123456789-test.apps.googleusercontent.com");

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateEnv,
        }),
        AppConfigModule,
        QueueModule,
      ],
    }).compile();

    const queueService = moduleRef.get(QueueService);
    await moduleRef.init();

    const handler = vi.fn(async () => undefined);
    queueService.registerHandler(QUEUE_JOBS.PUSH_DISPATCH, handler);

    const jobId = await queueService.enqueue(QUEUE_JOBS.PUSH_DISPATCH, { limit: 5 });

    expect(jobId).toBeTruthy();
    expect(handler).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(handler).toHaveBeenCalledWith({ limit: 5 });

    await moduleRef.close();
  });
});
