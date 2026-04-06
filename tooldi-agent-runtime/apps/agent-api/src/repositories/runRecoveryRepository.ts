import type { RunRepairContext, RunRecoveryProjection } from "@tooldi/agent-contracts";
import type { PgClient } from "@tooldi/agent-persistence";

export interface RunRecoveryRecord {
  recoveryId: string;
  runId: string;
  traceId: string;
  attemptSeq: number;
  queueJobId: string;
  reasonCode: string;
  source: RunRepairContext["source"];
  recovery: RunRecoveryProjection;
  createdAt: string;
}

export class RunRecoveryRepository {
  private readonly recordsByRunId = new Map<string, RunRecoveryRecord[]>();

  constructor(private readonly db: PgClient) {
    void this.db;
  }

  async create(
    record: Omit<RunRecoveryRecord, "recoveryId">,
  ): Promise<RunRecoveryRecord> {
    const created: RunRecoveryRecord = {
      recoveryId: `recovery_${record.runId}_${record.attemptSeq}_${Date.now()}`,
      ...record,
    };
    const existing = this.recordsByRunId.get(record.runId) ?? [];
    existing.push(created);
    this.recordsByRunId.set(record.runId, existing);
    return created;
  }

  async listByRunId(runId: string): Promise<RunRecoveryRecord[]> {
    return [...(this.recordsByRunId.get(runId) ?? [])];
  }

  async findLatestByRunId(runId: string): Promise<RunRecoveryRecord | null> {
    const records = this.recordsByRunId.get(runId);
    if (!records || records.length === 0) {
      return null;
    }
    return records[records.length - 1] ?? null;
  }
}
