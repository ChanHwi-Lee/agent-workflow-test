import { eq } from "drizzle-orm";

import type { LiveDraftArtifactBundle } from "@tooldi/agent-contracts";
import { draftBundles, type PgClient } from "@tooldi/agent-persistence";

import { toDate, toIso } from "./pgRecordMapping.js";

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
  constructor(private readonly db: PgClient) {}

  async save(record: DraftBundleRecord): Promise<DraftBundleRecord> {
    const [saved] = await this.db.db
      .insert(draftBundles)
      .values({
        ...record,
        createdAt: toDate(record.createdAt),
      })
      .onConflictDoUpdate({
        target: draftBundles.bundleId,
        set: {
          runId: record.runId,
          traceId: record.traceId,
          draftId: record.draftId,
          payloadRef: record.payloadRef,
          payload: record.payload,
          eventSequence: record.eventSequence,
          createdAt: toDate(record.createdAt),
        },
      })
      .returning();
    return this.toRecord(saved!);
  }

  async findByRunId(runId: string): Promise<DraftBundleRecord | null> {
    const [record] = await this.db.db
      .select()
      .from(draftBundles)
      .where(eq(draftBundles.runId, runId))
      .limit(1);
    return record ? this.toRecord(record) : null;
  }

  private toRecord(row: typeof draftBundles.$inferSelect): DraftBundleRecord {
    return {
      bundleId: row.bundleId,
      runId: row.runId,
      traceId: row.traceId,
      draftId: row.draftId,
      payloadRef: row.payloadRef,
      payload: row.payload,
      eventSequence: row.eventSequence,
      createdAt: toIso(row.createdAt),
    };
  }
}
