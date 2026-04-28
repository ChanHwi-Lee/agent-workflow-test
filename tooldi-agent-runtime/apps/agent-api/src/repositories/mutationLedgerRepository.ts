import { asc, eq, max } from "drizzle-orm";

import type {
  CanvasMutationEnvelope,
  MutationApplyAckRequest,
  WaitMutationAckResponse,
  WorkerAppendEventRequest,
} from "@tooldi/agent-contracts";
import { mutationLedger, type PgClient } from "@tooldi/agent-persistence";

import { toDate, toIso } from "./pgRecordMapping.js";

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
  constructor(private readonly db: PgClient) {}

  async recordProposal(input: {
    runId: string;
    traceId: string;
    attemptSeq: number;
    queueJobId: string;
    event: Extract<WorkerAppendEventRequest["event"], { type: "mutation.proposed" }>;
  }): Promise<MutationLedgerRecord> {
    const assignedSeq = await this.nextSequence(input.runId);
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
    const [stored] = await this.db.db
      .insert(mutationLedger)
      .values({
        mutationId: record.mutationId,
        runId: record.runId,
        traceId: record.traceId,
        attemptSeq: record.attemptSeq,
        queueJobId: record.queueJobId,
        seq: record.seq,
        rollbackGroupId: record.rollbackGroupId,
        expectedBaseRevision: record.expectedBaseRevision ?? null,
        mutation: record.mutation,
        proposedAt: toDate(record.proposedAt),
        ackStatus: null,
        ackRecord: null,
      })
      .returning();
    return this.toRecord(stored!);
  }

  async recordAck(
    request: MutationApplyAckRequest,
  ): Promise<MutationAckLedgerRecord> {
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

    await this.db.db
      .update(mutationLedger)
      .set({
        ackStatus: request.status,
        ackRecord: record,
      })
      .where(eq(mutationLedger.mutationId, request.mutationId));

    return record;
  }

  async findByMutationId(
    runId: string,
    mutationId: string,
  ): Promise<MutationLedgerRecord | null> {
    const [record] = await this.db.db
      .select()
      .from(mutationLedger)
      .where(eq(mutationLedger.mutationId, mutationId))
      .limit(1);
    if (!record || record.runId !== runId) {
      return null;
    }
    return this.toRecord(record);
  }

  async listByRunId(runId: string): Promise<MutationLedgerRecord[]> {
    const records = await this.db.db
      .select()
      .from(mutationLedger)
      .where(eq(mutationLedger.runId, runId))
      .orderBy(asc(mutationLedger.seq));
    return records.map((record) => this.toRecord(record));
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

  private async nextSequence(runId: string): Promise<number> {
    const [record] = await this.db.db
      .select({
        maxSeq: max(mutationLedger.seq),
      })
      .from(mutationLedger)
      .where(eq(mutationLedger.runId, runId));
    return Number(record?.maxSeq ?? 0) + 1;
  }

  private toRecord(row: typeof mutationLedger.$inferSelect): MutationLedgerRecord {
    return {
      mutationId: row.mutationId,
      runId: row.runId,
      traceId: row.traceId,
      attemptSeq: row.attemptSeq,
      queueJobId: row.queueJobId,
      seq: row.seq,
      rollbackGroupId: row.rollbackGroupId,
      expectedBaseRevision: row.expectedBaseRevision ?? undefined,
      mutation: row.mutation,
      proposedAt: toIso(row.proposedAt),
      ackStatus: row.ackStatus as MutationApplyAckRequest["status"] | null,
      ackRecord: row.ackRecord
        ? {
            ...row.ackRecord,
            resultingRevision: row.ackRecord.resultingRevision,
            resolvedLayerIds: row.ackRecord.resolvedLayerIds,
            commandResults: row.ackRecord.commandResults,
            error: row.ackRecord.error,
          }
        : null,
    };
  }
}
