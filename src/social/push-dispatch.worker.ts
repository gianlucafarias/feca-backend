import { Injectable } from "@nestjs/common";

import { QUEUE_JOBS, type PushDispatchJobPayload } from "../infrastructure/queue/queue.types";
import { QueueService } from "../infrastructure/queue/queue.service";
import { PushDispatchService } from "./push-dispatch.service";

@Injectable()
export class PushDispatchWorker {
  constructor(
    queueService: QueueService,
    pushDispatchService: PushDispatchService,
  ) {
    queueService.registerHandler<PushDispatchJobPayload>(
      QUEUE_JOBS.PUSH_DISPATCH,
      async (payload) => {
        await pushDispatchService.dispatchPending(payload.limit ?? 100);
      },
    );
  }
}
