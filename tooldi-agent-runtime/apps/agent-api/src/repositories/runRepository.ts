import type { RunStatus } from "@tooldi/agent-domain";
import type { PgClient } from "@tooldi/agent-persistence";

export interface RunRecord {
  runId: string;
  traceId: string;
  requestId: string;
  documentId: string;
  pageId: string;
  status: RunStatus;
  attemptSeq: number;
  queueJobId: string | null;
  deadlineAt: string;
  pageLockToken: string;
  cancelRequestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class RunRepository {
  private readonly records = new Map<string, RunRecord>();

  constructor(private readonly db: PgClient) {
    void this.db;
  }

  async create(record: RunRecord): Promise<RunRecord> {
    this.records.set(record.runId, record);
    return record;
  }

  async findById(runId: string): Promise<RunRecord | null> {
    return this.records.get(runId) ?? null;
  }

  async updateStatus(runId: string, status: RunStatus): Promise<RunRecord | null> {
    const current = this.records.get(runId);
    if (!current) {
      return null;
    }

    const updated: RunRecord = {
      ...current,
      status,
      updatedAt: new Date().toISOString(),
    };
    this.records.set(runId, updated);
    return updated;
  }

  async activateAttempt(
    runId: string,
    attemptSeq: number,
    queueJobId: string,
    status: RunStatus,
  ): Promise<RunRecord | null> {
    const current = this.records.get(runId);
    if (!current) {
      return null;
    }

    const updated: RunRecord = {
      ...current,
      attemptSeq,
      queueJobId,
      status,
      updatedAt: new Date().toISOString(),
    };
    this.records.set(runId, updated);
    return updated;
  }

  async markCancelRequested(
    runId: string,
    requestedAt: string,
  ): Promise<RunRecord | null> {
    const current = this.records.get(runId);
    if (!current) {
      return null;
    }

    const updated: RunRecord = {
      ...current,
      status: "cancel_requested",
      cancelRequestedAt: requestedAt,
      updatedAt: new Date().toISOString(),
    };
    this.records.set(runId, updated);
    return updated;
  }
}
