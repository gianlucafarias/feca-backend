import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import type { AppConfigService } from "../../config/app-config.service";
import { HttpMetricsController } from "./http-metrics.controller";
import { HttpMetricsService } from "./http-metrics.service";

function buildController(secret = "a".repeat(48)) {
  const config = {
    internalNotificationsSecret: secret,
  } as AppConfigService;
  const metrics = new HttpMetricsService();

  return {
    controller: new HttpMetricsController(config, metrics),
    metrics,
    secret,
  };
}

describe("HttpMetricsController", () => {
  it("returns the current snapshot to an authorized operator", () => {
    const { controller, metrics, secret } = buildController();
    metrics.record({
      durationMs: 42,
      method: "GET",
      route: "/v1/feed",
      statusCode: 200,
    });

    expect(controller.getHttpMetrics(secret)).toMatchObject({
      http: {
        byRoute: {
          "GET /v1/feed 200": 1,
        },
        durationMs: {
          count: 1,
          max: 42,
          sum: 42,
        },
        requestsTotal: 1,
      },
      service: "feca-backend",
    });
  });

  it("rejects unauthorized access", () => {
    const { controller } = buildController();

    expect(() => controller.getHttpMetrics("wrong")).toThrow(
      UnauthorizedException,
    );
  });

  it("fails closed when the server secret is absent", () => {
    const { controller } = buildController("");

    expect(() => controller.getHttpMetrics("anything")).toThrow(
      ServiceUnavailableException,
    );
  });
});
