import type { RunCompletionRecord } from "@tooldi/agent-contracts";
import type { PgClient } from "@tooldi/agent-persistence";

export class CompletionRepository {
  private readonly records = new Map<string, RunCompletionRecord>();

  constructor(private readonly db: PgClient) {
    void this.db;
  }

  async save(record: RunCompletionRecord): Promise<RunCompletionRecord> {
    this.records.set(record.runId, record);
    return record;
  }

  async findByRunId(runId: string): Promise<RunCompletionRecord | null> {
    return this.records.get(runId) ?? null;
  }
}
