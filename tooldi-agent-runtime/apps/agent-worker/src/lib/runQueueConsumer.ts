import { Redis } from "ioredis";
import { Worker, type Job } from "bullmq";

import {
  firstInterviewResumeJobPayloadError,
  firstRunJobEnvelopeError,
  isInterviewResumeJobPayload,
  isRunJobEnvelope,
  type InterviewResumeJobPayload,
  type RunJobEnvelope,
} from "@tooldi/agent-contracts";
import type { AgentWorkerEnv } from "@tooldi/agent-config";
import type { Logger } from "@tooldi/agent-observability";

const RUN_EXECUTE_JOB_NAME = "run.execute";
const INTERVIEW_RESUME_JOB_NAME = "interview.resume";

export interface RunQueueConsumer {
  readonly mode: "bullmq" | "disabled";
  close(): Promise<void>;
}

export interface CreateRunQueueConsumerOptions {
  env: AgentWorkerEnv;
  logger: Logger;
  processRunJob(job: RunJobEnvelope): Promise<void>;
  resumeRunJob(payload: InterviewResumeJobPayload): Promise<void>;
}

class DisabledRunQueueConsumer implements RunQueueConsumer {
  readonly mode = "disabled" as const;

  async close(): Promise<void> {}
}

class BullMqRunQueueConsumer implements RunQueueConsumer {
  readonly mode = "bullmq" as const;
  private readonly connection: Redis;
  private readonly worker: Worker<unknown>;

  constructor(options: CreateRunQueueConsumerOptions) {
    this.connection = new Redis(options.env.redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.worker = new Worker<unknown>(
      options.env.bullmqQueueName,
      async (job) => {
        await this.dispatch(job, options);
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
        jobName: job.name,
        bullmqJobId: typeof job.id === "string" ? job.id : String(job.id ?? ""),
      });
    });
    this.worker.on("failed", (job, error) => {
      options.logger.warn("BullMQ worker job failed", {
        jobName: job?.name,
        bullmqJobId: job ? (typeof job.id === "string" ? job.id : String(job.id ?? "")) : null,
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

  private async dispatch(
    job: Job<unknown>,
    options: CreateRunQueueConsumerOptions,
  ): Promise<void> {
    if (job.name === RUN_EXECUTE_JOB_NAME) {
      const payload = this.validateRunJobEnvelope(job);
      await options.processRunJob(payload);
      return;
    }
    if (job.name === INTERVIEW_RESUME_JOB_NAME) {
      const payload = this.validateInterviewResumePayload(job);
      try {
        await options.resumeRunJob(payload);
      } catch (error) {
        if (error instanceof Error && error.name === "DuplicateResumeIgnoredError") {
          options.logger.info(
            "Skipped duplicate interview.resume job (graph already past interrupt)",
            {
              runId: payload.runId,
              attemptSeq: payload.attemptSeq,
              queueJobId: payload.queueJobId,
            },
          );
          return;
        }
        throw error;
      }
      return;
    }
    throw new Error(`BullMQ job has unsupported name: ${job.name}`);
  }

  private validateRunJobEnvelope(job: Job<unknown>): RunJobEnvelope {
    if (!isRunJobEnvelope(job.data)) {
      const message =
        firstRunJobEnvelopeError(job.data) ??
        "BullMQ job payload failed RunJobEnvelope validation";
      throw new Error(message);
    }
    return job.data;
  }

  private validateInterviewResumePayload(
    job: Job<unknown>,
  ): InterviewResumeJobPayload {
    if (!isInterviewResumeJobPayload(job.data)) {
      const message =
        firstInterviewResumeJobPayloadError(job.data) ??
        "BullMQ job payload failed InterviewResumeJobPayload validation";
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

  return new BullMqRunQueueConsumer(options);
}
