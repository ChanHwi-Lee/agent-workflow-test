import type {
  AgentRunResultSummary,
  ErrorSummary,
} from "@tooldi/agent-contracts";
import type { RunStatus } from "@tooldi/agent-domain";
import type { Logger } from "@tooldi/agent-observability";

import { isTerminalRunStatus } from "@tooldi/agent-domain";

import { ConflictError, NotFoundError } from "../lib/errors.js";
import type { CompletionRepository } from "../repositories/completionRepository.js";
import type { CostSummaryRepository } from "../repositories/costSummaryRepository.js";
import type { DraftBundleRepository } from "../repositories/draftBundleRepository.js";
import type { RunAttemptRepository } from "../repositories/runAttemptRepository.js";
import type { RunRepository } from "../repositories/runRepository.js";
import type { RunEventService } from "./runEventService.js";

export interface FinalizeRunCommand {
  runId: string;
  traceId: string;
  attemptSeq: number;
  queueJobId: string;
  result: AgentRunResultSummary;
  at: string;
}

export interface FinalizeRunResult {
  accepted: boolean;
  runStatus: RunStatus;
}

export class RunFinalizeService {
  constructor(
    private readonly runRepository: RunRepository,
    private readonly runAttemptRepository: RunAttemptRepository,
    private readonly costSummaryRepository: CostSummaryRepository,
    private readonly draftBundleRepository: DraftBundleRepository,
    private readonly completionRepository: CompletionRepository,
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

    const updatedRun = await this.runRepository.updateStatus(
      command.runId,
      command.result.finalStatus,
    );
    await this.runAttemptRepository.updateAttemptState(
      command.runId,
      command.attemptSeq,
      this.mapFinalStatusToAttemptState(command.result.finalStatus),
      attempt.workerId ?? undefined,
      attempt.lastHeartbeatAt ?? undefined,
    );
    await this.costSummaryRepository.upsertPlaceholder(
      command.runId,
      command.traceId,
      command.result,
    );
    await this.draftBundleRepository.savePlaceholder(
      command.runId,
      command.traceId,
      command.result,
    );
    await this.completionRepository.savePlaceholder(
      command.runId,
      command.traceId,
      command.result,
    );

    if (command.result.finalStatus === "failed") {
      await this.runEventService.appendFailed(
        command.runId,
        command.traceId,
        command.result.errorSummary ?? {
          code: "run_failed_without_error_summary",
          message: "Run finalized as failed without an explicit error summary",
        },
        command.at,
      );
    } else if (command.result.finalStatus === "cancelled") {
      await this.runEventService.appendCancelled(
        command.runId,
        command.traceId,
        command.at,
      );
    } else {
      await this.runEventService.appendCompleted(
        command.runId,
        command.traceId,
        command.result,
        command.at,
      );
    }

    this.logger.info("Finalized run placeholder", {
      runId: command.runId,
      traceId: command.traceId,
      finalStatus: command.result.finalStatus,
      existingStatus: run.status,
    });

    return {
      accepted: true,
      runStatus: updatedRun?.status ?? command.result.finalStatus,
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
