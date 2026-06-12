import { describe, expect, it, vi } from "vitest";

import {
  shouldUseStructuredLogger,
  writeStructuredLog,
} from "../../src/common/logging/structured-logger";
import { requestContextStorage } from "../../src/common/request-context/request-context.storage";

describe("writeStructuredLog", () => {
  it("writes JSON with request context when available", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    requestContextStorage.run(
      {
        requestId: "req-123",
        method: "GET",
        path: "/v1/places/nearby",
        startedAt: Date.now(),
      },
      () => {
        writeStructuredLog("info", "test_event", { statusCode: 200 });
      },
    );

    expect(logSpy).toHaveBeenCalledOnce();
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload).toMatchObject({
      level: "info",
      service: "feca-backend",
      msg: "test_event",
      requestId: "req-123",
      method: "GET",
      path: "/v1/places/nearby",
      statusCode: 200,
    });

    logSpy.mockRestore();
  });
});

describe("shouldUseStructuredLogger", () => {
  it("enables structured logs only in production", () => {
    expect(shouldUseStructuredLogger("production")).toBe(true);
    expect(shouldUseStructuredLogger("development")).toBe(false);
    expect(shouldUseStructuredLogger("test")).toBe(false);
  });
});
