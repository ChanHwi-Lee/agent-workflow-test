import assert from "node:assert/strict";
import test from "node:test";

import { createObjectStoreClient, createPgClient } from "@tooldi/agent-persistence";
import type { Logger } from "@tooldi/agent-observability";
import type { StartAgentWorkflowRunRequest } from "@tooldi/agent-contracts";

import { RunQueueEnqueueTimeoutError, type EnqueuedRunJob, type QueueTransportObserver, type RunQueueProducer } from "../plugins/queue.js";
import { RunAttemptRepository } from "../repositories/runAttemptRepository.js";
import { RunEventRepository } from "../repositories/runEventRepository.js";
import { RunRepository } from "../repositories/runRepository.js";
import { RunRequestRepository } from "../repositories/runRequestRepository.js";
import { RunBootstrapService } from "./runBootstrapService.js";
import { RunEventService } from "./runEventService.js";
import { RunWatchdogService } from "./runWatchdogService.js";

class RecordingLogger implements Logger {
  readonly level = "debug" as const;

  child(_bindings: Record<string, unknown>): Logger {
    return this;
  }

  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class FailingRunQueueProducer implements RunQueueProducer {
  constructor(private readonly error: Error) {}

  async enqueueRunJob(): Promise<EnqueuedRunJob> {
    throw this.error;
  }

  async listJobs(): Promise<readonly EnqueuedRunJob[]> {
    return [];
  }

  async tryRemoveQueuedJob(): Promise<boolean> {
    return false;
  }

  observeTransport(_observer: QueueTransportObserver): () => void {
    return () => {};
  }

  async close(): Promise<void> {}
}

class RecordingFinalizeRecovery {
  async finalizeRun(): Promise<{ accepted: true; runStatus: "failed" }> {
    return {
      accepted: true,
      runStatus: "failed",
    };
  }
}

class SilentSseHub {
  async publish(): Promise<number> {
    return 0;
  }

  async getBufferedEvents(): Promise<[]> {
    return [];
  }

  subscribe(): () => void {
    return () => {};
  }
}

function createRequest(): StartAgentWorkflowRunRequest {
  return {
    clientRequestId: "client-request-1",
    editorSessionId: "editor-session-1",
    surface: "toolditor",
    userInput: {
      prompt: "봄 세일 배너를 만들어줘",
      locale: "ko-KR",
      timezone: "Asia/Seoul",
    },
    editorContext: {
      documentId: "document-1",
      pageId: "page-1",
      canvasState: "empty",
      canvasWidth: 1080,
      canvasHeight: 1080,
      sizeSerial: "1080x1080@1",
      workingTemplateCode: null,
      canvasSnapshotRef: null,
      selectedLayerIds: [],
    },
    brandContext: {
      brandName: null,
      palette: [],
      logoAssetId: null,
    },
    referenceAssets: [],
    runPolicy: {
      mode: "live_commit",
      approvalMode: "none",
      timeBudgetMs: 120000,
      milestoneTargetsMs: {
        firstVisible: 1000,
        editableMinimum: 3000,
        saveStarted: 5000,
      },
      milestoneDeadlinesMs: {
        planValidated: 1000,
        firstVisible: 2000,
        editableMinimum: 5000,
        mutationCutoff: 10000,
        hardDeadline: 120000,
      },
      requestedOutputCount: 1,
      allowInternalAiPrimitives: true,
    },
    clientInfo: {
      pagePath: "/editor",
      viewportWidth: 1440,
      viewportHeight: 900,
    },
  };
}

test("RunBootstrapService closes initial queue publish failure without creating an attempt", async () => {
  const db = createPgClient({
    connectionString: "postgres://localhost:5432/tooldi_agent_runtime_test",
  });
  await db.connect();

  try {
    const runRequestRepository = new RunRequestRepository(db);
    const runRepository = new RunRepository(db);
    const runAttemptRepository = new RunAttemptRepository(db);
    const runEventRepository = new RunEventRepository(db);
    const logger = new RecordingLogger();
    const runEventService = new RunEventService(
      runEventRepository,
      new SilentSseHub(),
      logger,
    );
    const runQueue = new FailingRunQueueProducer(new RunQueueEnqueueTimeoutError("initial enqueue timed out"));
    const watchdog = new RunWatchdogService(
      runRepository,
      runAttemptRepository,
      runEventService,
      new RecordingFinalizeRecovery(),
      runQueue,
      logger,
    );
    const service = new RunBootstrapService(
      runRequestRepository,
      runRepository,
      runAttemptRepository,
      runEventService,
      createObjectStoreClient({ bucket: "bootstrap-test" }),
      runQueue,
      watchdog,
      logger,
    );
    const request = createRequest();

    await assert.rejects(
      service.startRun({
        request,
        publicBaseUrl: "http://127.0.0.1:3000",
      }),
      /initial enqueue timed out/,
    );

    const dedupeKey = [
      request.editorSessionId,
      "create_from_empty_canvas",
      request.editorContext.documentId,
      request.editorContext.pageId,
      request.clientRequestId,
    ].join(":");
    const storedRequest = await runRequestRepository.findByDedupeKey(dedupeKey);
    assert.ok(storedRequest);

    const run = await runRepository.findById(storedRequest.runId);
    assert.equal(run?.status, "failed");
    assert.equal(run?.statusReasonCode, "enqueue_timeout");
    const attempts = await runAttemptRepository.findByRunId(storedRequest.runId);
    assert.equal(attempts.length, 0);

    const events = await runEventService.listAfter(storedRequest.runId);
    assert.equal(events.some((event) => event.event.type === "run.failed"), true);

    await watchdog.close();
  } finally {
    await db.end();
  }
});
