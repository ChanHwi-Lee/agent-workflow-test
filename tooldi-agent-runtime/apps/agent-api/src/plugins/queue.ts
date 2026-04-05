import type { FastifyPluginAsync } from "fastify";

import type { RunJobEnvelope } from "@tooldi/agent-contracts";

export interface EnqueuedRunJob {
  jobId: string;
  enqueuedAt: string;
  payload: RunJobEnvelope;
}

export interface RunQueueProducer {
  enqueueRunJob(payload: RunJobEnvelope): Promise<EnqueuedRunJob>;
  listJobs(): Promise<readonly EnqueuedRunJob[]>;
  close(): Promise<void>;
}

class InMemoryRunQueueProducer implements RunQueueProducer {
  private readonly jobs: EnqueuedRunJob[] = [];

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

  async close(): Promise<void> {}
}

export const queuePlugin: FastifyPluginAsync = async (app) => {
  const runQueue = new InMemoryRunQueueProducer();
  app.decorate("runQueue", runQueue);

  app.addHook("onClose", async () => {
    await runQueue.close();
  });
};
