import { desc, eq } from "drizzle-orm";

import type { RunRepairContext, RunRecoveryProjection } from "@tooldi/agent-contracts";
import { runRecoveries, type PgClient } from "@tooldi/agent-persistence";

import { toDate, toIso } from "./pgRecordMapping.js";

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
  constructor(private readonly db: PgClient) {}

  async create(
    record: Omit<RunRecoveryRecord, "recoveryId">,
  ): Promise<RunRecoveryRecord> {
    const created: RunRecoveryRecord = {
      recoveryId: `recovery_${record.runId}_${record.attemptSeq}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...record,
    };
    const [stored] = await this.db.db
      .insert(runRecoveries)
      .values({
        ...created,
        createdAt: toDate(created.createdAt),
      })
      .returning();
    return this.toRecord(stored!);
  }

  async listByRunId(runId: string): Promise<RunRecoveryRecord[]> {
    const records = await this.db.db
      .select()
      .from(runRecoveries)
      .where(eq(runRecoveries.runId, runId))
      .orderBy(runRecoveries.createdAt);
    return records.map((record) => this.toRecord(record));
  }

  async findLatestByRunId(runId: string): Promise<RunRecoveryRecord | null> {
    const [record] = await this.db.db
      .select()
      .from(runRecoveries)
      .where(eq(runRecoveries.runId, runId))
      .orderBy(desc(runRecoveries.createdAt))
      .limit(1);
    return record ? this.toRecord(record) : null;
  }

  private toRecord(row: typeof runRecoveries.$inferSelect): RunRecoveryRecord {
    return {
      recoveryId: row.recoveryId,
      runId: row.runId,
      traceId: row.traceId,
      attemptSeq: row.attemptSeq,
      queueJobId: row.queueJobId,
      reasonCode: row.reasonCode,
      source: row.source as RunRepairContext["source"],
      recovery: row.recovery,
      createdAt: toIso(row.createdAt),
    };
  }
}
