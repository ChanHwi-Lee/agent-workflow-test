import type { Logger } from "@tooldi/agent-observability";

import { isTerminalRunStatus } from "@tooldi/agent-domain";

import { ConflictError, NotFoundError } from "../lib/errors.js";
import type { RunRepository } from "../repositories/runRepository.js";
import type { RunEventService } from "./runEventService.js";

export interface CancelRunResult {
  runId: string;
  status: "cancel_requested";
  requestedAt: string;
}

export class RunCancelService {
  constructor(
    private readonly runRepository: RunRepository,
    private readonly runEventService: RunEventService,
    private readonly logger: Logger,
  ) {}

  async acceptCancel(
    runId: string,
    traceId: string,
    reason?: string,
  ): Promise<CancelRunResult> {
    const run = await this.runRepository.findById(runId);
    if (!run) {
      throw new NotFoundError(`Run not found: ${runId}`);
    }
    if (run.traceId !== traceId) {
      throw new ConflictError(
        `Trace mismatch for run ${runId}: expected ${run.traceId}, received ${traceId}`,
      );
    }
    if (isTerminalRunStatus(run.status)) {
      throw new ConflictError(`Run already reached terminal status: ${run.status}`, {
        runId,
        traceId,
        status: run.status,
      });
    }

    const requestedAt = run.cancelRequestedAt ?? new Date().toISOString();
    if (run.status !== "cancel_requested" || run.cancelRequestedAt === null) {
      await this.runRepository.markCancelRequested(runId, requestedAt);
      await this.runEventService.appendCancelRequested(
        runId,
        traceId,
        reason,
        requestedAt,
      );
    }

    this.logger.warn("Accepted cancel placeholder", {
      runId,
      traceId,
      previousStatus: run.status,
      reason,
    });

    return {
      runId,
      status: "cancel_requested",
      requestedAt,
    };
  }
}
