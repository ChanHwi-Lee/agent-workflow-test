import { and, asc, eq } from "drizzle-orm";

import type { AttemptState } from "@tooldi/agent-domain";
import { runAttempts, type PgClient } from "@tooldi/agent-persistence";

import {
  toDate,
  toIso,
  toNullableDate,
  toNullableIso,
} from "./pgRecordMapping.js";

export interface RunAttemptRecord {
  attemptId: string;
  runId: string;
  traceId: string;
  attemptSeq: number;
  retryOfAttemptSeq: number | null;
  queueJobId: string;
  acceptedHttpRequestId: string;
  attemptState: AttemptState;
  statusReasonCode: string | null;
  workerId: string | null;
  startedAt: string | null;
  leaseRecognizedAt: string | null;
  lastHeartbeatAt: string | null;
  createdAt: string;
}

export class RunAttemptRepository {
  constructor(private readonly db: PgClient) {}

  async create(record: RunAttemptRecord): Promise<RunAttemptRecord> {
    const [created] = await this.db.db
      .insert(runAttempts)
      .values(this.toInsert(record))
      .returning();
    return this.toRecord(created!);
  }

  async findByRunIdAndAttemptSeq(
    runId: string,
    attemptSeq: number,
  ): Promise<RunAttemptRecord | null> {
    const [record] = await this.db.db
      .select()
      .from(runAttempts)
      .where(
        and(
          eq(runAttempts.runId, runId),
          eq(runAttempts.attemptSeq, attemptSeq),
        ),
      )
      .limit(1);
    return record ? this.toRecord(record) : null;
  }

  async findByRunId(runId: string): Promise<RunAttemptRecord[]> {
    const records = await this.db.db
      .select()
      .from(runAttempts)
      .where(eq(runAttempts.runId, runId))
      .orderBy(asc(runAttempts.attemptSeq));
    return records.map((record) => this.toRecord(record));
  }

  async findByQueueJobId(queueJobId: string): Promise<RunAttemptRecord | null> {
    const [record] = await this.db.db
      .select()
      .from(runAttempts)
      .where(eq(runAttempts.queueJobId, queueJobId))
      .limit(1);
    return record ? this.toRecord(record) : null;
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

    const [updated] = await this.db.db
      .update(runAttempts)
      .set({
        attemptState,
        workerId: workerId ?? current.workerId,
        startedAt: toDate(current.startedAt ?? heartbeatAt),
        leaseRecognizedAt: toDate(current.leaseRecognizedAt ?? heartbeatAt),
        lastHeartbeatAt: toDate(heartbeatAt),
      })
      .where(eq(runAttempts.attemptId, current.attemptId))
      .returning();
    return updated ? this.toRecord(updated) : null;
  }

  async updateAttemptState(
    runId: string,
    attemptSeq: number,
    attemptState: AttemptState,
    workerId?: string,
    heartbeatAt?: string,
    statusReasonCode?: string | null,
  ): Promise<RunAttemptRecord | null> {
    const current = await this.findByRunIdAndAttemptSeq(runId, attemptSeq);
    if (!current) {
      return null;
    }

    const [updated] = await this.db.db
      .update(runAttempts)
      .set({
        attemptState,
        workerId: workerId ?? current.workerId,
        lastHeartbeatAt: toNullableDate(heartbeatAt ?? current.lastHeartbeatAt),
        statusReasonCode:
          statusReasonCode === undefined
            ? current.statusReasonCode
            : statusReasonCode,
      })
      .where(eq(runAttempts.attemptId, current.attemptId))
      .returning();
    return updated ? this.toRecord(updated) : null;
  }

  async recognizeLease(
    runId: string,
    attemptSeq: number,
    recognizedAt: string,
    workerId?: string,
  ): Promise<RunAttemptRecord | null> {
    const current = await this.findByRunIdAndAttemptSeq(runId, attemptSeq);
    if (!current) {
      return null;
    }

    const [updated] = await this.db.db
      .update(runAttempts)
      .set({
        workerId: workerId ?? current.workerId,
        startedAt: toDate(current.startedAt ?? recognizedAt),
        leaseRecognizedAt: toDate(current.leaseRecognizedAt ?? recognizedAt),
        lastHeartbeatAt: toNullableDate(current.lastHeartbeatAt),
      })
      .where(eq(runAttempts.attemptId, current.attemptId))
      .returning();
    return updated ? this.toRecord(updated) : null;
  }

  private toInsert(record: RunAttemptRecord): typeof runAttempts.$inferInsert {
    return {
      attemptId: record.attemptId,
      runId: record.runId,
      traceId: record.traceId,
      attemptSeq: record.attemptSeq,
      retryOfAttemptSeq: record.retryOfAttemptSeq,
      queueJobId: record.queueJobId,
      acceptedHttpRequestId: record.acceptedHttpRequestId,
      attemptState: record.attemptState,
      statusReasonCode: record.statusReasonCode,
      workerId: record.workerId,
      startedAt: toNullableDate(record.startedAt),
      leaseRecognizedAt: toNullableDate(record.leaseRecognizedAt),
      lastHeartbeatAt: toNullableDate(record.lastHeartbeatAt),
      createdAt: toDate(record.createdAt),
    };
  }

  private toRecord(row: typeof runAttempts.$inferSelect): RunAttemptRecord {
    return {
      attemptId: row.attemptId,
      runId: row.runId,
      traceId: row.traceId,
      attemptSeq: row.attemptSeq,
      retryOfAttemptSeq: row.retryOfAttemptSeq,
      queueJobId: row.queueJobId,
      acceptedHttpRequestId: row.acceptedHttpRequestId,
      attemptState: row.attemptState as AttemptState,
      statusReasonCode: row.statusReasonCode,
      workerId: row.workerId,
      startedAt: toNullableIso(row.startedAt),
      leaseRecognizedAt: toNullableIso(row.leaseRecognizedAt),
      lastHeartbeatAt: toNullableIso(row.lastHeartbeatAt),
      createdAt: toIso(row.createdAt),
    };
  }
}
