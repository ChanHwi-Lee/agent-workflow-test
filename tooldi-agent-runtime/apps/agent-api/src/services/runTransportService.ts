import type { Logger } from "@tooldi/agent-observability";

import type { QueueTransportSignal } from "../plugins/queue.js";
import type { RunAttemptRepository } from "../repositories/runAttemptRepository.js";
import type { RunRepository } from "../repositories/runRepository.js";

export class RunTransportService {
  constructor(
    private readonly runRepository: RunRepository,
    private readonly runAttemptRepository: RunAttemptRepository,
    private readonly logger: Logger,
  ) {}

  async observeSignal(signal: QueueTransportSignal): Promise<void> {
    const attempt = await this.runAttemptRepository.findByQueueJobId(signal.queueJobId);
    if (!attempt) {
      this.logger.debug("Ignoring queue transport signal without attempt match", {
        queueJobId: signal.queueJobId,
        state: signal.state,
      });
      return;
    }

    const run = await this.runRepository.findById(attempt.runId);
    if (!run) {
      this.logger.warn("Ignoring queue transport signal without run match", {
        queueJobId: signal.queueJobId,
        runId: attempt.runId,
        state: signal.state,
      });
      return;
    }

    if (run.queueJobId !== signal.queueJobId || run.attemptSeq !== attempt.attemptSeq) {
      this.logger.debug("Ignoring stale queue transport signal", {
        queueJobId: signal.queueJobId,
        runId: run.runId,
        activeQueueJobId: run.queueJobId,
        activeAttemptSeq: run.attemptSeq,
        signalAttemptSeq: attempt.attemptSeq,
        state: signal.state,
      });
      return;
    }

    this.logObservedSignal(run, attempt.attemptSeq, signal);
  }

  private logObservedSignal(
    run: { runId: string; traceId: string },
    attemptSeq: number,
    signal: QueueTransportSignal,
  ): void {
    const message = this.describeSignal(signal);
    const fields = {
      runId: run.runId,
      traceId: run.traceId,
      attemptSeq,
      queueJobId: signal.queueJobId,
      state: signal.state,
      occurredAt: signal.occurredAt,
      ...(signal.failedReason ? { failedReason: signal.failedReason } : {}),
    };

    if (signal.state === "failed" || signal.state === "stalled") {
      this.logger.warn(message, fields);
      return;
    }

    this.logger.info(message, fields);
  }

  private describeSignal(signal: QueueTransportSignal): string {
    switch (signal.state) {
      case "active":
        return `Queue transport marked ${signal.queueJobId} active; canonical dequeue still waits for the first valid worker callback`;
      case "completed":
        return `Queue transport marked ${signal.queueJobId} completed; canonical terminal state still waits for durable finalize evidence`;
      case "failed":
        return `Queue transport marked ${signal.queueJobId} failed (${signal.failedReason ?? "unknown reason"}); backend watchdog will reconcile canonical state`;
      case "stalled":
        return `Queue transport marked ${signal.queueJobId} stalled; backend watchdog will reconcile lease and recovery state`;
    }
  }
}
