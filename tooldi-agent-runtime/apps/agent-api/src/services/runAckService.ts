import type {
  MutationApplyAckRequest,
  MutationApplyAckResponse,
} from "@tooldi/agent-contracts";
import type { Logger } from "@tooldi/agent-observability";

import { NotFoundError } from "../lib/errors.js";
import type { MutationLedgerRepository } from "../repositories/mutationLedgerRepository.js";
import type { RunRepository } from "../repositories/runRepository.js";
import type { RunEventService } from "./runEventService.js";

export class RunAckService {
  constructor(
    private readonly mutationLedgerRepository: MutationLedgerRepository,
    private readonly runRepository: RunRepository,
    private readonly runEventService: RunEventService,
    private readonly logger: Logger,
  ) {}

  async acceptMutationAck(
    request: MutationApplyAckRequest,
  ): Promise<MutationApplyAckResponse> {
    const run = await this.runRepository.findById(request.runId);
    if (!run) {
      throw new NotFoundError(`Run not found: ${request.runId}`);
    }

    await this.mutationLedgerRepository.recordAck(request);
    await this.runEventService.appendLog(
      request.runId,
      request.traceId,
      request.status === "rejected" ? "warn" : "info",
      `Observed mutation ack for seq=${request.seq} status=${request.status}`,
      request.clientObservedAt,
    );

    this.logger.info("Recorded mutation ack", {
      runId: request.runId,
      traceId: request.traceId,
      mutationId: request.mutationId,
      seq: request.seq,
      status: request.status,
    });

    return {
      accepted: true,
      runStatus: run.status,
      nextExpectedSeq: request.seq + 1,
    };
  }
}
