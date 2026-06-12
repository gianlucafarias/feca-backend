export const QUEUE_JOBS = {
  PUSH_DISPATCH: "feca.push.dispatch",
  GOOGLE_IMPORT_PROCESS_ARCHIVE: "feca.google-import.process-archive",
  GOOGLE_IMPORT_INGEST_SAVED: "feca.google-import.ingest-saved",
  GOOGLE_IMPORT_RETRY: "feca.google-import.retry",
} as const;

export type QueueJobName = (typeof QUEUE_JOBS)[keyof typeof QUEUE_JOBS];

export type PushDispatchJobPayload = {
  limit?: number;
};

export type GoogleImportJobPayload = {
  userId: string;
  importId: string;
};

export type GoogleImportIngestJobPayload = GoogleImportJobPayload & {
  items: Array<{
    sourceKey: string;
    title?: string;
    url?: string;
    rawPayload?: Record<string, unknown>;
  }>;
};

export type QueueJobPayload =
  | PushDispatchJobPayload
  | GoogleImportJobPayload
  | GoogleImportIngestJobPayload;

export type EnqueueOptions = {
  /** Dedupe concurrent jobs (pg-boss singletonKey). */
  singletonKey?: string;
};
