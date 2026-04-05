import type { AttemptState, RunStatus } from "@tooldi/agent-domain";
import type { Logger } from "@tooldi/agent-observability";

import { NotFoundError } from "../lib/errors.js";
import type { RunAttemptRepository } from "../repositories/runAttemptRepository.js";
import type { RunRepository } from "../repositories/runRepository.js";
import type { RunEventService } from "./runEventService.js";

export interface HeartbeatCommand {
  runId: string;
  traceId: string;
  attemptSeq: number;
  queueJobId: string;
  workerId: string;
  phase: "planning" | "executing" | "saving" | "finalizing";
  heartbeatAt: string;
}

export interface HeartbeatResponse {
  accepted: boolean;
  runStatus: RunStatus;
  cancelRequested: boolean;
  stopAfterCurrentAction: boolean;
  queueJobId: string;
}

export class RunRecoveryService {
  constructor(
    private readonly runRepository: RunRepository,
    private readonly runAttemptRepository: RunAttemptRepository,
    private readonly runEventService: RunEventService,
    private readonly logger: Logger,
  ) {}

  async acceptHeartbeat(command: HeartbeatCommand): Promise<HeartbeatResponse> {
    const run = await this.runRepository.findById(command.runId);
    if (!run) {
      throw new NotFoundError(`Run not found: ${command.runId}`);
    }

    const nextAttemptState: AttemptState =
      command.phase === "finalizing" ? "finalizing" : "running";
    const updatedAttempt = await this.runAttemptRepository.touchHeartbeat(
      command.runId,
      command.attemptSeq,
      command.heartbeatAt,
      command.workerId,
    );
    if (!updatedAttempt) {
      throw new NotFoundError(
        `Attempt not found for run ${command.runId} seq ${command.attemptSeq}`,
      );
    }
    updatedAttempt.attemptState = nextAttemptState;

    await this.runEventService.appendLog(
      command.runId,
      command.traceId,
      "info",
      `Worker heartbeat accepted for phase=${command.phase} attempt=${command.attemptSeq}`,
      command.heartbeatAt,
    );

    const cancelRequested = run.status === "cancel_requested";
    this.logger.debug("Accepted worker heartbeat placeholder", {
      runId: command.runId,
      traceId: command.traceId,
      attemptSeq: command.attemptSeq,
      queueJobId: command.queueJobId,
      phase: command.phase,
      cancelRequested,
    });

    return {
      accepted: true,
      runStatus: run.status,
      cancelRequested,
      stopAfterCurrentAction: cancelRequested,
      queueJobId: command.queueJobId,
    };
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
}
