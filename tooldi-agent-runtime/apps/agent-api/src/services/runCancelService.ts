import type { Logger } from "@tooldi/agent-observability";

import { NotFoundError } from "../lib/errors.js";
import type { RunRepository } from "../repositories/runRepository.js";
import type { RunEventService } from "./runEventService.js";

export interface CancelRunResult {
  runId: string;
  traceId: string;
  status: "cancel_requested";
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

    await this.runRepository.updateStatus(runId, "cancel_requested");
    await this.runEventService.appendCancelRequested(
      runId,
      traceId,
      reason,
      new Date().toISOString(),
    );

    this.logger.warn("Accepted cancel placeholder", {
      runId,
      traceId,
      previousStatus: run.status,
      reason,
    });

    return {
      runId,
      traceId,
      status: "cancel_requested",
    };
  }
}
