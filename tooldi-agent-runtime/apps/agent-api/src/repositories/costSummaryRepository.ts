import type { AgentRunResultSummary } from "@tooldi/agent-contracts";
import type { PgClient } from "@tooldi/agent-persistence";

export interface CostSummaryPlaceholderRecord {
  runId: string;
  traceId: string;
  finalStatus: AgentRunResultSummary["finalStatus"];
  recordedAt: string;
}

export class CostSummaryRepository {
  private readonly records = new Map<string, CostSummaryPlaceholderRecord>();

  constructor(private readonly db: PgClient) {
    void this.db;
  }

  async upsertPlaceholder(
    runId: string,
    traceId: string,
    result: AgentRunResultSummary,
  ): Promise<CostSummaryPlaceholderRecord> {
    const record: CostSummaryPlaceholderRecord = {
      runId,
      traceId,
      finalStatus: result.finalStatus,
      recordedAt: new Date().toISOString(),
    };
    this.records.set(runId, record);
    return record;
  }
}
