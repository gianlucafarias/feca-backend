import { randomUUID } from "node:crypto";

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import PgBoss = require("pg-boss");

import { AppConfigService } from "../../config/app-config.service";
import type { EnqueueOptions, QueueJobName } from "./queue.types";

type JobHandler = (payload: unknown) => Promise<void>;

type PgBossClient = InstanceType<typeof PgBoss>;

type RegisteredWorker = {
  handler: JobHandler;
  name: QueueJobName;
};

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly workers: RegisteredWorker[] = [];
  private boss: PgBossClient | null = null;
  private started = false;
  private workerIds: string[] = [];

  constructor(private readonly config: AppConfigService) {}

  registerHandler<T>(name: QueueJobName, handler: (payload: T) => Promise<void>) {
    this.workers.push({
      name,
      handler: (payload) => handler(payload as T),
    });
  }

  async enqueue<T>(
    name: QueueJobName,
    payload: T,
    options?: EnqueueOptions,
  ): Promise<string> {
    if (this.boss) {
      const jobId = await this.boss.send(name, payload as object, {
        singletonKey: options?.singletonKey,
        retryLimit: 3,
        retryDelay: 30,
        retryBackoff: true,
      });

      return jobId ?? randomUUID();
    }

    const jobId = randomUUID();
    setImmediate(() => {
      void this.runInProcess(name, payload).catch((error) => {
        this.logger.error(
          `In-process job ${name} (${jobId}) failed`,
          error instanceof Error ? error.stack : error,
        );
      });
    });

    return jobId;
  }

  usesPgBoss() {
    return this.boss !== null;
  }

  async onModuleInit() {
    if (this.config.queueBackend !== "pg-boss") {
      this.logger.log("Queue backend: in-process");
      this.started = true;
      return;
    }

    this.boss = new PgBoss({
      connectionString: this.config.databaseUrl,
      schema: "pgboss",
      application_name: "feca-backend",
    });

    this.boss.on("error", (error) => {
      this.logger.error("pg-boss error", error.stack);
    });

    await this.boss.start();

    for (const worker of this.workers) {
      await this.boss.createQueue(worker.name);
      const workerId = await this.boss.work(worker.name, async (jobs) => {
        for (const job of jobs) {
          await worker.handler(job.data);
        }
      });
      this.workerIds.push(workerId);
    }

    this.started = true;
    this.logger.log(`Queue backend: pg-boss (${this.workers.length} workers)`);
  }

  async onModuleDestroy() {
    if (!this.boss) {
      return;
    }

    for (const workerId of this.workerIds) {
      await this.boss.offWork({ id: workerId });
    }

    await this.boss.stop({ graceful: true, timeout: 10_000 });
    this.boss = null;
  }

  private async runInProcess(name: QueueJobName, payload: unknown) {
    const worker = this.workers.find((entry) => entry.name === name);
    if (!worker) {
      this.logger.warn(`No handler registered for in-process job ${name}`);
      return;
    }

    await worker.handler(payload);
  }
}
