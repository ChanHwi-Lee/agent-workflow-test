import { Redis } from "ioredis";
import {
  Queue,
  QueueEvents,
  type Job,
  type QueueEventsListener,
} from "bullmq";
import type { FastifyPluginAsync } from "fastify";

import type { RunJobEnvelope } from "@tooldi/agent-contracts";
import type { Logger } from "@tooldi/agent-observability";

export interface EnqueuedRunJob {
  jobId: string;
  enqueuedAt: string;
  payload: RunJobEnvelope;
}

export type QueueTransportState =
  | "active"
  | "completed"
  | "failed"
  | "stalled";

export interface QueueTransportSignal {
  queueJobId: string;
  state: QueueTransportState;
  occurredAt: string;
  failedReason?: string;
}

export type QueueTransportObserver = (
  signal: QueueTransportSignal,
) => void | Promise<void>;

export interface RunQueueProducer {
  enqueueRunJob(payload: RunJobEnvelope): Promise<EnqueuedRunJob>;
  listJobs(): Promise<readonly EnqueuedRunJob[]>;
  observeTransport(observer: QueueTransportObserver): () => void;
  close(): Promise<void>;
}

class InMemoryRunQueueProducer implements RunQueueProducer {
  private readonly jobs: EnqueuedRunJob[] = [];
  private readonly observers = new Set<QueueTransportObserver>();

  async enqueueRunJob(payload: RunJobEnvelope): Promise<EnqueuedRunJob> {
    const job: EnqueuedRunJob = {
      jobId: payload.queueJobId,
      enqueuedAt: new Date().toISOString(),
      payload,
    };
    this.jobs.push(job);
    return job;
  }

  async listJobs(): Promise<readonly EnqueuedRunJob[]> {
    return this.jobs;
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
  private readonly queue: Queue<RunJobEnvelope>;
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
    this.queue = new Queue<RunJobEnvelope>(queueName, {
      connection: this.producerConnection,
    });
    this.queueEvents = new QueueEvents(queueName, {
      connection: this.eventsConnection,
    });
    this.bindTransportSignals();
  }

  async enqueueRunJob(payload: RunJobEnvelope): Promise<EnqueuedRunJob> {
    const job = await this.queue.add("run.execute", payload, {
      jobId: payload.queueJobId,
      attempts: 1,
      removeOnComplete: false,
      removeOnFail: false,
    });

    return {
      jobId: this.asJobId(job),
      enqueuedAt: new Date(job.timestamp).toISOString(),
      payload: job.data,
    };
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
        void this.publishTransportSignal({
          queueJobId: jobId,
          state: "active",
          occurredAt: new Date().toISOString(),
        });
      }
    });

    this.onQueueEvent("completed", ({ jobId }) => {
      if (jobId) {
        void this.publishTransportSignal({
          queueJobId: jobId,
          state: "completed",
          occurredAt: new Date().toISOString(),
        });
      }
    });

    this.onQueueEvent("failed", ({ jobId, failedReason }) => {
      if (jobId) {
        void this.publishTransportSignal({
          queueJobId: jobId,
          state: "failed",
          occurredAt: new Date().toISOString(),
          ...(failedReason ? { failedReason } : {}),
        });
      }
    });

    this.onQueueEvent("stalled", ({ jobId }) => {
      if (jobId) {
        void this.publishTransportSignal({
          queueJobId: jobId,
          state: "stalled",
          occurredAt: new Date().toISOString(),
        });
      }
    });

    this.onQueueEvent("error", (error) => {
      this.logger.error("BullMQ QueueEvents error", {
        message: error instanceof Error ? error.message : "Unknown QueueEvents error",
      });
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

  private async publishTransportSignal(signal: QueueTransportSignal): Promise<void> {
    for (const observer of this.observers) {
      try {
        await observer(signal);
      } catch (error) {
        this.logger.warn("Queue transport observer failed", {
          queueJobId: signal.queueJobId,
          state: signal.state,
          error:
            error instanceof Error ? error.message : "Unknown queue observer error",
        });
      }
    }
  }

  private toEnqueuedRunJob(job: Job<RunJobEnvelope>): EnqueuedRunJob | null {
    const jobId = this.asJobId(job);
    if (jobId.length === 0) {
      return null;
    }

    return {
      jobId,
      enqueuedAt: new Date(job.timestamp).toISOString(),
      payload: job.data,
    };
  }

  private asJobId(job: Job<RunJobEnvelope>): string {
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
