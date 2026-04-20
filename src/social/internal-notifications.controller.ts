import {
  Body,
  Controller,
  Headers,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";

import { AppConfigService } from "../config/app-config.service";
import { NotificationsAutomationService } from "./notifications-automation.service";
import { PushDispatchService } from "./push-dispatch.service";

@Controller("internal/notifications")
export class InternalNotificationsController {
  constructor(
    private readonly config: AppConfigService,
    private readonly pushDispatchService: PushDispatchService,
    private readonly notificationsAutomationService: NotificationsAutomationService,
  ) {}

  @Post("dispatch")
  dispatch(
    @Headers("x-feca-internal-secret") headerSecret?: string,
    @Headers("x-internal-notifications-secret") legacyHeaderSecret?: string,
    @Body() body?: { limit?: number },
  ) {
    this.assertAuthorized(headerSecret ?? legacyHeaderSecret);
    return this.pushDispatchService.dispatchPending(normalizeInternalLimit(body?.limit, 100));
  }

  @Post("receipts")
  receipts(
    @Headers("x-feca-internal-secret") headerSecret?: string,
    @Headers("x-internal-notifications-secret") legacyHeaderSecret?: string,
    @Body() body?: { limit?: number },
  ) {
    this.assertAuthorized(headerSecret ?? legacyHeaderSecret);
    return this.pushDispatchService.syncReceipts(normalizeInternalLimit(body?.limit, 300));
  }

  @Post("automations")
  automations(
    @Headers("x-feca-internal-secret") headerSecret?: string,
    @Headers("x-internal-notifications-secret") legacyHeaderSecret?: string,
  ) {
    this.assertAuthorized(headerSecret ?? legacyHeaderSecret);
    return this.notificationsAutomationService.runDueAutomations();
  }

  private assertAuthorized(secret?: string) {
    const configuredSecret = this.config.internalNotificationsSecret?.trim();

    if (!configuredSecret) {
      throw new ServiceUnavailableException(
        "Internal notifications secret is not configured",
      );
    }

    if (!secret || secret !== configuredSecret) {
      throw new UnauthorizedException("Invalid internal notifications secret");
    }
  }
}

function normalizeInternalLimit(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(value));
}
