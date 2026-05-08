import {
  index,
  integer,
  jsonb,
  pgSchema,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type {
  CanvasMutationEnvelope,
  LiveDraftArtifactBundle,
  MutationApplyAckRequest,
  PublicRunEvent,
  RunCompletionRecord,
  RunRecoveryProjection,
} from "@tooldi/agent-contracts";

export const agentRuntimePgSchema = pgSchema("agent_runtime");

export const runRequests = agentRuntimePgSchema.table(
  "run_requests",
  {
    requestId: text("request_id").primaryKey(),
    clientRequestId: text("client_request_id").notNull(),
    editorSessionId: text("editor_session_id").notNull(),
    runId: text("run_id").notNull(),
    traceId: text("trace_id").notNull(),
    surface: text("surface").notNull(),
    normalizedPrompt: text("normalized_prompt").notNull(),
    locale: text("locale").notNull(),
    timezone: text("timezone").notNull(),
    acceptedHttpRequestId: text("accepted_http_request_id").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    promptRef: text("prompt_ref").notNull(),
    redactedPreview: text("redacted_preview").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uidx_agent_runtime_run_requests_dedupe_key").on(table.dedupeKey),
    index("idx_agent_runtime_run_requests_run_id").on(table.runId),
    index("idx_agent_runtime_run_requests_client_request_id").on(
      table.clientRequestId,
    ),
  ],
);

export const runs = agentRuntimePgSchema.table(
  "runs",
  {
    runId: text("run_id").primaryKey(),
    traceId: text("trace_id").notNull(),
    requestId: text("request_id").notNull(),
    userSerial: text("user_serial").notNull(),
    documentId: text("document_id").notNull(),
    pageId: text("page_id").notNull(),
    status: text("status").notNull(),
    statusReasonCode: text("status_reason_code"),
    attemptSeq: integer("attempt_seq").notNull(),
    queueJobId: text("queue_job_id"),
    requestRef: text("request_ref").notNull(),
    snapshotRef: text("snapshot_ref").notNull(),
    draftId: text("draft_id"),
    finalArtifactRef: text("final_artifact_ref"),
    completionRecordRef: text("completion_record_ref"),
    latestSaveReceiptId: text("latest_save_receipt_id"),
    latestSavedRevision: integer("latest_saved_revision"),
    finalRevision: integer("final_revision"),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    lastAckedSeq: integer("last_acked_seq").notNull(),
    pageLockToken: text("page_lock_token").notNull(),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_agent_runtime_runs_trace_id").on(table.traceId),
    index("idx_agent_runtime_runs_document_page").on(table.documentId, table.pageId),
    index("idx_agent_runtime_runs_status").on(table.status),
  ],
);

export const runAttempts = agentRuntimePgSchema.table(
  "run_attempts",
  {
    attemptId: text("attempt_id").primaryKey(),
    runId: text("run_id").notNull(),
    traceId: text("trace_id").notNull(),
    attemptSeq: integer("attempt_seq").notNull(),
    retryOfAttemptSeq: integer("retry_of_attempt_seq"),
    queueJobId: text("queue_job_id").notNull(),
    acceptedHttpRequestId: text("accepted_http_request_id").notNull(),
    attemptState: text("attempt_state").notNull(),
    statusReasonCode: text("status_reason_code"),
    workerId: text("worker_id"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    leaseRecognizedAt: timestamp("lease_recognized_at", { withTimezone: true }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uidx_agent_runtime_run_attempts_run_seq").on(
      table.runId,
      table.attemptSeq,
    ),
    index("idx_agent_runtime_run_attempts_queue_job_id").on(table.queueJobId),
  ],
);

export const runEvents = agentRuntimePgSchema.table(
  "run_events",
  {
    eventId: serial("event_id").primaryKey(),
    runId: text("run_id").notNull(),
    traceId: text("trace_id").notNull(),
    event: jsonb("event").$type<PublicRunEvent>().notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_agent_runtime_run_events_run_id_event_id").on(
      table.runId,
      table.eventId,
    ),
  ],
);

export interface MutationAckPayload {
  mutationId: string;
  runId: string;
  traceId: string;
  seq: number;
  status: MutationApplyAckRequest["status"];
  targetPageId: string;
  resultingRevision: number | undefined;
  resolvedLayerIds: MutationApplyAckRequest["resolvedLayerIds"];
  commandResults: MutationApplyAckRequest["commandResults"];
  error: MutationApplyAckRequest["error"];
  clientObservedAt: string;
}

export const mutationLedger = agentRuntimePgSchema.table(
  "mutation_ledger",
  {
    mutationId: text("mutation_id").primaryKey(),
    runId: text("run_id").notNull(),
    traceId: text("trace_id").notNull(),
    attemptSeq: integer("attempt_seq").notNull(),
    queueJobId: text("queue_job_id").notNull(),
    seq: integer("seq").notNull(),
    rollbackGroupId: text("rollback_group_id").notNull(),
    expectedBaseRevision: integer("expected_base_revision"),
    mutation: jsonb("mutation").$type<CanvasMutationEnvelope>().notNull(),
    proposedAt: timestamp("proposed_at", { withTimezone: true }).notNull(),
    ackStatus: text("ack_status"),
    ackRecord: jsonb("ack_record").$type<MutationAckPayload>(),
  },
  (table) => [
    uniqueIndex("uidx_agent_runtime_mutation_ledger_run_seq").on(
      table.runId,
      table.seq,
    ),
    index("idx_agent_runtime_mutation_ledger_run_id").on(table.runId),
  ],
);

export const runRecoveries = agentRuntimePgSchema.table(
  "run_recoveries",
  {
    recoveryId: text("recovery_id").primaryKey(),
    runId: text("run_id").notNull(),
    traceId: text("trace_id").notNull(),
    attemptSeq: integer("attempt_seq").notNull(),
    queueJobId: text("queue_job_id").notNull(),
    reasonCode: text("reason_code").notNull(),
    source: text("source").notNull(),
    recovery: jsonb("recovery").$type<RunRecoveryProjection>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_agent_runtime_run_recoveries_run_id_created_at").on(
      table.runId,
      table.createdAt,
    ),
  ],
);

export const costSummaries = agentRuntimePgSchema.table("cost_summaries", {
  runId: text("run_id").primaryKey(),
  traceId: text("trace_id").notNull(),
  finalStatus: text("final_status").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
});

export const draftBundles = agentRuntimePgSchema.table(
  "draft_bundles",
  {
    bundleId: text("bundle_id").primaryKey(),
    runId: text("run_id").notNull(),
    traceId: text("trace_id").notNull(),
    draftId: text("draft_id").notNull(),
    payloadRef: text("payload_ref").notNull(),
    payload: jsonb("payload").$type<LiveDraftArtifactBundle>().notNull(),
    eventSequence: integer("event_sequence").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("uidx_agent_runtime_draft_bundles_run_id").on(table.runId)],
);

export const runCompletions = agentRuntimePgSchema.table(
  "run_completions",
  {
    completionRecordId: text("completion_record_id").primaryKey(),
    runId: text("run_id").notNull(),
    traceId: text("trace_id").notNull(),
    record: jsonb("record").$type<RunCompletionRecord>().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uidx_agent_runtime_run_completions_run_id").on(table.runId),
  ],
);

export const agentRuntimeSchema = {
  runRequests,
  runs,
  runAttempts,
  runEvents,
  mutationLedger,
  runRecoveries,
  costSummaries,
  draftBundles,
  runCompletions,
};
