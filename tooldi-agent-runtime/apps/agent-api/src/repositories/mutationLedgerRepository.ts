import type {
  CanvasMutationEnvelope,
  MutationApplyAckRequest,
  WaitMutationAckResponse,
  WorkerAppendEventRequest,
} from "@tooldi/agent-contracts";
import type { PgClient } from "@tooldi/agent-persistence";

export interface ProposedMutationLedgerRecord {
  mutationId: string;
  runId: string;
  traceId: string;
  attemptSeq: number;
  queueJobId: string;
  seq: number;
  rollbackGroupId: string;
  expectedBaseRevision: number | undefined;
  mutation: CanvasMutationEnvelope;
  proposedAt: string;
}

export interface MutationAckLedgerRecord {
  mutationId: string;
  runId: string;
  traceId: string;
  seq: number;
  status: MutationApplyAckRequest["status"];
  targetPageId: string;
  resultingRevision: number | undefined;
  resolvedLayerIds: MutationApplyAckRequest["resolvedLayerIds"];
  commandResults: MutationApplyAckRequest["commandResults"];
  error: MutationApplyAckRequest["error"];
  clientObservedAt: string;
}

export interface MutationLedgerRecord extends ProposedMutationLedgerRecord {
  ackStatus: MutationApplyAckRequest["status"] | null;
  ackRecord: MutationAckLedgerRecord | null;
}

export class MutationLedgerRepository {
  private readonly records = new Map<string, MutationLedgerRecord>();
  private readonly nextSeqByRun = new Map<string, number>();

  constructor(private readonly db: PgClient) {
    void this.db;
  }

  async recordProposal(input: {
    runId: string;
    traceId: string;
    attemptSeq: number;
    queueJobId: string;
    event: Extract<WorkerAppendEventRequest["event"], { type: "mutation.proposed" }>;
  }): Promise<MutationLedgerRecord> {
    const assignedSeq = this.nextSequence(input.runId);
    const canonicalMutation: CanvasMutationEnvelope = {
      ...input.event.mutation,
      runId: input.runId,
      traceId: input.traceId,
      mutationId: input.event.mutationId,
      seq: assignedSeq,
      ...(input.event.dependsOnSeq !== undefined
        ? { dependsOnSeq: input.event.dependsOnSeq }
        : {}),
      expectedBaseRevision:
        input.event.expectedBaseRevision ?? input.event.mutation.expectedBaseRevision,
      rollbackHint: {
        ...input.event.mutation.rollbackHint,
        rollbackGroupId: input.event.rollbackGroupId,
      },
    };

    const record: MutationLedgerRecord = {
      mutationId: input.event.mutationId,
      runId: input.runId,
      traceId: input.traceId,
      attemptSeq: input.attemptSeq,
      queueJobId: input.queueJobId,
      seq: assignedSeq,
      rollbackGroupId: input.event.rollbackGroupId,
      expectedBaseRevision: input.event.expectedBaseRevision,
      mutation: canonicalMutation,
      proposedAt: canonicalMutation.emittedAt,
      ackStatus: null,
      ackRecord: null,
    };
    this.records.set(record.mutationId, record);
    return record;
  }

  async recordAck(
    request: MutationApplyAckRequest,
  ): Promise<MutationAckLedgerRecord> {
    const current = this.records.get(request.mutationId);
    const record: MutationAckLedgerRecord = {
      mutationId: request.mutationId,
      runId: request.runId,
      traceId: request.traceId,
      seq: request.seq,
      status: request.status,
      targetPageId: request.targetPageId,
      resultingRevision: request.resultingRevision,
      resolvedLayerIds: request.resolvedLayerIds,
      commandResults: request.commandResults,
      error: request.error,
      clientObservedAt: request.clientObservedAt,
    };

    if (current) {
      this.records.set(request.mutationId, {
        ...current,
        ackStatus: request.status,
        ackRecord: record,
      });
    }

    return record;
  }

  async findByMutationId(
    runId: string,
    mutationId: string,
  ): Promise<MutationLedgerRecord | null> {
    const record = this.records.get(mutationId);
    if (!record || record.runId !== runId) {
      return null;
    }
    return record;
  }

  async listByRunId(runId: string): Promise<MutationLedgerRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.runId === runId)
      .sort((left, right) => left.seq - right.seq);
  }

  async waitForAck(
    runId: string,
    mutationId: string,
    waitMs: number,
    runStatus: string,
  ): Promise<WaitMutationAckResponse> {
    const startedAt = Date.now();

    while (true) {
      const record = await this.findByMutationId(runId, mutationId);
      if (!record) {
        return {
          found: false,
          status: "timed_out",
        };
      }

      if (record.ackRecord) {
        return {
          found: true,
          status: record.ackStatus === "rejected" ? "rejected" : "acked",
          seq: record.seq,
          ...(record.ackRecord.resultingRevision !== undefined
            ? { resultingRevision: record.ackRecord.resultingRevision }
            : {}),
          ...(record.ackRecord.resolvedLayerIds
            ? { resolvedLayerIds: record.ackRecord.resolvedLayerIds }
            : {}),
          ...(record.ackRecord.commandResults
            ? { commandResults: record.ackRecord.commandResults }
            : {}),
          ...(record.ackStatus === "rejected"
            ? {
                error:
                  record.ackRecord.error ?? {
                    code: "mutation_rejected",
                    message: `Mutation ${mutationId} was rejected by the editor`,
                  },
              }
            : {}),
        };
      }

      if (runStatus === "cancel_requested" || runStatus === "cancelled") {
        return {
          found: true,
          status: "cancelled",
          seq: record.seq,
        };
      }

      if (waitMs <= 0) {
        return {
          found: true,
          status: "dispatched",
          seq: record.seq,
        };
      }

      if (Date.now() - startedAt >= waitMs) {
        return {
          found: true,
          status: "timed_out",
          seq: record.seq,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  private nextSequence(runId: string): number {
    const next = (this.nextSeqByRun.get(runId) ?? 0) + 1;
    this.nextSeqByRun.set(runId, next);
    return next;
  }
}
