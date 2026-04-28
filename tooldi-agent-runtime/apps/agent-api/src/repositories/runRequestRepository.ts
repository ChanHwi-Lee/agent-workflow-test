import { asc, eq } from "drizzle-orm";

import { runRequests, type PgClient } from "@tooldi/agent-persistence";

import { toDate, toIso } from "./pgRecordMapping.js";

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
  constructor(private readonly db: PgClient) {}

  async create(record: RunRequestRecord): Promise<RunRequestRecord> {
    const [created] = await this.db.db
      .insert(runRequests)
      .values({
        ...record,
        createdAt: toDate(record.createdAt),
      })
      .returning();
    return this.toRecord(created!);
  }

  async findByDedupeKey(dedupeKey: string): Promise<RunRequestRecord | null> {
    const [record] = await this.db.db
      .select()
      .from(runRequests)
      .where(eq(runRequests.dedupeKey, dedupeKey))
      .orderBy(asc(runRequests.createdAt))
      .limit(1);
    return record ? this.toRecord(record) : null;
  }

  async findByRequestId(requestId: string): Promise<RunRequestRecord | null> {
    const [record] = await this.db.db
      .select()
      .from(runRequests)
      .where(eq(runRequests.requestId, requestId))
      .limit(1);
    return record ? this.toRecord(record) : null;
  }

  private toRecord(
    row: typeof runRequests.$inferSelect,
  ): RunRequestRecord {
    return {
      ...row,
      createdAt: toIso(row.createdAt),
    };
  }
}
