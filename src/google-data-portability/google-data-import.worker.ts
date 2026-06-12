import { Injectable } from "@nestjs/common";

import {
  QUEUE_JOBS,
  type GoogleImportIngestJobPayload,
  type GoogleImportJobPayload,
} from "../infrastructure/queue/queue.types";
import { QueueService } from "../infrastructure/queue/queue.service";
import { GoogleDataPortabilityImportService } from "./google-data-portability-import.service";

@Injectable()
export class GoogleDataImportWorker {
  constructor(
    queueService: QueueService,
    importService: GoogleDataPortabilityImportService,
  ) {
    queueService.registerHandler<GoogleImportJobPayload>(
      QUEUE_JOBS.GOOGLE_IMPORT_PROCESS_ARCHIVE,
      async (payload) => {
        await importService.executeProcessCompletedArchive(
          payload.userId,
          payload.importId,
        );
      },
    );

    queueService.registerHandler<GoogleImportIngestJobPayload>(
      QUEUE_JOBS.GOOGLE_IMPORT_INGEST_SAVED,
      async (payload) => {
        await importService.executeIngestSavedCollections(payload);
      },
    );

    queueService.registerHandler<GoogleImportJobPayload>(
      QUEUE_JOBS.GOOGLE_IMPORT_RETRY,
      async (payload) => {
        await importService.executeRetry(payload.userId, payload.importId);
      },
    );
  }
}
