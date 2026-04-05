import type { AgentRunResultSummary } from "@tooldi/agent-contracts";
import type { PgClient } from "@tooldi/agent-persistence";

export interface CompletionPlaceholderRecord {
  completionId: string;
  runId: string;
  traceId: string;
  finalStatus: AgentRunResultSummary["finalStatus"];
  completedAt: string;
}

export class CompletionRepository {
  private readonly records = new Map<string, CompletionPlaceholderRecord>();

  constructor(private readonly db: PgClient) {
    void this.db;
  }

  async savePlaceholder(
    runId: string,
    traceId: string,
    result: AgentRunResultSummary,
  ): Promise<CompletionPlaceholderRecord> {
    const record: CompletionPlaceholderRecord = {
      completionId: `completion_${runId}`,
      runId,
      traceId,
      finalStatus: result.finalStatus,
      completedAt: new Date().toISOString(),
    };
    this.records.set(runId, record);
    return record;
  }
}
