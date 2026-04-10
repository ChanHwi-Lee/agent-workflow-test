import type {
  AgentRunResultSummary,
  RunJobEnvelope,
  RunRepairContext,
  RunRecoveryProjection,
} from "@tooldi/agent-contracts";
import type { Logger } from "@tooldi/agent-observability";

import { isTerminalRunStatus } from "@tooldi/agent-domain";

import {
  createAttemptId,
  createCancelToken,
  createQueueJobId,
} from "../lib/ids.js";
import {
  RunQueueEnqueueTimeoutError,
  type RunQueueProducer,
  type QueueTransportSignal,
} from "../plugins/queue.js";
import type { RunAttemptRecord, RunAttemptRepository } from "../repositories/runAttemptRepository.js";
import type { RunRecoveryRepository } from "../repositories/runRecoveryRepository.js";
import type { RunRecord, RunRepository } from "../repositories/runRepository.js";
import type { RunEventService } from "./runEventService.js";
import type { RunFinalizeService } from "./runFinalizeService.js";

export interface RunWatchdogPolicy {
  pickupTimeoutMs: number;
  retryDelayMs: number;
  maxQueueAttempts: number;
  enqueueTimeoutMs: number;
  finalizeGraceMs: number;
}

export const defaultRunWatchdogPolicy: RunWatchdogPolicy = {
  pickupTimeoutMs: 2000,
  retryDelayMs: 1500,
  maxQueueAttempts: 2,
  enqueueTimeoutMs: 2000,
  finalizeGraceMs: 1500,
};

export interface TrackEnqueuedAttemptCommand {
  runId: string;
  traceId: string;
  attemptSeq: number;
  queueJobId: string;
}

type WatchdogRunEventSink = Pick<
  RunEventService,
  "appendLog" | "appendFailed" | "appendCancelled" | "appendCompleted" | "appendRecovery"
>;

type FinalizeRecoverySink = Pick<RunFinalizeService, "finalizeRun">;

export class RunWatchdogService {
  private readonly pickupTimers = new Map<string, NodeJS.Timeout>();
  private readonly finalizeTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly runRepository: RunRepository,
    private readonly runAttemptRepository: RunAttemptRepository,
    private readonly runRecoveryRepository: RunRecoveryRepository,
    private readonly runEventService: WatchdogRunEventSink,
    private readonly finalizeRecovery: FinalizeRecoverySink,
    private readonly runQueue: RunQueueProducer,
    private readonly logger: Logger,
    private readonly policy: RunWatchdogPolicy = defaultRunWatchdogPolicy,
  ) {}

  trackEnqueuedAttempt(command: TrackEnqueuedAttemptCommand): void {
    this.clearPickupTimer(command.queueJobId);
    const timer = setTimeout(() => {
      void this.runBackground(`pickup timeout ${command.queueJobId}`, async () => {
        await this.handlePickupTimeout(command);
      });
    }, this.policy.pickupTimeoutMs);
    timer.unref?.();
    this.pickupTimers.set(command.queueJobId, timer);
  }

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

    if (signal.state === "completed") {
      this.trackFinalizeGrace(run, attempt);
      return;
    }

    if (signal.state === "failed" || signal.state === "stalled") {
      await this.reconcileTransportFailure(run, attempt, signal);
    }
  }

  async handleCancelRequested(
    runId: string,
    traceId: string,
    options: {
      forceCloseIfUnproven?: boolean;
      reasonCode?: string;
    } = {},
  ): Promise<void> {
    const run = await this.runRepository.findById(runId);
    if (!run || run.traceId !== traceId || run.queueJobId === null) {
      return;
    }

    const attempt = await this.runAttemptRepository.findByRunIdAndAttemptSeq(
      runId,
      run.attemptSeq,
    );
    if (!attempt || attempt.leaseRecognizedAt !== null) {
      return;
    }

    const removed = await this.runQueue.tryRemoveQueuedJob(run.queueJobId);
    if (!removed) {
      if (options.forceCloseIfUnproven !== true) {
        this.logger.info("Cancel requested but queued job was already picked up or missing", {
          runId,
          traceId,
          attemptSeq: attempt.attemptSeq,
          queueJobId: attempt.queueJobId,
        });
        return;
      }
      this.logger.info("Cancel requested but queued job was already picked up or missing", {
        runId,
        traceId,
        attemptSeq: attempt.attemptSeq,
        queueJobId: attempt.queueJobId,
      });
    }

    await this.closeCancelledBeforeProof(
      run,
      attempt,
      options.reasonCode ?? "cancelled_before_worker_pickup",
    );
  }

  async close(): Promise<void> {
    for (const timer of this.pickupTimers.values()) {
      clearTimeout(timer);
    }
    this.pickupTimers.clear();
    for (const timer of this.finalizeTimers.values()) {
      clearTimeout(timer);
    }
    this.finalizeTimers.clear();
  }

  private async handlePickupTimeout(
    command: TrackEnqueuedAttemptCommand,
  ): Promise<void> {
    this.clearPickupTimer(command.queueJobId);

    const run = await this.runRepository.findById(command.runId);
    if (!run || run.traceId !== command.traceId || isTerminalRunStatus(run.status)) {
      return;
    }

    const attempt = await this.runAttemptRepository.findByRunIdAndAttemptSeq(
      command.runId,
      command.attemptSeq,
    );
    if (!attempt || attempt.queueJobId !== command.queueJobId) {
      return;
    }

    if (run.attemptSeq !== command.attemptSeq || run.queueJobId !== command.queueJobId) {
      return;
    }

    if (attempt.leaseRecognizedAt !== null) {
      return;
    }

    if (run.status === "cancel_requested") {
      await this.handleCancelRequested(run.runId, run.traceId, {
        forceCloseIfUnproven: true,
        reasonCode: "cancelled_before_worker_pickup_timeout",
      });
      return;
    }

    await this.retryOrFail(run, attempt, {
      reasonCode: "worker_pickup_timeout",
      publicMessage:
        "Worker pickup timeout expired before the first valid callback; backend is reconciling retry ownership",
    });
  }

  private async reconcileTransportFailure(
    run: RunRecord,
    attempt: RunAttemptRecord,
    signal: QueueTransportSignal,
  ): Promise<void> {
    this.clearPickupTimer(signal.queueJobId);

    if (isTerminalRunStatus(run.status)) {
      return;
    }

    if (run.status === "cancel_requested" && attempt.leaseRecognizedAt === null) {
      await this.handleCancelRequested(run.runId, run.traceId, {
        forceCloseIfUnproven: true,
        reasonCode: "cancelled_before_worker_proof_after_transport_failure",
      });
      return;
    }

    const reasonCode =
      signal.state === "stalled"
        ? "worker_stalled_transport_signal"
        : "worker_failed_transport_signal";

    await this.retryOrFail(run, attempt, {
      reasonCode,
      publicMessage:
        signal.state === "stalled"
          ? "Worker lease was lost before canonical close; backend is reconciling stalled transport"
          : `Worker transport failed before canonical close: ${signal.failedReason ?? "unknown failure"}`,
      ...(signal.failedReason ? { failureDetail: signal.failedReason } : {}),
    });
  }

  private async retryOrFail(
    run: RunRecord,
    attempt: RunAttemptRecord,
    input: {
      reasonCode: string;
      publicMessage: string;
      failureDetail?: string;
    },
  ): Promise<void> {
    if (this.canRetry(run, attempt, input.reasonCode)) {
      const recovery = await this.recordRecoveryDecision(
        run,
        attempt,
        input.reasonCode,
        "backend_retry_watchdog",
        this.createAutoRetryRecovery(input.publicMessage),
      );
      await this.scheduleRetry(
        run,
        attempt,
        input.reasonCode,
        input.publicMessage,
        {
          source: "backend_retry_watchdog",
          reasonCode: input.reasonCode,
          recovery: recovery.recovery,
        },
      );
      return;
    }

    const terminalReason =
      run.lastAckedSeq > 0
        ? "resume_not_supported_after_visible_ack"
        : input.reasonCode;
    const terminalMessage =
      run.lastAckedSeq > 0
        ? "Visible mutation ack exists, but resume/rollback orchestration is not implemented yet; backend refuses blind retry"
        : input.publicMessage;

    await this.recordRecoveryDecision(
      run,
      attempt,
      terminalReason,
      "backend_failure_watchdog",
      this.createTerminalRecovery(run, terminalReason, terminalMessage),
    );

    await this.runAttemptRepository.updateAttemptState(
      run.runId,
      attempt.attemptSeq,
      "failed",
      attempt.workerId ?? undefined,
      attempt.lastHeartbeatAt ?? undefined,
      terminalReason,
    );
    await this.runRepository.updateStatus(run.runId, "failed", terminalReason);
    this.clearFinalizeTimer(attempt.queueJobId);
    await this.runEventService.appendFailed(run.runId, run.traceId, {
      code: terminalReason,
      message: terminalMessage,
    }, new Date().toISOString());

    this.logger.warn("Run watchdog closed run after transport reconciliation", {
      runId: run.runId,
      traceId: run.traceId,
      attemptSeq: attempt.attemptSeq,
      queueJobId: attempt.queueJobId,
      reasonCode: terminalReason,
      lastAckedSeq: run.lastAckedSeq,
      ...(input.failureDetail ? { failureDetail: input.failureDetail } : {}),
    });
  }

  private canRetry(
    run: RunRecord,
    attempt: RunAttemptRecord,
    reasonCode: string,
  ): boolean {
    if (run.cancelRequestedAt !== null) {
      return false;
    }
    if (run.lastAckedSeq > 0) {
      return false;
    }
    if (attempt.attemptSeq >= this.policy.maxQueueAttempts) {
      return false;
    }
    if (!this.isRetryableTransportReason(reasonCode)) {
      return false;
    }
    if (run.pageLockToken.trim().length === 0) {
      return false;
    }

    const deadlineMs = Date.parse(run.deadlineAt);
    return Number.isFinite(deadlineMs) && Date.now() + this.policy.retryDelayMs < deadlineMs;
  }

  private async scheduleRetry(
    run: RunRecord,
    attempt: RunAttemptRecord,
    reasonCode: string,
    publicMessage: string,
    repairContext: RunRepairContext,
  ): Promise<void> {
    await this.runAttemptRepository.updateAttemptState(
      run.runId,
      attempt.attemptSeq,
      "failed",
      attempt.workerId ?? undefined,
      attempt.lastHeartbeatAt ?? undefined,
      reasonCode,
    );

    const removed = await this.runQueue.tryRemoveQueuedJob(attempt.queueJobId);
    this.logger.info("Scheduling backend-owned retry attempt", {
      runId: run.runId,
      traceId: run.traceId,
      attemptSeq: attempt.attemptSeq,
      queueJobId: attempt.queueJobId,
      removedQueuedJob: removed,
      retryDelayMs: this.policy.retryDelayMs,
      reasonCode,
    });

    if (run.requestRef.trim().length === 0 || run.snapshotRef.trim().length === 0) {
      await this.runRepository.updateStatus(
        run.runId,
        "failed",
        "request_or_snapshot_ref_missing_for_retry",
      );
      await this.runEventService.appendFailed(
        run.runId,
        run.traceId,
        {
          code: "request_or_snapshot_ref_missing_for_retry",
          message:
            "Backend could not rebuild retry payload because canonical request/snapshot refs were missing",
        },
        new Date().toISOString(),
      );
      return;
    }

    const retryAttemptSeq = attempt.attemptSeq + 1;
    const retryAttemptId = createAttemptId();
    const retryQueueJobId = createQueueJobId({
      runId: run.runId,
      attemptSeq: retryAttemptSeq,
    });
    const retryJob: RunJobEnvelope = {
      messageVersion: "v1",
      runId: run.runId,
      traceId: run.traceId,
      queueJobId: retryQueueJobId,
      attemptSeq: retryAttemptSeq,
      priority: "interactive",
      requestRef: run.requestRef,
      snapshotRef: run.snapshotRef,
      deadlineAt: run.deadlineAt,
      pageLockToken: run.pageLockToken,
      cancelToken: createCancelToken(run.runId),
      repairContext,
    };

    try {
      await this.runQueue.enqueueRunJob(retryJob, {
        delayMs: this.policy.retryDelayMs,
        timeoutMs: this.policy.enqueueTimeoutMs,
      });
    } catch (error) {
      const reasonCodeForClose =
        error instanceof RunQueueEnqueueTimeoutError
          ? "enqueue_timeout"
          : "queue_publish_failed";
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Retry enqueue failed before worker handoff";
      await this.runRepository.updateStatus(run.runId, "failed", reasonCodeForClose);
      await this.runEventService.appendFailed(
        run.runId,
        run.traceId,
        {
          code: reasonCodeForClose,
          message: errorMessage,
        },
        new Date().toISOString(),
      );
      this.logger.error("Failed to enqueue backend-authored retry attempt", {
        runId: run.runId,
        traceId: run.traceId,
        previousAttemptSeq: attempt.attemptSeq,
        retryAttemptSeq,
        reasonCode: reasonCodeForClose,
        error: errorMessage,
      });
      return;
    }
    await this.runAttemptRepository.create({
      attemptId: retryAttemptId,
      runId: run.runId,
      traceId: run.traceId,
      attemptSeq: retryAttemptSeq,
      retryOfAttemptSeq: attempt.attemptSeq,
      queueJobId: retryQueueJobId,
      acceptedHttpRequestId: attempt.acceptedHttpRequestId,
      attemptState: "retry_waiting",
      statusReasonCode: reasonCode,
      workerId: null,
      startedAt: null,
      leaseRecognizedAt: null,
      lastHeartbeatAt: null,
      createdAt: new Date().toISOString(),
    });
    await this.runRepository.activateAttempt(
      run.runId,
      retryAttemptSeq,
      retryQueueJobId,
      "planning_queued",
      null,
    );
    await this.runEventService.appendLog(
      run.runId,
      run.traceId,
      "warn",
      `${publicMessage}. Backend scheduled retry attempt ${retryAttemptSeq}.`,
      new Date().toISOString(),
    );
    this.trackEnqueuedAttempt({
      runId: run.runId,
      traceId: run.traceId,
      attemptSeq: retryAttemptSeq,
      queueJobId: retryQueueJobId,
    });
  }

  private trackFinalizeGrace(run: RunRecord, attempt: RunAttemptRecord): void {
    this.clearFinalizeTimer(attempt.queueJobId);
    const timer = setTimeout(() => {
      void this.runBackground(`finalize grace ${attempt.queueJobId}`, async () => {
        await this.handleFinalizeGraceExpiry(
          run.runId,
          run.traceId,
          attempt.attemptSeq,
          attempt.queueJobId,
        );
      });
    }, this.policy.finalizeGraceMs);
    timer.unref?.();
    this.finalizeTimers.set(attempt.queueJobId, timer);
  }

  private async handleFinalizeGraceExpiry(
    runId: string,
    traceId: string,
    attemptSeq: number,
    queueJobId: string,
  ): Promise<void> {
    this.clearFinalizeTimer(queueJobId);
    const run = await this.runRepository.findById(runId);
    if (!run || run.traceId !== traceId || isTerminalRunStatus(run.status)) {
      return;
    }
    if (run.attemptSeq !== attemptSeq || run.queueJobId !== queueJobId) {
      return;
    }

    await this.recordRecoveryDecision(
      run,
      {
        attemptSeq,
        queueJobId,
      },
      "finalize_callback_missing_after_completed_signal",
      "backend_finalize_watchdog",
      this.createFinalizeOnlyRecovery(),
    );
    const result = this.synthesizeMissingFinalizeResult(run);
    await this.finalizeRecovery.finalizeRun({
      runId,
      traceId,
      attemptSeq,
      queueJobId,
      result,
      at: new Date().toISOString(),
    });
  }

  private clearPickupTimer(queueJobId: string): void {
    const timer = this.pickupTimers.get(queueJobId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    this.pickupTimers.delete(queueJobId);
  }

  private clearFinalizeTimer(queueJobId: string): void {
    const timer = this.finalizeTimers.get(queueJobId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    this.finalizeTimers.delete(queueJobId);
  }

  private logObservedSignal(
    run: { runId: string; traceId: string; lastAckedSeq: number },
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
      lastAckedSeq: run.lastAckedSeq,
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

  private async closeCancelledBeforeProof(
    run: RunRecord,
    attempt: RunAttemptRecord,
    reasonCode: string,
  ): Promise<void> {
    this.clearPickupTimer(attempt.queueJobId);
    this.clearFinalizeTimer(attempt.queueJobId);
    await this.runAttemptRepository.updateAttemptState(
      run.runId,
      attempt.attemptSeq,
      "cancelled",
      attempt.workerId ?? undefined,
      attempt.lastHeartbeatAt ?? undefined,
      reasonCode,
    );
    await this.runRepository.updateStatus(run.runId, "cancelled", reasonCode);
    await this.runEventService.appendCancelled(run.runId, run.traceId, new Date().toISOString());
  }

  private isRetryableTransportReason(reasonCode: string): boolean {
    return (
      reasonCode === "worker_pickup_timeout" ||
      reasonCode === "worker_stalled_transport_signal" ||
      reasonCode === "worker_failed_transport_signal"
    );
  }

  private createAutoRetryRecovery(message: string): RunRecoveryProjection {
    return {
      state: "auto_retrying",
      retryMode: "auto_same_run",
      resumeMode: "fresh",
      retryable: true,
      lastKnownGoodCheckpointId: null,
      restoreTargetKind: "run_start_snapshot",
      failedPlanStepId: null,
      resumeFromSeq: null,
      userMessage: message,
    };
  }

  private createTerminalRecovery(
    run: RunRecord,
    reasonCode: string,
    message: string,
  ): RunRecoveryProjection {
    if (run.lastAckedSeq === 0) {
      return {
        state: "not_retryable",
        retryMode: "none",
        resumeMode: "fresh",
        retryable: false,
        lastKnownGoodCheckpointId: null,
        restoreTargetKind: "run_start_snapshot",
        failedPlanStepId: null,
        resumeFromSeq: null,
        userMessage: message,
      };
    }

    return {
      state: "not_retryable",
      retryMode: "none",
      resumeMode: null,
      retryable: false,
      lastKnownGoodCheckpointId: null,
      restoreTargetKind: null,
      failedPlanStepId: null,
      resumeFromSeq: run.lastAckedSeq + 1,
      userMessage:
        reasonCode === "resume_not_supported_after_visible_ack"
          ? "Visible mutation exists, but this draft can only be closed conservatively in the current prototype"
          : message,
    };
  }

  private createFinalizeOnlyRecovery(): RunRecoveryProjection {
    return {
      state: "finalize_only",
      retryMode: "none",
      resumeMode: "finalize_only",
      retryable: false,
      lastKnownGoodCheckpointId: null,
      restoreTargetKind: null,
      failedPlanStepId: null,
      resumeFromSeq: null,
      userMessage:
        "Visible mutation replay is frozen; backend is attempting a finalize-only recovery closeout",
    };
  }

  private async recordRecoveryDecision(
    run: RunRecord,
    attempt: Pick<RunAttemptRecord, "attemptSeq" | "queueJobId">,
    reasonCode: string,
    source: RunRepairContext["source"],
    recovery: RunRecoveryProjection,
  ) {
    const createdAt = new Date().toISOString();
    const record = await this.runRecoveryRepository.create({
      runId: run.runId,
      traceId: run.traceId,
      attemptSeq: attempt.attemptSeq,
      queueJobId: attempt.queueJobId,
      reasonCode,
      source,
      recovery,
      createdAt,
    });
    await this.runEventService.appendRecovery(
      run.runId,
      run.traceId,
      recovery,
      createdAt,
    );
    return record;
  }

  private synthesizeMissingFinalizeResult(run: RunRecord): AgentRunResultSummary {
    const issue = {
      code: "finalize_callback_missing_after_completed_signal",
      message:
        "Queue transport completed but backend did not receive finalize callback before grace timeout",
    };

    if (run.lastAckedSeq > 0) {
      return {
        finalStatus: "save_failed_after_apply",
        draftId: null,
        finalRevision: null,
        durabilityState: "save_uncertain",
        latestSaveEvidence: null,
        latestSaveReceiptId: null,
        warningCount: 1,
        fallbackCount: 1,
        warnings: [issue],
        errorSummary: issue,
      };
    }

    return {
      finalStatus: "failed",
      draftId: null,
      finalRevision: null,
      durabilityState: "no_saved_draft",
      latestSaveEvidence: null,
      latestSaveReceiptId: null,
      warningCount: 0,
      fallbackCount: 0,
      warnings: [],
      errorSummary: issue,
    };
  }

  private async runBackground(label: string, task: () => Promise<void>): Promise<void> {
    try {
      await task();
    } catch (error) {
      this.logger.error("Run watchdog background task failed", {
        label,
        error: error instanceof Error ? error.message : "Unknown watchdog background error",
      });
    }
  }
}
