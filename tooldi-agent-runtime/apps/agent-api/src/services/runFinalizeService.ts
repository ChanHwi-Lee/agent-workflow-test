import type {
  AgentRunResultSummary,
  ErrorSummary,
} from "@tooldi/agent-contracts";
import type { Logger } from "@tooldi/agent-observability";

import { NotFoundError } from "../lib/errors.js";
import type { CompletionRepository } from "../repositories/completionRepository.js";
import type { CostSummaryRepository } from "../repositories/costSummaryRepository.js";
import type { DraftBundleRepository } from "../repositories/draftBundleRepository.js";
import type { RunRepository } from "../repositories/runRepository.js";
import type { RunEventService } from "./runEventService.js";

export interface FinalizeRunCommand {
  runId: string;
  traceId: string;
  result: AgentRunResultSummary;
  at: string;
}

export class RunFinalizeService {
  constructor(
    private readonly runRepository: RunRepository,
    private readonly costSummaryRepository: CostSummaryRepository,
    private readonly draftBundleRepository: DraftBundleRepository,
    private readonly completionRepository: CompletionRepository,
    private readonly runEventService: RunEventService,
    private readonly logger: Logger,
  ) {}

  async finalizeRun(command: FinalizeRunCommand): Promise<void> {
    const run = await this.runRepository.findById(command.runId);
    if (!run) {
      throw new NotFoundError(`Run not found: ${command.runId}`);
    }

    await this.runRepository.updateStatus(command.runId, command.result.finalStatus);
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
}
