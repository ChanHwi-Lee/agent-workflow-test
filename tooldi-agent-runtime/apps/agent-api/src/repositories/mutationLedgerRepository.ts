import type { MutationApplyAckRequest } from "@tooldi/agent-contracts";
import type { PgClient } from "@tooldi/agent-persistence";

export interface MutationAckLedgerRecord {
  mutationId: string;
  runId: string;
  traceId: string;
  seq: number;
  status: MutationApplyAckRequest["status"];
  targetPageId: string;
  resultingRevision: number | undefined;
  clientObservedAt: string;
}

export class MutationLedgerRepository {
  private readonly records = new Map<string, MutationAckLedgerRecord>();

  constructor(private readonly db: PgClient) {
    void this.db;
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
      clientObservedAt: request.clientObservedAt,
    };
    this.records.set(request.mutationId, record);
    return record;
  }
}
