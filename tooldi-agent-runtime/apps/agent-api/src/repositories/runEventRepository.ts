import type { PublicRunEvent } from "@tooldi/agent-contracts";
import type { PgClient } from "@tooldi/agent-persistence";

export interface StoredRunEvent {
  eventId: string;
  eventOffset: number;
  runId: string;
  traceId: string;
  event: PublicRunEvent;
  recordedAt: string;
}

export class RunEventRepository {
  private readonly records: StoredRunEvent[] = [];
  private nextOffset = 1;

  constructor(private readonly db: PgClient) {
    void this.db;
  }

  async append(event: PublicRunEvent): Promise<StoredRunEvent> {
    const stored: StoredRunEvent = {
      eventId: String(this.nextOffset),
      eventOffset: this.nextOffset,
      runId: event.runId,
      traceId: event.traceId,
      event,
      recordedAt: new Date().toISOString(),
    };
    this.nextOffset += 1;
    this.records.push(stored);
    return stored;
  }

  async listAfter(runId: string, afterEventId?: string): Promise<StoredRunEvent[]> {
    const records = this.records.filter((record) => record.runId === runId);
    if (!afterEventId) {
      return records;
    }
    const offset = Number(afterEventId);
    if (!Number.isFinite(offset)) {
      return records;
    }
    return records.filter((record) => record.eventOffset > offset);
  }
}
