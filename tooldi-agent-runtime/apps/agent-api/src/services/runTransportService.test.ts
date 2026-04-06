import assert from "node:assert/strict";
import test from "node:test";

import { createPgClient } from "@tooldi/agent-persistence";
import type { Logger } from "@tooldi/agent-observability";

import { RunAttemptRepository } from "../repositories/runAttemptRepository.js";
import { RunRepository } from "../repositories/runRepository.js";
import { RunTransportService } from "./runTransportService.js";

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

test("RunTransportService keeps QueueEvents as internal telemetry only", async () => {
  const db = createPgClient({
    connectionString: "postgres://localhost:5432/tooldi_agent_runtime_test",
  });
  await db.connect();

  try {
    const runRepository = new RunRepository(db);
    const runAttemptRepository = new RunAttemptRepository(db);
    const logger = new RecordingLogger();
    const service = new RunTransportService(
      runRepository,
      runAttemptRepository,
      logger,
    );

    await runRepository.create({
      runId: "run-1",
      traceId: "trace-1",
      requestId: "req-1",
      documentId: "document-1",
      pageId: "page-1",
      status: "planning_queued",
      attemptSeq: 1,
      queueJobId: "run-1__attempt_1",
      deadlineAt: new Date(Date.now() + 30000).toISOString(),
      pageLockToken: "page-lock-1",
      cancelRequestedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await runAttemptRepository.create({
      attemptId: "attempt-1",
      runId: "run-1",
      traceId: "trace-1",
      attemptSeq: 1,
      queueJobId: "run-1__attempt_1",
      acceptedHttpRequestId: "http-1",
      attemptState: "enqueued",
      workerId: null,
      lastHeartbeatAt: null,
      createdAt: new Date().toISOString(),
    });

    await service.observeSignal({
      queueJobId: "run-1__attempt_1",
      state: "active",
      occurredAt: new Date().toISOString(),
    });

    assert.equal(
      logger.records.some(
        (record) =>
          record.level === "info" &&
          record.message.includes("canonical dequeue still waits"),
      ),
      true,
    );
    assert.equal(
      logger.records.some(
        (record) =>
          record.message.includes("Appended public run event") ||
          record.message.includes("run.log"),
      ),
      false,
    );
  } finally {
    await db.end();
  }
});
