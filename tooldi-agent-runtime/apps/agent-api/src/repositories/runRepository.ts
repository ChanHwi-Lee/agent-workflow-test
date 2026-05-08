import { eq } from "drizzle-orm";

import type { RunStatus } from "@tooldi/agent-domain";
import { runs, type PgClient } from "@tooldi/agent-persistence";

import {
  toDate,
  toIso,
  toNullableDate,
  toNullableIso,
} from "./pgRecordMapping.js";

export interface RunRecord {
  runId: string;
  traceId: string;
  requestId: string;
  userSerial: string;
  documentId: string;
  pageId: string;
  status: RunStatus;
  statusReasonCode: string | null;
  attemptSeq: number;
  queueJobId: string | null;
  requestRef: string;
  snapshotRef: string;
  draftId?: string | null;
  finalArtifactRef?: string | null;
  completionRecordRef?: string | null;
  latestSaveReceiptId?: string | null;
  latestSavedRevision?: number | null;
  finalRevision?: number | null;
  deadlineAt: string;
  lastAckedSeq: number;
  pageLockToken: string;
  cancelRequestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class RunRepository {
  constructor(private readonly db: PgClient) {}

  async create(record: RunRecord): Promise<RunRecord> {
    const [created] = await this.db.db
      .insert(runs)
      .values(this.toInsert(record))
      .returning();
    return this.toRecord(created!);
  }

  async findById(runId: string): Promise<RunRecord | null> {
    const [record] = await this.db.db
      .select()
      .from(runs)
      .where(eq(runs.runId, runId))
      .limit(1);
    return record ? this.toRecord(record) : null;
  }

  async updateStatus(
    runId: string,
    status: RunStatus,
    statusReasonCode?: string | null,
  ): Promise<RunRecord | null> {
    const current = await this.findById(runId);
    if (!current) {
      return null;
    }

    const [updated] = await this.db.db
      .update(runs)
      .set({
        status,
        statusReasonCode:
          statusReasonCode === undefined ? current.statusReasonCode : statusReasonCode,
        updatedAt: new Date(),
      })
      .where(eq(runs.runId, runId))
      .returning();
    return updated ? this.toRecord(updated) : null;
  }

  async activateAttempt(
    runId: string,
    attemptSeq: number,
    queueJobId: string,
    status: RunStatus,
    statusReasonCode: string | null = null,
  ): Promise<RunRecord | null> {
    const current = await this.findById(runId);
    if (!current) {
      return null;
    }

    const [updated] = await this.db.db
      .update(runs)
      .set({
        attemptSeq,
        queueJobId,
        status,
        statusReasonCode,
        updatedAt: new Date(),
      })
      .where(eq(runs.runId, runId))
      .returning();
    return updated ? this.toRecord(updated) : null;
  }

  async markCancelRequested(
    runId: string,
    requestedAt: string,
  ): Promise<RunRecord | null> {
    const current = await this.findById(runId);
    if (!current) {
      return null;
    }

    const [updated] = await this.db.db
      .update(runs)
      .set({
        status: "cancel_requested",
        statusReasonCode: "cancel_requested_by_client",
        cancelRequestedAt: toDate(requestedAt),
        updatedAt: new Date(),
      })
      .where(eq(runs.runId, runId))
      .returning();
    return updated ? this.toRecord(updated) : null;
  }

  async setLastAckedSeq(runId: string, seq: number): Promise<RunRecord | null> {
    const current = await this.findById(runId);
    if (!current) {
      return null;
    }

    const [updated] = await this.db.db
      .update(runs)
      .set({
        lastAckedSeq: Math.max(current.lastAckedSeq, seq),
        updatedAt: new Date(),
      })
      .where(eq(runs.runId, runId))
      .returning();
    return updated ? this.toRecord(updated) : null;
  }

  async bindFinalization(
    runId: string,
    input: {
      status: RunStatus;
      statusReasonCode?: string | null;
      draftId: string | null;
      finalArtifactRef: string | null;
      completionRecordRef: string | null;
      latestSaveReceiptId: string | null;
      latestSavedRevision: number | null;
      finalRevision: number | null;
    },
  ): Promise<RunRecord | null> {
    const current = await this.findById(runId);
    if (!current) {
      return null;
    }

    const [updated] = await this.db.db
      .update(runs)
      .set({
        status: input.status,
        statusReasonCode:
          input.statusReasonCode === undefined
            ? current.statusReasonCode
            : input.statusReasonCode,
        draftId: input.draftId,
        finalArtifactRef: input.finalArtifactRef,
        completionRecordRef: input.completionRecordRef,
        latestSaveReceiptId: input.latestSaveReceiptId,
        latestSavedRevision: input.latestSavedRevision,
        finalRevision: input.finalRevision,
        updatedAt: new Date(),
      })
      .where(eq(runs.runId, runId))
      .returning();
    return updated ? this.toRecord(updated) : null;
  }

  private toInsert(record: RunRecord): typeof runs.$inferInsert {
    return {
      runId: record.runId,
      traceId: record.traceId,
      requestId: record.requestId,
      userSerial: record.userSerial,
      documentId: record.documentId,
      pageId: record.pageId,
      status: record.status,
      statusReasonCode: record.statusReasonCode,
      attemptSeq: record.attemptSeq,
      queueJobId: record.queueJobId,
      requestRef: record.requestRef,
      snapshotRef: record.snapshotRef,
      draftId: record.draftId ?? null,
      finalArtifactRef: record.finalArtifactRef ?? null,
      completionRecordRef: record.completionRecordRef ?? null,
      latestSaveReceiptId: record.latestSaveReceiptId ?? null,
      latestSavedRevision: record.latestSavedRevision ?? null,
      finalRevision: record.finalRevision ?? null,
      deadlineAt: toDate(record.deadlineAt),
      lastAckedSeq: record.lastAckedSeq,
      pageLockToken: record.pageLockToken,
      cancelRequestedAt: toNullableDate(record.cancelRequestedAt),
      createdAt: toDate(record.createdAt),
      updatedAt: toDate(record.updatedAt),
    };
  }

  private toRecord(row: typeof runs.$inferSelect): RunRecord {
    return {
      runId: row.runId,
      traceId: row.traceId,
      requestId: row.requestId,
      userSerial: row.userSerial,
      documentId: row.documentId,
      pageId: row.pageId,
      status: row.status as RunStatus,
      statusReasonCode: row.statusReasonCode,
      attemptSeq: row.attemptSeq,
      queueJobId: row.queueJobId,
      requestRef: row.requestRef,
      snapshotRef: row.snapshotRef,
      draftId: row.draftId,
      finalArtifactRef: row.finalArtifactRef,
      completionRecordRef: row.completionRecordRef,
      latestSaveReceiptId: row.latestSaveReceiptId,
      latestSavedRevision: row.latestSavedRevision,
      finalRevision: row.finalRevision,
      deadlineAt: toIso(row.deadlineAt),
      lastAckedSeq: row.lastAckedSeq,
      pageLockToken: row.pageLockToken,
      cancelRequestedAt: toNullableIso(row.cancelRequestedAt),
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  }
}
