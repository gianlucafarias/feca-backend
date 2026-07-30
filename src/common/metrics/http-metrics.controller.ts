import { Controller, Get, Headers } from "@nestjs/common";

import { AppConfigService } from "../../config/app-config.service";
import { assertInternalSecret } from "../security/internal-secret";
import { HttpMetricsService } from "./http-metrics.service";

@Controller("internal/metrics")
export class HttpMetricsController {
  constructor(
    private readonly config: AppConfigService,
    private readonly httpMetrics: HttpMetricsService,
  ) {}

  @Get("http")
  getHttpMetrics(
    @Headers("x-feca-internal-secret") headerSecret?: string,
    @Headers("x-internal-notifications-secret") legacyHeaderSecret?: string,
  ) {
    assertInternalSecret(
      this.config.internalNotificationsSecret,
      headerSecret ?? legacyHeaderSecret,
    );

    return {
      http: this.httpMetrics.snapshot(),
      now: new Date().toISOString(),
      service: "feca-backend",
    };
  }
}
