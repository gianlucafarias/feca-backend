import { describe, expect, it } from "vitest";

import { HttpMetricsService } from "../../src/common/metrics/http-metrics.service";

describe("HttpMetricsService", () => {
  it("records request counts and duration stats", () => {
    const metrics = new HttpMetricsService();

    metrics.record({
      method: "GET",
      route: "/v1/places/nearby",
      statusCode: 200,
      durationMs: 120,
    });
    metrics.record({
      method: "GET",
      route: "/v1/places/nearby",
      statusCode: 200,
      durationMs: 80,
    });

    const snapshot = metrics.snapshot();
    expect(snapshot.requestsTotal).toBe(2);
    expect(snapshot.byRoute["GET /v1/places/nearby 200"]).toBe(2);
    expect(snapshot.durationMs).toEqual({
      count: 2,
      sum: 200,
      max: 120,
    });
  });
});
