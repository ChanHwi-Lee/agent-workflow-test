import assert from "node:assert/strict";
import test from "node:test";

import type { RunStatus } from "@tooldi/agent-domain";
import { createPgClient } from "@tooldi/agent-persistence";
import type { Logger } from "@tooldi/agent-observability";

import {
  RunQueueEnqueueTimeoutError,
  type RunQueueProducer,
  type EnqueuedRunJob,
  type QueueTransportObserver,
} from "../plugins/queue.js";
import { RunAttemptRepository } from "../repositories/runAttemptRepository.js";
import { RunRepository } from "../repositories/runRepository.js";
import { RunRequestRepository } from "../repositories/runRequestRepository.js";
import { RunWatchdogService } from "./runWatchdogService.js";

class RecordingLogger implements Logger {
  readonly level = "debug" as const;
  readonly records: Array<{
    level: "debug" | "info" | "warn" | "error";
    message: string;
    fields?: Record<string, unknown>;
  }> = [];

  child(bindings: Record<string, unknown>): Logger {
    return {
      ...this,
      debug: (message, fields) =>
        this.debug(message, { ...bindings, ...(fields ?? {}) }),
      info: (message, fields) =>
        this.info(message, { ...bindings, ...(fields ?? {}) }),
      warn: (message, fields) =>
        this.warn(message, { ...bindings, ...(fields ?? {}) }),
      error: (message, fields) =>
        this.error(message, { ...bindings, ...(fields ?? {}) }),
    };
  }

  debug(message: string, fields?: Record<string, unknown>): void {
    this.push("debug", message, fields);
  }

  info(message: string, fields?: Record<string, unknown>): void {
    this.push("info", message, fields);
  }

  warn(message: string, fields?: Record<string, unknown>): void {
    this.push("warn", message, fields);
  }

  error(message: string, fields?: Record<string, unknown>): void {
    this.push("error", message, fields);
  }

  private push(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    fields?: Record<string, unknown>,
  ): void {
    this.records.push({
      level,
      message,
      ...(fields ? { fields } : {}),
    });
  }
}

class FakeRunQueueProducer implements RunQueueProducer {
  readonly enqueued: Array<{
    payload: EnqueuedRunJob["payload"];
    delayMs?: number;
    timeoutMs?: number;
  }> = [];
  readonly removedQueueJobIds: string[] = [];
  removeShouldSucceed = true;
  enqueueError: Error | null = null;

  async enqueueRunJob(
    payload: EnqueuedRunJob["payload"],
    options: { delayMs?: number; timeoutMs?: number } = {},
  ): Promise<EnqueuedRunJob> {
    if (this.enqueueError) {
      throw this.enqueueError;
    }
    this.enqueued.push({
      payload,
      ...(options.delayMs !== undefined ? { delayMs: options.delayMs } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    });
    return {
      jobId: payload.queueJobId,
      enqueuedAt: new Date().toISOString(),
      payload,
    };
  }

  async listJobs(): Promise<readonly EnqueuedRunJob[]> {
    return this.enqueued.map(({ payload }) => ({
      jobId: payload.queueJobId,
      enqueuedAt: new Date().toISOString(),
      payload,
    }));
  }

  async tryRemoveQueuedJob(queueJobId: string): Promise<boolean> {
    this.removedQueueJobIds.push(queueJobId);
    return this.removeShouldSucceed;
  }

  observeTransport(_observer: QueueTransportObserver): () => void {
    return () => {};
  }

  async close(): Promise<void> {}
}

class RecordingRunEventService {
  readonly logs: Array<{ level: "info" | "warn" | "error"; message: string }> = [];
  readonly failures: Array<{ code: string; message: string; retryable?: boolean }> = [];
  readonly cancellations: string[] = [];
  readonly completions: Array<{ finalStatus: string }> = [];

  async appendLog(
    _runId: string,
    _traceId: string,
    level: "info" | "warn" | "error",
    message: string,
    _at: string,
  ): Promise<void> {
    this.logs.push({ level, message });
  }

  async appendFailed(
    _runId: string,
    _traceId: string,
    error: { code: string; message: string; retryable?: boolean },
    _at: string,
  ): Promise<void> {
    this.failures.push(error);
  }

  async appendCancelled(_runId: string, _traceId: string, at: string): Promise<void> {
    this.cancellations.push(at);
  }

  async appendCompleted(
    _runId: string,
    _traceId: string,
    result: { finalStatus: string },
    _at: string,
  ): Promise<void> {
    this.completions.push(result);
  }
}

class RecordingFinalizeRecovery {
  readonly calls: Array<{
    runId: string;
    traceId: string;
    attemptSeq: number;
    queueJobId: string;
    result: { finalStatus: string };
  }> = [];

  async finalizeRun(command: {
    runId: string;
    traceId: string;
    attemptSeq: number;
    queueJobId: string;
    result: { finalStatus: RunStatus };
  }): Promise<{ accepted: true; runStatus: RunStatus }> {
    this.calls.push(command);
    return {
      accepted: true,
      runStatus: command.result.finalStatus,
    };
  }
}

async function seedRun(
  runRepository: RunRepository,
  runRequestRepository: RunRequestRepository,
  runAttemptRepository: RunAttemptRepository,
  options: {
    runId?: string;
    traceId?: string;
    requestId?: string;
    attemptSeq?: number;
    queueJobId?: string;
    status?: "planning_queued" | "planning" | "cancel_requested";
    lastAckedSeq?: number;
    leaseRecognizedAt?: string | null;
  } = {},
): Promise<{
  runId: string;
  traceId: string;
  requestId: string;
  queueJobId: string;
  attemptSeq: number;
}> {
  const runId = options.runId ?? "run-1";
  const traceId = options.traceId ?? "trace-1";
  const requestId = options.requestId ?? "req-1";
  const attemptSeq = options.attemptSeq ?? 1;
  const queueJobId = options.queueJobId ?? `${runId}__attempt_${attemptSeq}`;
  const now = new Date().toISOString();

  await runRequestRepository.create({
    requestId,
    clientRequestId: "client-1",
    editorSessionId: "editor-1",
    runId,
    traceId,
    surface: "toolditor",
    normalizedPrompt: "prompt",
    locale: "ko-KR",
    timezone: "Asia/Seoul",
    acceptedHttpRequestId: "http-1",
    dedupeKey: "dedupe-1",
    promptRef: `request_ref_${requestId}`,
    redactedPreview: "preview",
    createdAt: now,
  });
  await runRepository.create({
    runId,
    traceId,
    requestId,
    documentId: "document-1",
    pageId: "page-1",
    status: options.status ?? "planning_queued",
    statusReasonCode: null,
    attemptSeq,
    queueJobId,
    requestRef: `request_ref_${requestId}`,
    snapshotRef: `snapshot_ref_${runId}`,
    deadlineAt: new Date(Date.now() + 60000).toISOString(),
    lastAckedSeq: options.lastAckedSeq ?? 0,
    pageLockToken: "page-lock-1",
    cancelRequestedAt:
      options.status === "cancel_requested" ? new Date().toISOString() : null,
    createdAt: now,
    updatedAt: now,
  });
  await runAttemptRepository.create({
    attemptId: "attempt-1",
    runId,
    traceId,
    attemptSeq,
    retryOfAttemptSeq: null,
    queueJobId,
    acceptedHttpRequestId: "http-1",
    attemptState: "enqueued",
    statusReasonCode: null,
    workerId: null,
    startedAt: null,
    leaseRecognizedAt: options.leaseRecognizedAt ?? null,
    lastHeartbeatAt: null,
    createdAt: now,
  });

  return {
    runId,
    traceId,
    requestId,
    queueJobId,
    attemptSeq,
  };
}

test("RunWatchdogService keeps active QueueEvents as internal telemetry only", async () => {
  const db = createPgClient({
    connectionString: "postgres://localhost:5432/tooldi_agent_runtime_test",
  });
  await db.connect();

  try {
    const runRepository = new RunRepository(db);
    const runRequestRepository = new RunRequestRepository(db);
    const runAttemptRepository = new RunAttemptRepository(db);
    const logger = new RecordingLogger();
    const runEventService = new RecordingRunEventService();
    const finalizeRecovery = new RecordingFinalizeRecovery();
    const queue = new FakeRunQueueProducer();
    const service = new RunWatchdogService(
      runRepository,
      runAttemptRepository,
      runEventService,
      finalizeRecovery,
      queue,
      logger,
    );

    const seeded = await seedRun(runRepository, runRequestRepository, runAttemptRepository);

    await service.observeSignal({
      queueJobId: seeded.queueJobId,
      state: "active",
      occurredAt: new Date().toISOString(),
    });

    const run = await runRepository.findById(seeded.runId);
    assert.equal(run?.status, "planning_queued");
    assert.equal(runEventService.logs.length, 0);
    assert.equal(runEventService.failures.length, 0);
    assert.equal(
      logger.records.some((record) => record.message.includes("canonical dequeue still waits")),
      true,
    );
  } finally {
    await db.end();
  }
});

test("RunWatchdogService schedules delayed retry after pickup timeout", async () => {
  const db = createPgClient({
    connectionString: "postgres://localhost:5432/tooldi_agent_runtime_test",
  });
  await db.connect();

  try {
    const runRepository = new RunRepository(db);
    const runRequestRepository = new RunRequestRepository(db);
    const runAttemptRepository = new RunAttemptRepository(db);
    const logger = new RecordingLogger();
    const runEventService = new RecordingRunEventService();
    const finalizeRecovery = new RecordingFinalizeRecovery();
    const queue = new FakeRunQueueProducer();
    const service = new RunWatchdogService(
      runRepository,
      runAttemptRepository,
      runEventService,
      finalizeRecovery,
      queue,
      logger,
      {
        pickupTimeoutMs: 10,
        retryDelayMs: 1,
        maxQueueAttempts: 2,
        enqueueTimeoutMs: 10,
        finalizeGraceMs: 20,
      },
    );

    const seeded = await seedRun(runRepository, runRequestRepository, runAttemptRepository);
    service.trackEnqueuedAttempt(seeded);
    await new Promise((resolve) => setTimeout(resolve, 15));

    const run = await runRepository.findById(seeded.runId);
    const attempts = await runAttemptRepository.findByRunId(seeded.runId);
    const retryAttempt = attempts.find((attempt) => attempt.attemptSeq === 2);

    assert.equal(queue.enqueued.length, 1);
    assert.equal(queue.enqueued[0]?.delayMs, 1);
    assert.equal(queue.removedQueueJobIds.includes(seeded.queueJobId), true);
    assert.equal(run?.attemptSeq, 2);
    assert.equal(run?.status, "planning_queued");
    assert.equal(retryAttempt?.attemptState, "retry_waiting");
    assert.equal(retryAttempt?.retryOfAttemptSeq, 1);
    assert.equal(
      runEventService.logs.some((log) => log.message.includes("scheduled retry attempt 2")),
      true,
    );

    await service.close();
  } finally {
    await db.end();
  }
});

test("RunWatchdogService retries stalled attempt before first visible ack", async () => {
  const db = createPgClient({
    connectionString: "postgres://localhost:5432/tooldi_agent_runtime_test",
  });
  await db.connect();

  try {
    const runRepository = new RunRepository(db);
    const runRequestRepository = new RunRequestRepository(db);
    const runAttemptRepository = new RunAttemptRepository(db);
    const logger = new RecordingLogger();
    const runEventService = new RecordingRunEventService();
    const finalizeRecovery = new RecordingFinalizeRecovery();
    const queue = new FakeRunQueueProducer();
    const service = new RunWatchdogService(
      runRepository,
      runAttemptRepository,
      runEventService,
      finalizeRecovery,
      queue,
      logger,
      {
        pickupTimeoutMs: 1000,
        retryDelayMs: 1,
        maxQueueAttempts: 2,
        enqueueTimeoutMs: 10,
        finalizeGraceMs: 20,
      },
    );

    const seeded = await seedRun(runRepository, runRequestRepository, runAttemptRepository, {
      status: "planning",
      leaseRecognizedAt: new Date().toISOString(),
    });

    await service.observeSignal({
      queueJobId: seeded.queueJobId,
      state: "stalled",
      occurredAt: new Date().toISOString(),
    });

    const run = await runRepository.findById(seeded.runId);
    const attempts = await runAttemptRepository.findByRunId(seeded.runId);
    assert.equal(run?.attemptSeq, 2);
    assert.equal(
      attempts.some((attempt) => attempt.attemptSeq === 2 && attempt.attemptState === "retry_waiting"),
      true,
    );

    await service.close();
  } finally {
    await db.end();
  }
});

test("RunWatchdogService refuses blind retry after visible ack", async () => {
  const db = createPgClient({
    connectionString: "postgres://localhost:5432/tooldi_agent_runtime_test",
  });
  await db.connect();

  try {
    const runRepository = new RunRepository(db);
    const runRequestRepository = new RunRequestRepository(db);
    const runAttemptRepository = new RunAttemptRepository(db);
    const logger = new RecordingLogger();
    const runEventService = new RecordingRunEventService();
    const finalizeRecovery = new RecordingFinalizeRecovery();
    const queue = new FakeRunQueueProducer();
    const service = new RunWatchdogService(
      runRepository,
      runAttemptRepository,
      runEventService,
      finalizeRecovery,
      queue,
      logger,
    );

    const seeded = await seedRun(runRepository, runRequestRepository, runAttemptRepository, {
      status: "planning",
      lastAckedSeq: 1,
      leaseRecognizedAt: new Date().toISOString(),
    });

    await service.observeSignal({
      queueJobId: seeded.queueJobId,
      state: "failed",
      occurredAt: new Date().toISOString(),
      failedReason: "worker crashed",
    });

    const run = await runRepository.findById(seeded.runId);
    const attempts = await runAttemptRepository.findByRunId(seeded.runId);
    assert.equal(run?.status, "failed");
    assert.equal(run?.statusReasonCode, "resume_not_supported_after_visible_ack");
    assert.equal(queue.enqueued.length, 0);
    assert.equal(
      attempts.find((attempt) => attempt.attemptSeq === 1)?.statusReasonCode,
      "resume_not_supported_after_visible_ack",
    );
    assert.equal(runEventService.failures[0]?.code, "resume_not_supported_after_visible_ack");

    await service.close();
  } finally {
    await db.end();
  }
});

test("RunWatchdogService closes queued cancel before worker pickup", async () => {
  const db = createPgClient({
    connectionString: "postgres://localhost:5432/tooldi_agent_runtime_test",
  });
  await db.connect();

  try {
    const runRepository = new RunRepository(db);
    const runRequestRepository = new RunRequestRepository(db);
    const runAttemptRepository = new RunAttemptRepository(db);
    const logger = new RecordingLogger();
    const runEventService = new RecordingRunEventService();
    const finalizeRecovery = new RecordingFinalizeRecovery();
    const queue = new FakeRunQueueProducer();
    const service = new RunWatchdogService(
      runRepository,
      runAttemptRepository,
      runEventService,
      finalizeRecovery,
      queue,
      logger,
    );

    const seeded = await seedRun(runRepository, runRequestRepository, runAttemptRepository, {
      status: "cancel_requested",
    });

    await service.handleCancelRequested(seeded.runId, seeded.traceId);

    const run = await runRepository.findById(seeded.runId);
    const attempt = await runAttemptRepository.findByRunIdAndAttemptSeq(seeded.runId, 1);
    assert.equal(run?.status, "cancelled");
    assert.equal(run?.statusReasonCode, "cancelled_before_worker_pickup");
    assert.equal(attempt?.attemptState, "cancelled");
    assert.equal(queue.removedQueueJobIds.includes(seeded.queueJobId), true);
    assert.equal(runEventService.cancellations.length, 1);

    await service.close();
  } finally {
    await db.end();
  }
});

test("RunWatchdogService terminally closes queued cancel even when remove misses after proofless failure", async () => {
  const db = createPgClient({
    connectionString: "postgres://localhost:5432/tooldi_agent_runtime_test",
  });
  await db.connect();

  try {
    const runRepository = new RunRepository(db);
    const runRequestRepository = new RunRequestRepository(db);
    const runAttemptRepository = new RunAttemptRepository(db);
    const logger = new RecordingLogger();
    const runEventService = new RecordingRunEventService();
    const finalizeRecovery = new RecordingFinalizeRecovery();
    const queue = new FakeRunQueueProducer();
    queue.removeShouldSucceed = false;
    const service = new RunWatchdogService(
      runRepository,
      runAttemptRepository,
      runEventService,
      finalizeRecovery,
      queue,
      logger,
    );

    const seeded = await seedRun(runRepository, runRequestRepository, runAttemptRepository, {
      status: "cancel_requested",
    });

    await service.observeSignal({
      queueJobId: seeded.queueJobId,
      state: "failed",
      occurredAt: new Date().toISOString(),
      failedReason: "transport already moved out of queue",
    });

    const run = await runRepository.findById(seeded.runId);
    const attempt = await runAttemptRepository.findByRunIdAndAttemptSeq(seeded.runId, 1);
    assert.equal(run?.status, "cancelled");
    assert.equal(run?.statusReasonCode, "cancelled_before_worker_proof_after_transport_failure");
    assert.equal(attempt?.attemptState, "cancelled");
    assert.equal(runEventService.cancellations.length, 1);

    await service.close();
  } finally {
    await db.end();
  }
});

test("RunWatchdogService closes retry enqueue timeout as terminal failure", async () => {
  const db = createPgClient({
    connectionString: "postgres://localhost:5432/tooldi_agent_runtime_test",
  });
  await db.connect();

  try {
    const runRepository = new RunRepository(db);
    const runRequestRepository = new RunRequestRepository(db);
    const runAttemptRepository = new RunAttemptRepository(db);
    const logger = new RecordingLogger();
    const runEventService = new RecordingRunEventService();
    const finalizeRecovery = new RecordingFinalizeRecovery();
    const queue = new FakeRunQueueProducer();
    queue.enqueueError = new RunQueueEnqueueTimeoutError("retry enqueue timed out");
    const service = new RunWatchdogService(
      runRepository,
      runAttemptRepository,
      runEventService,
      finalizeRecovery,
      queue,
      logger,
      {
        pickupTimeoutMs: 1000,
        retryDelayMs: 1,
        maxQueueAttempts: 2,
        enqueueTimeoutMs: 10,
        finalizeGraceMs: 20,
      },
    );

    const seeded = await seedRun(runRepository, runRequestRepository, runAttemptRepository, {
      status: "planning",
      leaseRecognizedAt: new Date().toISOString(),
    });

    await service.observeSignal({
      queueJobId: seeded.queueJobId,
      state: "stalled",
      occurredAt: new Date().toISOString(),
    });

    const run = await runRepository.findById(seeded.runId);
    assert.equal(run?.status, "failed");
    assert.equal(run?.statusReasonCode, "enqueue_timeout");
    assert.equal(runEventService.failures[0]?.code, "enqueue_timeout");
    assert.equal(queue.enqueued.length, 0);

    await service.close();
  } finally {
    await db.end();
  }
});

test("RunWatchdogService synthesizes terminal recovery when finalize callback is missing after completed signal", async () => {
  const db = createPgClient({
    connectionString: "postgres://localhost:5432/tooldi_agent_runtime_test",
  });
  await db.connect();

  try {
    const runRepository = new RunRepository(db);
    const runRequestRepository = new RunRequestRepository(db);
    const runAttemptRepository = new RunAttemptRepository(db);
    const logger = new RecordingLogger();
    const runEventService = new RecordingRunEventService();
    const finalizeRecovery = new RecordingFinalizeRecovery();
    const queue = new FakeRunQueueProducer();
    const service = new RunWatchdogService(
      runRepository,
      runAttemptRepository,
      runEventService,
      finalizeRecovery,
      queue,
      logger,
      {
        pickupTimeoutMs: 1000,
        retryDelayMs: 1,
        maxQueueAttempts: 2,
        enqueueTimeoutMs: 10,
        finalizeGraceMs: 5,
      },
    );

    const seeded = await seedRun(runRepository, runRequestRepository, runAttemptRepository, {
      status: "planning",
      lastAckedSeq: 1,
      leaseRecognizedAt: new Date().toISOString(),
    });

    await service.observeSignal({
      queueJobId: seeded.queueJobId,
      state: "completed",
      occurredAt: new Date().toISOString(),
    });

    await new Promise((resolve) => setTimeout(resolve, 15));

    assert.equal(finalizeRecovery.calls.length, 1);
    assert.equal(finalizeRecovery.calls[0]?.result.finalStatus, "save_failed_after_apply");

    await service.close();
  } finally {
    await db.end();
  }
});
