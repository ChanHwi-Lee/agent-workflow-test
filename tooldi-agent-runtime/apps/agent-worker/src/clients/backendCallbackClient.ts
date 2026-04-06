import type {
  RunFinalizeRequest,
  WaitMutationAckQuery,
  WaitMutationAckResponse,
  WorkerAppendEventRequest,
  WorkerAppendEventResponse,
  WorkerFinalizeResponse,
  WorkerHeartbeatRequest,
  WorkerHeartbeatResponse,
} from "@tooldi/agent-contracts";
import type { Logger } from "@tooldi/agent-observability";

export interface BackendCallbackClient {
  heartbeat(
    runId: string,
    request: WorkerHeartbeatRequest,
  ): Promise<WorkerHeartbeatResponse>;
  appendEvent(
    runId: string,
    request: WorkerAppendEventRequest,
  ): Promise<WorkerAppendEventResponse>;
  waitMutationAck(
    runId: string,
    mutationId: string,
    query: WaitMutationAckQuery,
  ): Promise<WaitMutationAckResponse>;
  finalize(
    runId: string,
    request: RunFinalizeRequest,
  ): Promise<WorkerFinalizeResponse>;
}

class NoopBackendCallbackClient implements BackendCallbackClient {
  constructor(private readonly logger: Logger) {}

  async heartbeat(
    runId: string,
    request: WorkerHeartbeatRequest,
  ): Promise<WorkerHeartbeatResponse> {
    this.logger.debug("Worker heartbeat placeholder", {
      runId,
      traceId: request.traceId,
      attempt: request.attempt,
      queueJobId: request.queueJobId,
      phase: request.phase,
    });
    return {
      accepted: true,
      cancelRequested: false,
      stopAfterCurrentAction: false,
      runStatus: "planning_queued",
      deadlineAt: new Date(Date.now() + 30000).toISOString(),
    };
  }

  async appendEvent(
    runId: string,
    request: WorkerAppendEventRequest,
  ): Promise<WorkerAppendEventResponse> {
    this.logger.debug("Worker appendEvent placeholder", {
      runId,
      traceId: request.traceId,
      attempt: request.attempt,
      queueJobId: request.queueJobId,
      eventType: request.event.type,
    });
    return {
      accepted: true,
      cancelRequested: false,
      ...(request.event.type === "mutation.proposed" ? { assignedSeq: 1 } : {}),
    };
  }

  async waitMutationAck(
    runId: string,
    mutationId: string,
    query: WaitMutationAckQuery,
  ): Promise<WaitMutationAckResponse> {
    this.logger.debug("Worker waitMutationAck placeholder", {
      runId,
      mutationId,
      waitMs: query.waitMs ?? 0,
    });
    return {
      found: true,
      status: "timed_out",
      seq: 1,
    };
  }

  async finalize(
    runId: string,
    request: RunFinalizeRequest,
  ): Promise<WorkerFinalizeResponse> {
    this.logger.info("Worker finalize placeholder", {
      runId,
      traceId: request.traceId,
      attempt: request.attempt,
      queueJobId: request.queueJobId,
      finalStatus: request.finalStatus,
    });
    return {
      accepted: true,
      runStatus: request.finalStatus,
    };
  }
}

export function createBackendCallbackClient(logger: Logger): BackendCallbackClient {
  return new NoopBackendCallbackClient(logger);
}
