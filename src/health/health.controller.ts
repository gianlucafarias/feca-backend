import { Controller, Get } from "@nestjs/common";

import { AppConfigService } from "../config/app-config.service";

@Controller()
export class HealthController {
  constructor(private readonly config: AppConfigService) {}

  @Get("health")
  getHealth() {
    return {
      ok: true,
      service: "feca-backend",
      googlePlacesConfigured: Boolean(this.config.googleMapsApiKey),
      now: new Date().toISOString(),
    };
  }
}

