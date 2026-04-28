import type { AgentRunResultSummary } from "@tooldi/agent-contracts";
import { costSummaries, type PgClient } from "@tooldi/agent-persistence";

import { toIso } from "./pgRecordMapping.js";

export interface CostSummaryPlaceholderRecord {
  runId: string;
  traceId: string;
  finalStatus: AgentRunResultSummary["finalStatus"];
  recordedAt: string;
}

export class CostSummaryRepository {
  constructor(private readonly db: PgClient) {}

  async upsertPlaceholder(
    runId: string,
    traceId: string,
    result: AgentRunResultSummary,
  ): Promise<CostSummaryPlaceholderRecord> {
    const recordedAt = new Date();
    const [record] = await this.db.db
      .insert(costSummaries)
      .values({
        runId,
        traceId,
        finalStatus: result.finalStatus,
        recordedAt,
      })
      .onConflictDoUpdate({
        target: costSummaries.runId,
        set: {
          traceId,
          finalStatus: result.finalStatus,
          recordedAt,
        },
      })
      .returning();
    return {
      runId,
      traceId,
      finalStatus: record!.finalStatus as AgentRunResultSummary["finalStatus"],
      recordedAt: toIso(record!.recordedAt),
    };
  }
}
