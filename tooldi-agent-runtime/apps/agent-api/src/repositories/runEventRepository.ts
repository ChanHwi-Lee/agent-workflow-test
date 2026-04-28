import { and, asc, eq, gt } from "drizzle-orm";

import type { PublicRunEvent } from "@tooldi/agent-contracts";
import { runEvents, type PgClient } from "@tooldi/agent-persistence";

import { toIso } from "./pgRecordMapping.js";

export interface StoredRunEvent {
  eventId: string;
  eventOffset: number;
  runId: string;
  traceId: string;
  event: PublicRunEvent;
  recordedAt: string;
}

export class RunEventRepository {
  constructor(private readonly db: PgClient) {}

  async append(event: PublicRunEvent): Promise<StoredRunEvent> {
    const [stored] = await this.db.db
      .insert(runEvents)
      .values({
        runId: event.runId,
        traceId: event.traceId,
        event,
        recordedAt: new Date(),
      })
      .returning();
    return this.toRecord(stored!);
  }

  async listAfter(runId: string, afterEventId?: string): Promise<StoredRunEvent[]> {
    if (!afterEventId) {
      const records = await this.db.db
        .select()
        .from(runEvents)
        .where(eq(runEvents.runId, runId))
        .orderBy(asc(runEvents.eventId));
      return records.map((record) => this.toRecord(record));
    }

    const offset = Number(afterEventId);
    if (!Number.isFinite(offset)) {
      const records = await this.db.db
        .select()
        .from(runEvents)
        .where(eq(runEvents.runId, runId))
        .orderBy(asc(runEvents.eventId));
      return records.map((record) => this.toRecord(record));
    }
    const records = await this.db.db
      .select()
      .from(runEvents)
      .where(and(eq(runEvents.runId, runId), gt(runEvents.eventId, offset)))
      .orderBy(asc(runEvents.eventId));
    return records.map((record) => this.toRecord(record));
  }

  private toRecord(row: typeof runEvents.$inferSelect): StoredRunEvent {
    return {
      eventId: String(row.eventId),
      eventOffset: row.eventId,
      runId: row.runId,
      traceId: row.traceId,
      event: row.event,
      recordedAt: toIso(row.recordedAt),
    };
  }
}
