import type { AgentRunResultSummary } from "@tooldi/agent-contracts";
import type { PgClient } from "@tooldi/agent-persistence";

export interface DraftBundlePlaceholderRecord {
  bundleId: string;
  runId: string;
  traceId: string;
  draftId: string | null;
  createdAt: string;
}

export class DraftBundleRepository {
  private readonly records = new Map<string, DraftBundlePlaceholderRecord>();

  constructor(private readonly db: PgClient) {
    void this.db;
  }

  async savePlaceholder(
    runId: string,
    traceId: string,
    result: AgentRunResultSummary,
  ): Promise<DraftBundlePlaceholderRecord> {
    const bundleId = `bundle_${runId}`;
    const record: DraftBundlePlaceholderRecord = {
      bundleId,
      runId,
      traceId,
      draftId: result.draftId,
      createdAt: new Date().toISOString(),
    };
    this.records.set(bundleId, record);
    return record;
  }
}
