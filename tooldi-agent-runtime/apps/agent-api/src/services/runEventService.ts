import type { Logger } from "@tooldi/agent-observability";
import type {
  AgentRunResultSummary,
  ErrorSummary,
  PublicRunEvent,
} from "@tooldi/agent-contracts";

import type { SseHub } from "../plugins/sseHub.js";
import type {
  RunEventRepository,
  StoredRunEvent,
} from "../repositories/runEventRepository.js";

export class RunEventService {
  constructor(
    private readonly runEventRepository: RunEventRepository,
    private readonly sseHub: SseHub,
    private readonly logger: Logger,
  ) {}

  async append(event: PublicRunEvent): Promise<StoredRunEvent> {
    const stored = await this.runEventRepository.append(event);
    await this.sseHub.publish(event.runId, {
      eventId: stored.eventId,
      event,
    });
    this.logger.debug("Appended public run event", {
      runId: event.runId,
      traceId: event.traceId,
      eventId: stored.eventId,
      type: event.type,
    });
    return stored;
  }

  async listAfter(runId: string, afterEventId?: string): Promise<StoredRunEvent[]> {
    return this.runEventRepository.listAfter(runId, afterEventId);
  }

  async appendAccepted(runId: string, traceId: string, at: string): Promise<void> {
    await this.append({
      type: "run.accepted",
      runId,
      traceId,
      at,
    });
  }

  async appendPhase(
    runId: string,
    traceId: string,
    phase: "queued" | "planning" | "executing" | "applying" | "saving",
    message: string,
    at: string,
  ): Promise<void> {
    await this.append({
      type: "run.phase",
      runId,
      traceId,
      phase,
      message,
      at,
    });
  }

  async appendLog(
    runId: string,
    traceId: string,
    level: "info" | "warn" | "error",
    message: string,
    at: string,
  ): Promise<void> {
    await this.append({
      type: "run.log",
      runId,
      traceId,
      level,
      message,
      at,
    });
  }

  async appendCancelRequested(
    runId: string,
    traceId: string,
    reason: string | undefined,
    at: string,
  ): Promise<void> {
    await this.append({
      type: "run.cancel_requested",
      runId,
      traceId,
      at,
      ...(reason ? { reason } : {}),
    });
  }

  async appendCancelled(runId: string, traceId: string, at: string): Promise<void> {
    await this.append({
      type: "run.cancelled",
      runId,
      traceId,
      at,
    });
  }

  async appendCompleted(
    runId: string,
    traceId: string,
    result: AgentRunResultSummary,
    at: string,
  ): Promise<void> {
    await this.append({
      type: "run.completed",
      runId,
      traceId,
      result,
      at,
    });
  }

  async appendFailed(
    runId: string,
    traceId: string,
    error: ErrorSummary,
    at: string,
  ): Promise<void> {
    await this.append({
      type: "run.failed",
      runId,
      traceId,
      error: {
        ...error,
        retryable: false,
      },
      at,
    });
  }
}
