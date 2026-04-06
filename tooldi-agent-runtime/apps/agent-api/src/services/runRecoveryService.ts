import type {
  WaitMutationAckResponse,
  WorkerAppendEventRequest,
  WorkerAppendEventResponse,
} from "@tooldi/agent-contracts";
import type { AttemptState, RunStatus } from "@tooldi/agent-domain";
import type { Logger } from "@tooldi/agent-observability";

import { isTerminalRunStatus } from "@tooldi/agent-domain";

import { ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import type { MutationLedgerRepository } from "../repositories/mutationLedgerRepository.js";
import type { RunAttemptRecord } from "../repositories/runAttemptRepository.js";
import type { RunAttemptRepository } from "../repositories/runAttemptRepository.js";
import type { RunRecord } from "../repositories/runRepository.js";
import type { RunRepository } from "../repositories/runRepository.js";
import type { RunEventService } from "./runEventService.js";

export interface HeartbeatCommand {
  runId: string;
  traceId: string;
  attemptSeq: number;
  queueJobId: string;
  workerId: string;
  attemptState: AttemptState;
  phase?: "planning" | "executing" | "applying" | "saving";
  heartbeatAt: string;
}

export interface HeartbeatResponse {
  accepted: boolean;
  runStatus: RunStatus;
  cancelRequested: boolean;
  stopAfterCurrentAction: boolean;
  deadlineAt: string;
}

export interface WorkerAppendEventCommand {
  runId: string;
  traceId: string;
  attemptSeq: number;
  queueJobId: string;
  event: WorkerAppendEventRequest["event"];
  receivedAt?: string;
}

export interface WaitMutationAckCommand {
  runId: string;
  mutationId: string;
  waitMs: number;
}

export class RunRecoveryService {
  constructor(
    private readonly runRepository: RunRepository,
    private readonly runAttemptRepository: RunAttemptRepository,
    private readonly mutationLedgerRepository: MutationLedgerRepository,
    private readonly runEventService: RunEventService,
    private readonly logger: Logger,
  ) {}

  async acceptHeartbeat(command: HeartbeatCommand): Promise<HeartbeatResponse> {
    const { run } = await this.findRunAndAttempt(
      command.runId,
      command.traceId,
      command.attemptSeq,
      command.queueJobId,
    );

    await this.runAttemptRepository.recognizeLease(
      command.runId,
      command.attemptSeq,
      command.heartbeatAt,
      command.workerId,
    );
    const updatedAttempt = await this.runAttemptRepository.touchHeartbeat(
      command.runId,
      command.attemptSeq,
      command.heartbeatAt,
      command.attemptState,
      command.workerId,
    );
    if (!updatedAttempt) {
      throw new NotFoundError(
        `Attempt not found for run ${command.runId} seq ${command.attemptSeq}`,
      );
    }

    const nextRunStatus = this.mapHeartbeatToRunStatus(
      run.status,
      command.attemptState,
      command.phase,
    );
    const runStatus = await this.updateRunStatusIfAllowed(
      command.runId,
      run.status,
      nextRunStatus,
    );

    await this.runEventService.appendLog(
      command.runId,
      command.traceId,
      "info",
      `Worker heartbeat accepted for attempt=${command.attemptSeq} state=${command.attemptState} phase=${command.phase ?? "unspecified"}`,
      command.heartbeatAt,
    );

    const cancelRequested = runStatus === "cancel_requested";
    this.logger.debug("Accepted worker heartbeat", {
      runId: command.runId,
      traceId: command.traceId,
      attemptSeq: command.attemptSeq,
      queueJobId: command.queueJobId,
      attemptState: updatedAttempt.attemptState,
      phase: command.phase,
      cancelRequested,
    });

    return {
      accepted: true,
      runStatus,
      cancelRequested,
      stopAfterCurrentAction: cancelRequested,
      deadlineAt: run.deadlineAt,
    };
  }

  async appendWorkerEvent(
    command: WorkerAppendEventCommand,
  ): Promise<WorkerAppendEventResponse> {
    const { run, attempt } = await this.findRunAndAttempt(
      command.runId,
      command.traceId,
      command.attemptSeq,
      command.queueJobId,
    );

    const receivedAt = command.receivedAt ?? new Date().toISOString();
    const cancelRequested = run.status === "cancel_requested";
    let assignedSeq: number | undefined;

    await this.runAttemptRepository.recognizeLease(
      command.runId,
      command.attemptSeq,
      receivedAt,
    );

    switch (command.event.type) {
      case "phase":
        await this.runEventService.appendPhase(
          command.runId,
          command.traceId,
          this.asWorkerPhase(command.event.phase),
          command.event.message,
          receivedAt,
        );
        await this.updateRunStatusIfAllowed(
          command.runId,
          run.status,
          this.mapPhaseToRunStatus(this.asWorkerPhase(command.event.phase)),
        );
        break;
      case "log":
        await this.runEventService.appendLog(
          command.runId,
          command.traceId,
          this.asLogLevel(command.event.level),
          command.event.message,
          receivedAt,
        );
        break;
      case "tool.result":
        await this.runEventService.appendLog(
          command.runId,
          command.traceId,
          command.event.status === "failed"
            ? command.event.retryable
              ? "warn"
              : "error"
            : "info",
          `Tool ${command.event.toolName} ${command.event.status} (${command.event.durationMs}ms)`,
          receivedAt,
        );
        break;
      case "mutation.proposed": {
        this.assertMutationProposalConsistency(
          command.runId,
          command.traceId,
          command.event,
        );
        const ledgerRecord = await this.mutationLedgerRepository.recordProposal({
          runId: command.runId,
          traceId: command.traceId,
          attemptSeq: command.attemptSeq,
          queueJobId: command.queueJobId,
          event: command.event,
        });
        assignedSeq = ledgerRecord.seq;

        await this.runEventService.append({
          type: "canvas.mutation",
          runId: command.runId,
          traceId: command.traceId,
          draftId: ledgerRecord.mutation.draftId,
          pageId: ledgerRecord.mutation.pageId,
          seq: ledgerRecord.seq,
          mutation: ledgerRecord.mutation,
          at: ledgerRecord.mutation.emittedAt,
        });
        await this.runAttemptRepository.updateAttemptState(
          command.runId,
          command.attemptSeq,
          "awaiting_ack",
          attempt.workerId ?? undefined,
          attempt.lastHeartbeatAt ?? undefined,
        );
        await this.updateRunStatusIfAllowed(
          command.runId,
          run.status,
          "awaiting_apply_ack",
        );
        break;
      }
    }

    this.logger.debug("Accepted worker event", {
      runId: command.runId,
      traceId: command.traceId,
      attemptSeq: command.attemptSeq,
      queueJobId: command.queueJobId,
      eventType: command.event.type,
      assignedSeq,
      cancelRequested,
    });

    return {
      accepted: true,
      cancelRequested,
      ...(assignedSeq !== undefined ? { assignedSeq } : {}),
    };
  }

  async waitForMutationAck(
    command: WaitMutationAckCommand,
  ): Promise<WaitMutationAckResponse> {
    const run = await this.runRepository.findById(command.runId);
    if (!run) {
      throw new NotFoundError(`Run not found: ${command.runId}`);
    }

    return this.mutationLedgerRepository.waitForAck(
      command.runId,
      command.mutationId,
      command.waitMs,
      run.status,
    );
  }

  async runWatchdogPlaceholder(runId: string, traceId: string): Promise<void> {
    await this.runEventService.appendLog(
      runId,
      traceId,
      "warn",
      "Watchdog placeholder invoked; retry/cancel recovery rules will be implemented in a later step",
      new Date().toISOString(),
    );
  }

  private async findRunAndAttempt(
    runId: string,
    traceId: string,
    attemptSeq: number,
    queueJobId: string,
  ): Promise<{
    run: RunRecord;
    attempt: RunAttemptRecord;
  }> {
    const run = await this.runRepository.findById(runId);
    if (!run) {
      throw new NotFoundError(`Run not found: ${runId}`);
    }
    if (run.traceId !== traceId) {
      throw new ConflictError(
        `Trace mismatch for run ${runId}: expected ${run.traceId}, received ${traceId}`,
      );
    }
    if (run.attemptSeq !== attemptSeq) {
      throw new ConflictError(
        `Stale attempt for run ${runId}: active ${run.attemptSeq}, received ${attemptSeq}`,
      );
    }
    if (run.queueJobId !== queueJobId) {
      throw new ConflictError(
        `Stale queue job for run ${runId}: active ${run.queueJobId}, received ${queueJobId}`,
      );
    }
    if (isTerminalRunStatus(run.status)) {
      throw new ConflictError(`Run already reached terminal status: ${run.status}`, {
        runId,
        traceId,
        status: run.status,
      });
    }

    const attempt = await this.runAttemptRepository.findByRunIdAndAttemptSeq(
      runId,
      attemptSeq,
    );
    if (!attempt) {
      throw new NotFoundError(`Attempt not found for run ${runId} seq ${attemptSeq}`);
    }
    if (attempt.queueJobId !== queueJobId) {
      throw new ConflictError(
        `Queue job mismatch for run ${runId} seq ${attemptSeq}`,
        {
          expectedQueueJobId: attempt.queueJobId,
          receivedQueueJobId: queueJobId,
        },
      );
    }

    return { run, attempt };
  }

  private assertMutationProposalConsistency(
    runId: string,
    traceId: string,
    event: Extract<WorkerAppendEventRequest["event"], { type: "mutation.proposed" }>,
  ): void {
    if (event.mutationId !== event.mutation.mutationId) {
      throw new ValidationError(
        `Mutation proposal id mismatch: ${event.mutationId} vs ${event.mutation.mutationId}`,
      );
    }
    if (event.mutation.runId !== runId) {
      throw new ValidationError(
        `Mutation proposal runId mismatch: ${event.mutation.runId} vs ${runId}`,
      );
    }
    if (event.mutation.traceId !== traceId) {
      throw new ValidationError(
        `Mutation proposal traceId mismatch: ${event.mutation.traceId} vs ${traceId}`,
      );
    }
    if (
      event.dependsOnSeq !== undefined &&
      event.mutation.dependsOnSeq !== undefined &&
      event.dependsOnSeq !== event.mutation.dependsOnSeq
    ) {
      throw new ValidationError(
        `Mutation proposal dependsOnSeq mismatch: ${event.dependsOnSeq} vs ${event.mutation.dependsOnSeq}`,
      );
    }
    if (event.rollbackGroupId !== event.mutation.rollbackHint.rollbackGroupId) {
      throw new ValidationError(
        `Mutation proposal rollbackGroupId mismatch: ${event.rollbackGroupId} vs ${event.mutation.rollbackHint.rollbackGroupId}`,
      );
    }
  }

  private mapHeartbeatToRunStatus(
    currentStatus: RunStatus,
    attemptState: AttemptState,
    phase?: "planning" | "executing" | "applying" | "saving",
  ): RunStatus {
    if (phase) {
      return this.mapPhaseToRunStatus(phase);
    }
    if (attemptState === "finalizing") {
      return "finalizing";
    }
    return currentStatus;
  }

  private mapPhaseToRunStatus(
    phase: "planning" | "executing" | "applying" | "saving",
  ): RunStatus {
    switch (phase) {
      case "planning":
        return "planning";
      case "executing":
        return "executing";
      case "applying":
        return "awaiting_apply_ack";
      case "saving":
        return "saving";
    }
  }

  private asWorkerPhase(
    phase: string,
  ): "planning" | "executing" | "applying" | "saving" {
    switch (phase) {
      case "planning":
      case "executing":
      case "applying":
      case "saving":
        return phase;
      default:
        throw new ValidationError(`Unsupported worker phase: ${phase}`);
    }
  }

  private asLogLevel(level: string): "info" | "warn" | "error" {
    switch (level) {
      case "info":
      case "warn":
      case "error":
        return level;
      default:
        throw new ValidationError(`Unsupported worker log level: ${level}`);
    }
  }

  private async updateRunStatusIfAllowed(
    runId: string,
    currentStatus: RunStatus,
    nextStatus: RunStatus,
  ): Promise<RunStatus> {
    if (
      currentStatus === nextStatus ||
      currentStatus === "cancel_requested" ||
      isTerminalRunStatus(currentStatus)
    ) {
      return currentStatus;
    }

    const updated = await this.runRepository.updateStatus(runId, nextStatus);
    return updated?.status ?? nextStatus;
  }
}
