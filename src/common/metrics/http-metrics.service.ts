import { Injectable } from "@nestjs/common";

type HttpMetricKey = `${string} ${string} ${number}`;

export type HttpMetricsSnapshot = {
  requestsTotal: number;
  byRoute: Record<string, number>;
  durationMs: {
    count: number;
    sum: number;
    max: number;
  };
};

@Injectable()
export class HttpMetricsService {
  private requestsTotal = 0;
  private readonly byRoute = new Map<HttpMetricKey, number>();
  private durationCount = 0;
  private durationSum = 0;
  private durationMax = 0;

  record(input: {
    method: string;
    route: string;
    statusCode: number;
    durationMs: number;
  }) {
    this.requestsTotal += 1;
    this.durationCount += 1;
    this.durationSum += input.durationMs;
    this.durationMax = Math.max(this.durationMax, input.durationMs);

    const key = `${input.method} ${input.route} ${input.statusCode}` as HttpMetricKey;
    this.byRoute.set(key, (this.byRoute.get(key) ?? 0) + 1);
  }

  snapshot(): HttpMetricsSnapshot {
    const byRoute: Record<string, number> = {};
    for (const [key, count] of this.byRoute.entries()) {
      byRoute[key] = count;
    }

    return {
      requestsTotal: this.requestsTotal,
      byRoute,
      durationMs: {
        count: this.durationCount,
        sum: this.durationSum,
        max: this.durationMax,
      },
    };
  }
}
