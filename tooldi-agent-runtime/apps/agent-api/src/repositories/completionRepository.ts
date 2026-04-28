import { eq } from "drizzle-orm";

import type { RunCompletionRecord } from "@tooldi/agent-contracts";
import { runCompletions, type PgClient } from "@tooldi/agent-persistence";

export class CompletionRepository {
  constructor(private readonly db: PgClient) {}

  async save(record: RunCompletionRecord): Promise<RunCompletionRecord> {
    const [saved] = await this.db.db
      .insert(runCompletions)
      .values({
        completionRecordId: record.completionRecordId,
        runId: record.runId,
        traceId: record.traceId,
        record,
        completedAt: new Date(record.completedAt),
      })
      .onConflictDoUpdate({
        target: runCompletions.completionRecordId,
        set: {
          runId: record.runId,
          traceId: record.traceId,
          record,
          completedAt: new Date(record.completedAt),
        },
      })
      .returning();
    return saved!.record;
  }

  async findByRunId(runId: string): Promise<RunCompletionRecord | null> {
    const [record] = await this.db.db
      .select()
      .from(runCompletions)
      .where(eq(runCompletions.runId, runId))
      .limit(1);
    return record?.record ?? null;
  }
}
