import type { PgClient } from "@tooldi/agent-persistence";

export interface RunRequestRecord {
  requestId: string;
  clientRequestId: string;
  editorSessionId: string;
  runId: string;
  traceId: string;
  surface: string;
  normalizedPrompt: string;
  locale: string;
  timezone: string;
  acceptedHttpRequestId: string;
  dedupeKey: string;
  promptRef: string;
  redactedPreview: string;
  createdAt: string;
}

export class RunRequestRepository {
  private readonly records = new Map<string, RunRequestRecord>();

  constructor(private readonly db: PgClient) {
    void this.db;
  }

  async create(record: RunRequestRecord): Promise<RunRequestRecord> {
    this.records.set(record.requestId, record);
    return record;
  }

  async findByDedupeKey(dedupeKey: string): Promise<RunRequestRecord | null> {
    for (const record of this.records.values()) {
      if (record.dedupeKey === dedupeKey) {
        return record;
      }
    }
    return null;
  }
}
