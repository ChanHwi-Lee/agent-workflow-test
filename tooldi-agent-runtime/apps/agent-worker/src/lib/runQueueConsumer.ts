import { Redis } from "ioredis";
import { Worker, type Job } from "bullmq";

import {
  firstRunJobEnvelopeError,
  isRunJobEnvelope,
  type RunJobEnvelope,
} from "@tooldi/agent-contracts";
import type { AgentWorkerEnv } from "@tooldi/agent-config";
import type { Logger } from "@tooldi/agent-observability";

export interface RunQueueConsumer {
  readonly mode: "bullmq" | "disabled";
  close(): Promise<void>;
}

export interface CreateRunQueueConsumerOptions {
  env: AgentWorkerEnv;
  logger: Logger;
  processRunJob(job: RunJobEnvelope): Promise<void>;
}

class DisabledRunQueueConsumer implements RunQueueConsumer {
  readonly mode = "disabled" as const;

  async close(): Promise<void> {}
}

class BullMqRunQueueConsumer implements RunQueueConsumer {
  readonly mode = "bullmq" as const;
  private readonly connection: Redis;
  private readonly worker: Worker<RunJobEnvelope>;

  constructor(
    options: CreateRunQueueConsumerOptions,
    processRunJob: (job: RunJobEnvelope) => Promise<void>,
  ) {
    this.connection = new Redis(options.env.redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.worker = new Worker<RunJobEnvelope>(
      options.env.bullmqQueueName,
      async (job) => {
        const payload = this.validateJobData(job);
        await processRunJob(payload);
      },
      {
        connection: this.connection,
        concurrency: options.env.workerConcurrency,
        maxStartedAttempts: 1,
        maxStalledCount: 0,
        lockDuration: options.env.leaseTtlMs,
      },
    );

    this.worker.on("completed", (job) => {
      options.logger.info("BullMQ worker completed job", {
        runId: job.data.runId,
        traceId: job.data.traceId,
        queueJobId: job.data.queueJobId,
        bullmqJobId: typeof job.id === "string" ? job.id : String(job.id ?? ""),
      });
    });
    this.worker.on("failed", (job, error) => {
      options.logger.warn("BullMQ worker job failed", {
        runId: job?.data.runId,
        traceId: job?.data.traceId,
        queueJobId: job?.data.queueJobId,
        error: error.message,
      });
    });
    this.worker.on("error", (error) => {
      options.logger.error("BullMQ worker transport error", {
        error: error.message,
      });
    });
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.connection.quit();
  }

  private validateJobData(job: Job<RunJobEnvelope>): RunJobEnvelope {
    if (!isRunJobEnvelope(job.data)) {
      const message =
        firstRunJobEnvelopeError(job.data) ??
        "BullMQ job payload failed RunJobEnvelope validation";
      throw new Error(message);
    }
    return job.data;
  }
}

export async function createRunQueueConsumer(
  options: CreateRunQueueConsumerOptions,
): Promise<RunQueueConsumer> {
  if (options.env.queueTransportMode === "disabled") {
    options.logger.warn("Worker queue transport is disabled", {
      queueName: options.env.bullmqQueueName,
    });
    return new DisabledRunQueueConsumer();
  }

  return new BullMqRunQueueConsumer(options, options.processRunJob);
}
