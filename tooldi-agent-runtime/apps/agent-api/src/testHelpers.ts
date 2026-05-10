import type { AgentApiEnv } from "@tooldi/agent-config";
import { resetAgentRuntimeData } from "@tooldi/agent-persistence";

import { buildApp } from "./app.js";

const DEFAULT_TEST_POSTGRES_URL =
  process.env.POSTGRES_URL ??
  "postgres://postgres:postgres@127.0.0.1:55432/tooldi_agent_runtime_test";

export function createTestEnv(overrides: Partial<AgentApiEnv> = {}): AgentApiEnv {
  return {
    nodeEnv: "test",
    logLevel: "debug",
    postgresUrl: DEFAULT_TEST_POSTGRES_URL,
    redisUrl: "redis://localhost:6379/9",
    bullmqQueueName: "agent-workflow-interactive-test",
    objectStoreMode: "memory",
    objectStoreRootDir: "/tmp/tooldi-agent-runtime-object-store-test",
    objectStoreBucket: "tooldi-agent-runtime-test",
    objectStorePrefix: "agent-runtime-test",
    objectStoreEndpoint: null,
    host: "127.0.0.1",
    port: 0,
    publicBaseUrl: "http://127.0.0.1:3000",
    sseHeartbeatIntervalMs: 50,
    queueTransportMode: "memory",
    runWatchdogPickupTimeoutMs: 120000,
    runWatchdogRetryDelayMs: 1500,
    runWatchdogMaxQueueAttempts: 2,
    runWatchdogEnqueueTimeoutMs: 2000,
    runWatchdogFinalizeGraceMs: 1500,
    tooldiPhpApiBaseUrl: "http://localhost:8080",
    tooldiPhpInternalToken: "test-php-token",
    agentWorkerInternalToken: "test-worker-token",
    ...overrides,
  };
}

export interface SeededRunInput {
  runId: string;
  status?: string;
  prompt?: string;
  createdAt?: Date;
  canvasWidth?: number;
  canvasHeight?: number;
  attemptSeqs?: number[];
  artifactKeys?: string[];
  events?: SeededEventInput[];
}

export interface SeededEventInput {
  type: string;
  phase?: string;
  at?: string;
  extra?: Record<string, unknown>;
}

export interface TestAppHandle {
  app: Awaited<ReturnType<typeof buildApp>>;
  close: () => Promise<void>;
  seedRun: (input: SeededRunInput) => Promise<void>;
}

/**
 * Builds a Fastify app pre-wired with admin routes for tests.
 * Resets agent_runtime tables on each call so tests are isolated.
 */
export async function buildTestApp(
  envOverrides: Partial<AgentApiEnv> = {},
): Promise<TestAppHandle> {
  const env = createTestEnv(envOverrides);
  const app = await buildApp({ env });
  await resetAgentRuntimeData(app.db);

  const close = async () => {
    await app.close();
  };

  const seedRun = async (input: SeededRunInput) => {
    const runId = input.runId;
    const traceId = `trace-${runId}`;
    const requestId = `request-${runId}`;
    const attemptSeqs = input.attemptSeqs ?? [0];
    const createdAt = input.createdAt ?? new Date();
    const prompt = input.prompt ?? `prompt for ${runId}`;
    const canvasWidth = input.canvasWidth ?? 1080;
    const canvasHeight = input.canvasHeight ?? 1080;

    await app.db.query(
      `INSERT INTO agent_runtime.run_requests (
        request_id, client_request_id, editor_session_id, run_id, trace_id, surface,
        normalized_prompt, locale, timezone, accepted_http_request_id, dedupe_key,
        prompt_ref, redacted_preview, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      )`,
      [
        requestId,
        `client-${runId}`,
        `session-${runId}`,
        runId,
        traceId,
        "toolditor",
        prompt,
        "ko-KR",
        "Asia/Seoul",
        `http-${runId}`,
        `dedupe-${runId}`,
        `agent-run-request://${requestId}`,
        prompt.slice(0, 60),
        createdAt.toISOString(),
      ],
    );

    await app.db.query(
      `INSERT INTO agent_runtime.runs (
        run_id, trace_id, request_id, user_serial, document_id, page_id,
        status, status_reason_code, attempt_seq, queue_job_id, request_ref,
        snapshot_ref, draft_id, final_artifact_ref, completion_record_ref,
        latest_save_receipt_id, latest_saved_revision, final_revision,
        deadline_at, last_acked_seq, page_lock_token, cancel_requested_at,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24
      )`,
      [
        runId,
        traceId,
        requestId,
        `user-${runId}`,
        `document-${runId}`,
        `page-${runId}`,
        input.status ?? "completed",
        null,
        attemptSeqs.length - 1,
        `job-${runId}`,
        `agent-run-request://${requestId}`,
        `agent-run-snapshot://${runId}`,
        null,
        null,
        null,
        null,
        null,
        null,
        new Date(createdAt.getTime() + 120_000).toISOString(),
        0,
        `lock-${runId}`,
        null,
        createdAt.toISOString(),
        createdAt.toISOString(),
      ],
    );

    for (const attemptSeq of attemptSeqs) {
      await app.db.query(
        `INSERT INTO agent_runtime.run_attempts (
          attempt_id, run_id, trace_id, attempt_seq, retry_of_attempt_seq,
          queue_job_id, accepted_http_request_id, attempt_state,
          status_reason_code, worker_id, started_at, lease_recognized_at,
          last_heartbeat_at, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )`,
        [
          `attempt-${runId}-${attemptSeq}`,
          runId,
          traceId,
          attemptSeq,
          null,
          `job-${runId}-${attemptSeq}`,
          `http-${runId}-${attemptSeq}`,
          "running",
          null,
          `worker-${runId}`,
          createdAt.toISOString(),
          createdAt.toISOString(),
          createdAt.toISOString(),
          createdAt.toISOString(),
        ],
      );
    }

    for (const event of input.events ?? []) {
      const eventPayload: Record<string, unknown> = {
        type: event.type,
        runId,
        traceId,
        at: event.at ?? new Date().toISOString(),
        ...(event.phase ? { phase: event.phase } : {}),
        ...(event.extra ?? {}),
      };
      await app.db.query(
        `INSERT INTO agent_runtime.run_events (run_id, trace_id, event, recorded_at)
         VALUES ($1, $2, $3, $4)`,
        [runId, traceId, JSON.stringify(eventPayload), new Date().toISOString()],
      );
    }

    // Seed snapshot in object store so detail endpoint can resolve canvas meta.
    await app.objectStore.putObject({
      key: `runs/${runId}/snapshot.json`,
      body: JSON.stringify({
        editorContext: {
          documentId: `document-${runId}`,
          pageId: `page-${runId}`,
          canvasWidth,
          canvasHeight,
        },
      }),
      contentType: "application/json",
      metadata: {},
    });

    for (const artifactKey of input.artifactKeys ?? []) {
      await app.objectStore.putObject({
        key: artifactKey,
        body: "{}",
        contentType: "application/json",
        metadata: {},
      });
    }
  };

  return { app, close, seedRun };
}
