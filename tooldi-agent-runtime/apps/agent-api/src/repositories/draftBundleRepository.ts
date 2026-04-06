import type { LiveDraftArtifactBundle } from "@tooldi/agent-contracts";
import type { PgClient } from "@tooldi/agent-persistence";

export interface DraftBundleRecord {
  bundleId: string;
  runId: string;
  traceId: string;
  draftId: string;
  payloadRef: string;
  payload: LiveDraftArtifactBundle;
  eventSequence: number;
  createdAt: string;
}

export class DraftBundleRepository {
  private readonly records = new Map<string, DraftBundleRecord>();

  constructor(private readonly db: PgClient) {
    void this.db;
  }

  async save(record: DraftBundleRecord): Promise<DraftBundleRecord> {
    this.records.set(record.bundleId, record);
    return record;
  }

  async findByRunId(runId: string): Promise<DraftBundleRecord | null> {
    for (const record of this.records.values()) {
      if (record.runId === runId) {
        return record;
      }
    }
    return null;
  }
}
