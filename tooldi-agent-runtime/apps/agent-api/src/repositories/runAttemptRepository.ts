import type { AttemptState } from "@tooldi/agent-domain";
import type { PgClient } from "@tooldi/agent-persistence";

export interface RunAttemptRecord {
  attemptId: string;
  runId: string;
  traceId: string;
  attemptSeq: number;
  queueJobId: string;
  acceptedHttpRequestId: string;
  attemptState: AttemptState;
  workerId: string | null;
  lastHeartbeatAt: string | null;
  createdAt: string;
}

export class RunAttemptRepository {
  private readonly records = new Map<string, RunAttemptRecord>();

  constructor(private readonly db: PgClient) {
    void this.db;
  }

  async create(record: RunAttemptRecord): Promise<RunAttemptRecord> {
    this.records.set(record.attemptId, record);
    return record;
  }

  async findByRunIdAndAttemptSeq(
    runId: string,
    attemptSeq: number,
  ): Promise<RunAttemptRecord | null> {
    return (
      [...this.records.values()].find(
        (record) => record.runId === runId && record.attemptSeq === attemptSeq,
      ) ?? null
    );
  }

  async findByRunId(runId: string): Promise<RunAttemptRecord[]> {
    return [...this.records.values()].filter((record) => record.runId === runId);
  }

  async touchHeartbeat(
    runId: string,
    attemptSeq: number,
    heartbeatAt: string,
    attemptState: AttemptState,
    workerId?: string,
  ): Promise<RunAttemptRecord | null> {
    const current = await this.findByRunIdAndAttemptSeq(runId, attemptSeq);
    if (!current) {
      return null;
    }

    const updated: RunAttemptRecord = {
      ...current,
      attemptState,
      workerId: workerId ?? current.workerId,
      lastHeartbeatAt: heartbeatAt,
    };
    this.records.set(updated.attemptId, updated);
    return updated;
  }

  async updateAttemptState(
    runId: string,
    attemptSeq: number,
    attemptState: AttemptState,
    workerId?: string,
    heartbeatAt?: string,
  ): Promise<RunAttemptRecord | null> {
    const current = await this.findByRunIdAndAttemptSeq(runId, attemptSeq);
    if (!current) {
      return null;
    }

    const updated: RunAttemptRecord = {
      ...current,
      attemptState,
      workerId: workerId ?? current.workerId,
      lastHeartbeatAt: heartbeatAt ?? current.lastHeartbeatAt,
    };
    this.records.set(updated.attemptId, updated);
    return updated;
  }
}
