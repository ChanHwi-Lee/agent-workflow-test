import { Redis } from "ioredis";
import { Queue, QueueEvents, type Job, type QueueEventsListener } from "bullmq";
import type { FastifyPluginAsync } from "fastify";

import type {
  InterviewResumeJobPayload,
  RunJobEnvelope,
} from "@tooldi/agent-contracts";
import type { Logger } from "@tooldi/agent-observability";

export const RUN_EXECUTE_JOB_NAME = "run.execute";
export const INTERVIEW_RESUME_JOB_NAME = "interview.resume";

export type RunQueueJobPayload = RunJobEnvelope | InterviewResumeJobPayload;

export interface EnqueuedRunJob {
  jobId: string;
  enqueuedAt: string;
  payload: RunJobEnvelope;
}

export interface EnqueuedInterviewResumeJob {
  jobId: string;
  enqueuedAt: string;
  payload: InterviewResumeJobPayload;
}

export type QueueTransportState = "active" | "completed" | "failed" | "stalled";

export interface QueueTransportSignal {
  queueJobId: string;
  transportJobId?: string;
  jobName?: string;
  state: QueueTransportState;
  occurredAt: string;
  failedReason?: string;
}

export type QueueTransportObserver = (
  signal: QueueTransportSignal,
) => void | Promise<void>;

export interface RunQueueProducer {
  enqueueRunJob(
    payload: RunJobEnvelope,
    options?: {
      delayMs?: number;
      timeoutMs?: number;
    },
  ): Promise<EnqueuedRunJob>;
  enqueueInterviewResume(
    payload: InterviewResumeJobPayload,
    options?: {
      timeoutMs?: number;
    },
  ): Promise<EnqueuedInterviewResumeJob>;
  listJobs(): Promise<readonly EnqueuedRunJob[]>;
  tryRemoveQueuedJob(queueJobId: string): Promise<boolean>;
  observeTransport(observer: QueueTransportObserver): () => void;
  close(): Promise<void>;
}

export class RunQueueEnqueueTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunQueueEnqueueTimeoutError";
  }
}

export function normalizeQueueTransportSignal(input: {
  jobId: string;
  jobName?: string;
  payload?: unknown;
}): Pick<QueueTransportSignal, "queueJobId" | "transportJobId" | "jobName"> {
  const payloadQueueJobId = readPayloadQueueJobId(input.payload);
  const resumeQueueJobId = parseInterviewResumeTransportJobId(input.jobId);
  const queueJobId =
    input.jobName === INTERVIEW_RESUME_JOB_NAME
      ? (payloadQueueJobId ?? resumeQueueJobId ?? input.jobId)
      : input.jobId;

  return {
    queueJobId,
    ...(input.jobId !== queueJobId ? { transportJobId: input.jobId } : {}),
    ...(input.jobName ? { jobName: input.jobName } : {}),
  };
}

function readPayloadQueueJobId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const queueJobId = (payload as { queueJobId?: unknown }).queueJobId;
  return typeof queueJobId === "string" && queueJobId.length > 0
    ? queueJobId
    : null;
}

function parseInterviewResumeTransportJobId(jobId: string): string | null {
  const marker = ":resume:";
  const markerIndex = jobId.indexOf(marker);
  if (markerIndex <= 0) {
    return null;
  }
  return jobId.slice(0, markerIndex);
}

class InMemoryRunQueueProducer implements RunQueueProducer {
  private readonly jobs: EnqueuedRunJob[] = [];
  private readonly observers = new Set<QueueTransportObserver>();

  async enqueueRunJob(
    payload: RunJobEnvelope,
    options: {
      delayMs?: number;
      timeoutMs?: number;
    } = {},
  ): Promise<EnqueuedRunJob> {
    const job: EnqueuedRunJob = {
      jobId: payload.queueJobId,
      enqueuedAt: new Date(Date.now() + (options.delayMs ?? 0)).toISOString(),
      payload,
    };
    this.jobs.push(job);
    return job;
  }

  async enqueueInterviewResume(
    payload: InterviewResumeJobPayload,
  ): Promise<EnqueuedInterviewResumeJob> {
    return {
      jobId: `${payload.queueJobId}:resume:${Date.now()}`,
      enqueuedAt: new Date().toISOString(),
      payload,
    };
  }

  async listJobs(): Promise<readonly EnqueuedRunJob[]> {
    return this.jobs;
  }

  async tryRemoveQueuedJob(queueJobId: string): Promise<boolean> {
    const index = this.jobs.findIndex((job) => job.jobId === queueJobId);
    if (index < 0) {
      return false;
    }
    this.jobs.splice(index, 1);
    return true;
  }

  observeTransport(observer: QueueTransportObserver): () => void {
    this.observers.add(observer);
    return () => {
      this.observers.delete(observer);
    };
  }

  async close(): Promise<void> {
    this.observers.clear();
  }
}

class BullMqRunQueueProducer implements RunQueueProducer {
  private readonly observers = new Set<QueueTransportObserver>();
  private readonly queue: Queue<RunQueueJobPayload>;
  private readonly queueEvents: QueueEvents;
  private readonly producerConnection: Redis;
  private readonly eventsConnection: Redis;
  private readonly registeredListeners: Array<{
    event: keyof QueueEventsListener;
    listener: (...args: never[]) => void;
  }> = [];

  constructor(
    redisUrl: string,
    queueName: string,
    private readonly logger: Logger,
  ) {
    this.producerConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.eventsConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<RunQueueJobPayload>(queueName, {
      connection: this.producerConnection,
    });
    this.queueEvents = new QueueEvents(queueName, {
      connection: this.eventsConnection,
    });
    this.bindTransportSignals();
  }

  async enqueueRunJob(
    payload: RunJobEnvelope,
    options: {
      delayMs?: number;
      timeoutMs?: number;
    } = {},
  ): Promise<EnqueuedRunJob> {
    const addPromise = this.queue.add(RUN_EXECUTE_JOB_NAME, payload, {
      jobId: payload.queueJobId,
      attempts: 1,
      ...(options.delayMs !== undefined ? { delay: options.delayMs } : {}),
      removeOnComplete: false,
      removeOnFail: false,
    });
    let timeoutHandle: NodeJS.Timeout | undefined;
    try {
      const job =
        options.timeoutMs === undefined
          ? await addPromise
          : await Promise.race([
              addPromise,
              new Promise<never>((_, reject) => {
                timeoutHandle = setTimeout(() => {
                  reject(
                    new RunQueueEnqueueTimeoutError(
                      `Timed out while enqueueing ${payload.queueJobId} after ${options.timeoutMs}ms`,
                    ),
                  );
                }, options.timeoutMs);
                timeoutHandle.unref?.();
              }),
            ]);

      return {
        jobId: this.asJobId(job),
        enqueuedAt: new Date(job.timestamp).toISOString(),
        payload: job.data as RunJobEnvelope,
      };
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  async enqueueInterviewResume(
    payload: InterviewResumeJobPayload,
    options: {
      timeoutMs?: number;
    } = {},
  ): Promise<EnqueuedInterviewResumeJob> {
    const resumeJobId = `${payload.queueJobId}:resume:${Date.now()}`;
    const addPromise = this.queue.add(INTERVIEW_RESUME_JOB_NAME, payload, {
      jobId: resumeJobId,
      attempts: 1,
      removeOnComplete: false,
      removeOnFail: false,
    });
    let timeoutHandle: NodeJS.Timeout | undefined;
    try {
      const job =
        options.timeoutMs === undefined
          ? await addPromise
          : await Promise.race([
              addPromise,
              new Promise<never>((_, reject) => {
                timeoutHandle = setTimeout(() => {
                  reject(
                    new RunQueueEnqueueTimeoutError(
                      `Timed out while enqueueing interview resume ${resumeJobId} after ${options.timeoutMs}ms`,
                    ),
                  );
                }, options.timeoutMs);
                timeoutHandle.unref?.();
              }),
            ]);
      return {
        jobId: this.asJobId(job),
        enqueuedAt: new Date(job.timestamp).toISOString(),
        payload: job.data as InterviewResumeJobPayload,
      };
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  async listJobs(): Promise<readonly EnqueuedRunJob[]> {
    const jobs = await this.queue.getJobs([
      "waiting",
      "active",
      "delayed",
      "completed",
      "failed",
    ]);
    return jobs
      .map((job) => this.toEnqueuedRunJob(job))
      .filter((job): job is EnqueuedRunJob => job !== null);
  }

  async tryRemoveQueuedJob(queueJobId: string): Promise<boolean> {
    const job = await this.queue.getJob(queueJobId);
    if (!job) {
      return false;
    }

    const state = await job.getState();
    if (state !== "waiting" && state !== "delayed") {
      return false;
    }

    await job.remove();
    return true;
  }

  observeTransport(observer: QueueTransportObserver): () => void {
    this.observers.add(observer);
    return () => {
      this.observers.delete(observer);
    };
  }

  async close(): Promise<void> {
    for (const { event, listener } of this.registeredListeners) {
      this.queueEvents.off(event, listener);
    }
    this.registeredListeners.length = 0;
    this.observers.clear();
    await this.queueEvents.close();
    await this.queue.close();
    await this.eventsConnection.quit();
    await this.producerConnection.quit();
  }

  private bindTransportSignals(): void {
    this.onQueueEvent("active", ({ jobId }) => {
      if (jobId) {
        void this.publishTransportSignalForJob({
          jobId,
          state: "active",
        });
      }
    });

    this.onQueueEvent("completed", ({ jobId }) => {
      if (jobId) {
        void this.publishTransportSignalForJob({
          jobId,
          state: "completed",
        });
      }
    });

    this.onQueueEvent("failed", ({ jobId, failedReason }) => {
      if (jobId) {
        void this.publishTransportSignalForJob({
          jobId,
          state: "failed",
          ...(failedReason ? { failedReason } : {}),
        });
      }
    });

    this.onQueueEvent("stalled", ({ jobId }) => {
      if (jobId) {
        void this.publishTransportSignalForJob({
          jobId,
          state: "stalled",
        });
      }
    });

    this.onQueueEvent("error", (error) => {
      this.logger.error("BullMQ QueueEvents error", {
        message:
          error instanceof Error ? error.message : "Unknown QueueEvents error",
      });
    });
  }

  private async publishTransportSignalForJob(input: {
    jobId: string;
    state: QueueTransportState;
    failedReason?: string;
  }): Promise<void> {
    const job = await this.queue.getJob(input.jobId);
    const normalized = normalizeQueueTransportSignal({
      jobId: input.jobId,
      ...(job?.name ? { jobName: job.name } : {}),
      payload: job?.data,
    });
    await this.publishTransportSignal({
      ...normalized,
      state: input.state,
      occurredAt: new Date().toISOString(),
      ...(input.failedReason ? { failedReason: input.failedReason } : {}),
    });
  }

  private onQueueEvent<EventName extends keyof QueueEventsListener>(
    event: EventName,
    listener: QueueEventsListener[EventName],
  ): void {
    this.queueEvents.on(event, listener);
    this.registeredListeners.push({
      event,
      listener: listener as (...args: never[]) => void,
    });
  }

  private async publishTransportSignal(
    signal: QueueTransportSignal,
  ): Promise<void> {
    for (const observer of this.observers) {
      try {
        await observer(signal);
      } catch (error) {
        this.logger.warn("Queue transport observer failed", {
          queueJobId: signal.queueJobId,
          state: signal.state,
          error:
            error instanceof Error
              ? error.message
              : "Unknown queue observer error",
        });
      }
    }
  }

  private toEnqueuedRunJob(
    job: Job<RunQueueJobPayload>,
  ): EnqueuedRunJob | null {
    const jobId = this.asJobId(job);
    if (jobId.length === 0) {
      return null;
    }
    if (job.name !== RUN_EXECUTE_JOB_NAME) {
      return null;
    }
    return {
      jobId,
      enqueuedAt: new Date(job.timestamp).toISOString(),
      payload: job.data as RunJobEnvelope,
    };
  }

  private asJobId(job: Job<RunQueueJobPayload>): string {
    return typeof job.id === "string" ? job.id : String(job.id ?? "");
  }
}

export const queuePlugin: FastifyPluginAsync = async (app) => {
  const runQueue: RunQueueProducer =
    app.config.queueTransportMode === "memory"
      ? new InMemoryRunQueueProducer()
      : new BullMqRunQueueProducer(
          app.config.redisUrl,
          app.config.bullmqQueueName,
          app.appLogger.child({
            plugin: "queue",
            queueName: app.config.bullmqQueueName,
          }),
        );
  app.decorate("runQueue", runQueue);

  app.addHook("onClose", async () => {
    await runQueue.close();
  });
};
