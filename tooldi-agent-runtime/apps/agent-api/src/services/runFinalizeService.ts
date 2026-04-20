import type {
  AgentRunResultSummary,
  ErrorSummary,
  RunFinalizeRequest,
} from "@tooldi/agent-contracts";
import type { RunStatus } from "@tooldi/agent-domain";
import type { Logger } from "@tooldi/agent-observability";
import type { ObjectStoreClient } from "@tooldi/agent-persistence";

import { isTerminalRunStatus } from "@tooldi/agent-domain";

import { ConflictError, NotFoundError } from "../lib/errors.js";
import type { CompletionRepository } from "../repositories/completionRepository.js";
import type { CostSummaryRepository } from "../repositories/costSummaryRepository.js";
import type { DraftBundleRepository } from "../repositories/draftBundleRepository.js";
import type { MutationLedgerRepository } from "../repositories/mutationLedgerRepository.js";
import type { RunAttemptRepository } from "../repositories/runAttemptRepository.js";
import type { RunRepository } from "../repositories/runRepository.js";
import { normalizeFinalizeInput } from "./runFinalizeInput.js";
import { buildRunLedgerProjection, selectMutationRangeRecords } from "./runFinalizeLedger.js";
import { materializeRunArtifacts } from "./runFinalizeMaterializer.js";
import type { RunEventService } from "./runEventService.js";

export interface FinalizeRunCommand {
  runId: string;
  traceId: string;
  attemptSeq: number;
  queueJobId: string;
  result: AgentRunResultSummary;
  request?: RunFinalizeRequest;
  at: string;
}

export interface FinalizeRunResult {
  accepted: boolean;
  runStatus: RunStatus;
  completionRecordRef?: string;
}

export class RunFinalizeService {
  constructor(
    private readonly runRepository: RunRepository,
    private readonly runAttemptRepository: RunAttemptRepository,
    private readonly mutationLedgerRepository: MutationLedgerRepository,
    private readonly costSummaryRepository: CostSummaryRepository,
    private readonly draftBundleRepository: DraftBundleRepository,
    private readonly completionRepository: CompletionRepository,
    private readonly objectStore: ObjectStoreClient,
    private readonly runEventService: RunEventService,
    private readonly logger: Logger,
  ) {}

  async finalizeRun(command: FinalizeRunCommand): Promise<FinalizeRunResult> {
    const run = await this.runRepository.findById(command.runId);
    if (!run) {
      throw new NotFoundError(`Run not found: ${command.runId}`);
    }
    if (run.traceId !== command.traceId) {
      throw new ConflictError(
        `Trace mismatch for run ${command.runId}: expected ${run.traceId}, received ${command.traceId}`,
      );
    }
    if (run.attemptSeq !== command.attemptSeq) {
      throw new ConflictError(
        `Stale attempt for run ${command.runId}: active ${run.attemptSeq}, received ${command.attemptSeq}`,
      );
    }
    if (run.queueJobId !== command.queueJobId) {
      throw new ConflictError(
        `Stale queue job for run ${command.runId}: active ${run.queueJobId}, received ${command.queueJobId}`,
      );
    }
    if (isTerminalRunStatus(run.status)) {
      return {
        accepted: true,
        runStatus: run.status,
        ...(run.completionRecordRef ? { completionRecordRef: run.completionRecordRef } : {}),
      };
    }

    const attempt = await this.runAttemptRepository.findByRunIdAndAttemptSeq(
      command.runId,
      command.attemptSeq,
    );
    if (!attempt) {
      throw new NotFoundError(
        `Attempt not found for run ${command.runId} seq ${command.attemptSeq}`,
      );
    }
    if (attempt.queueJobId !== command.queueJobId) {
      throw new ConflictError(
        `Queue job mismatch for run ${command.runId} seq ${command.attemptSeq}`,
        {
          expectedQueueJobId: attempt.queueJobId,
          receivedQueueJobId: command.queueJobId,
        },
      );
    }

    const normalized = normalizeFinalizeInput(command);
    let updatedRun;
    let completionRecordRef: string | undefined;

    if (normalized.materialization) {
      const ledgerRecords = await this.mutationLedgerRepository.listByRunId(run.runId);
      const rangedRecords = selectMutationRangeRecords(
        ledgerRecords,
        normalized.materialization.sourceMutationRange,
      );
      if (rangedRecords.length === 0) {
        throw new ConflictError(
          `Cannot materialize bundle without mutation ledger rows for run ${run.runId}`,
        );
      }
      const ledgerProjection = buildRunLedgerProjection(rangedRecords);
      const materialized = await materializeRunArtifacts({
        run: {
          runId: run.runId,
          traceId: run.traceId,
          pageId: run.pageId,
          requestRef: run.requestRef,
          snapshotRef: run.snapshotRef,
        },
        commandContext: {
          attemptSeq: command.attemptSeq,
          at: command.at,
        },
        result: normalized.result,
        input: normalized.materialization,
        ledgerProjection,
        objectStore: this.objectStore,
      });
      await this.draftBundleRepository.save({
        bundleId: materialized.bundle.bundleId,
        runId: materialized.bundle.runId,
        traceId: materialized.bundle.traceId,
        draftId: materialized.bundle.draftId,
        payloadRef: materialized.bundleRef,
        payload: materialized.bundle,
        eventSequence: materialized.bundle.eventSequence,
        createdAt: command.at,
      });
      await this.completionRepository.save(materialized.completionRecord);
      updatedRun = await this.runRepository.bindFinalization(command.runId, {
        status: normalized.result.finalStatus,
        statusReasonCode: null,
        draftId: normalized.result.draftId,
        finalArtifactRef: materialized.bundle.bundleId,
        completionRecordRef: materialized.completionRecord.completionRecordId,
        latestSaveReceiptId: normalized.result.latestSaveReceiptId,
        latestSavedRevision: materialized.completionRecord.latestSaveEvidence
          ? materialized.completionRecord.finalRevision
          : null,
        finalRevision: normalized.result.finalRevision,
      });
      completionRecordRef = materialized.completionRecord.completionRecordId;
    } else {
      updatedRun = await this.runRepository.updateStatus(
        command.runId,
        normalized.result.finalStatus,
      );
    }

    await this.runAttemptRepository.updateAttemptState(
      command.runId,
      command.attemptSeq,
      this.mapFinalStatusToAttemptState(normalized.result.finalStatus),
      attempt.workerId ?? undefined,
      attempt.lastHeartbeatAt ?? undefined,
    );
    await this.costSummaryRepository.upsertPlaceholder(
      command.runId,
      command.traceId,
      normalized.result,
    );

    if (normalized.result.finalStatus === "failed") {
      await this.runEventService.appendFailed(
        command.runId,
        command.traceId,
        normalized.result.errorSummary ?? {
          code: "run_failed_without_error_summary",
          message: "Run finalized as failed without an explicit error summary",
        },
        command.at,
      );
    } else if (normalized.result.finalStatus === "cancelled") {
      await this.runEventService.appendCancelled(
        command.runId,
        command.traceId,
        command.at,
      );
    } else {
      await this.runEventService.appendCompleted(
        command.runId,
        command.traceId,
        normalized.result,
        command.at,
      );
    }

    this.logger.info("Finalized run placeholder", {
      runId: command.runId,
      traceId: command.traceId,
      finalStatus: normalized.result.finalStatus,
      existingStatus: run.status,
      ...(completionRecordRef ? { completionRecordRef } : {}),
    });

    return {
      accepted: true,
      runStatus: updatedRun?.status ?? normalized.result.finalStatus,
      ...(completionRecordRef ? { completionRecordRef } : {}),
    };
  }

  async failRun(
    runId: string,
    traceId: string,
    error: ErrorSummary,
    at: string,
  ): Promise<void> {
    await this.runRepository.updateStatus(runId, "failed");
    await this.runEventService.appendFailed(runId, traceId, error, at);
  }

  private mapFinalStatusToAttemptState(
    finalStatus: AgentRunResultSummary["finalStatus"],
  ): "succeeded" | "failed" | "cancelled" {
    switch (finalStatus) {
      case "completed":
      case "completed_with_warning":
        return "succeeded";
      case "cancelled":
        return "cancelled";
      case "save_failed_after_apply":
      case "failed":
        return "failed";
    }
  }
}
