import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";

import { assertInternalSecret } from "../common/security/internal-secret";
import { AppConfigService } from "../config/app-config.service";
import { QueueService } from "../infrastructure/queue/queue.service";
import { NotificationsAutomationService } from "./notifications-automation.service";
import { PushDispatchService } from "./push-dispatch.service";

@Controller("internal/notifications")
export class InternalNotificationsController {
  constructor(
    private readonly config: AppConfigService,
    private readonly pushDispatchService: PushDispatchService,
    private readonly notificationsAutomationService: NotificationsAutomationService,
    private readonly queueService: QueueService,
  ) {}

  @Get("status")
  async status(
    @Headers("x-feca-internal-secret") headerSecret?: string,
    @Headers("x-internal-notifications-secret") legacyHeaderSecret?: string,
  ) {
    this.assertAuthorized(headerSecret ?? legacyHeaderSecret);

    const [push, queue] = await Promise.all([
      this.pushDispatchService.getOperationalStatus(),
      Promise.resolve(this.queueService.getOperationalStatus()),
    ]);
    const result = {
      healthy: push.healthy && queue.healthy,
      now: new Date().toISOString(),
      push,
      queue,
    };

    if (!result.healthy) {
      throw new ServiceUnavailableException(result);
    }

    return result;
  }

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
    assertInternalSecret(this.config.internalNotificationsSecret, secret);
  }
}

function normalizeInternalLimit(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(value));
}
