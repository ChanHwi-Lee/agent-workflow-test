import type {
  RunAccepted,
  RunJobEnvelope,
  StartAgentWorkflowRunRequest,
} from "@tooldi/agent-contracts";
import type { Logger } from "@tooldi/agent-observability";
import {
  getRequestObjectKey,
  getSnapshotObjectKey,
  type ObjectStoreClient,
} from "@tooldi/agent-persistence";

import {
  isTerminalRunStatus,
  type RunStatus,
} from "@tooldi/agent-domain";

import {
  createAttemptId,
  createCancelToken,
  createHttpRequestId,
  createPageLockToken,
  createQueueJobId,
  createRequestId,
  createRequestObjectRef,
  createRunId,
  createSnapshotRef,
  createTraceId,
} from "../lib/ids.js";
import { ValidationError } from "../lib/errors.js";
import { addMilliseconds, now, toIsoDateTime } from "../lib/time.js";
import {
  RunQueueEnqueueTimeoutError,
  type RunQueueProducer,
} from "../plugins/queue.js";
import type { RunAttemptRepository } from "../repositories/runAttemptRepository.js";
import type { RunRepository } from "../repositories/runRepository.js";
import type { RunRequestRepository } from "../repositories/runRequestRepository.js";
import type { RunEventService } from "./runEventService.js";
import type { RunWatchdogService } from "./runWatchdogService.js";

export interface StartRunCommand {
  httpRequestId?: string;
  request: StartAgentWorkflowRunRequest;
  publicBaseUrl: string;
}

export class RunBootstrapService {
  constructor(
    private readonly runRequestRepository: RunRequestRepository,
    private readonly runRepository: RunRepository,
    private readonly runAttemptRepository: RunAttemptRepository,
    private readonly runEventService: RunEventService,
    private readonly objectStore: ObjectStoreClient,
    private readonly runQueue: RunQueueProducer,
    private readonly runWatchdogService: RunWatchdogService,
    private readonly logger: Logger,
  ) {}

  private static readonly ENQUEUE_TIMEOUT_MS = 2000;

  async startRun(command: StartRunCommand): Promise<RunAccepted> {
    this.assertCreateFromEmptyCanvasPolicy(command.request);

    const startedAt = now();
    const deadlineAt = addMilliseconds(
      startedAt,
      command.request.runPolicy.timeBudgetMs,
    );

    const requestId = createRequestId();
    const runId = createRunId();
    const traceId = createTraceId();
    const attemptId = createAttemptId();
    const attemptSeq = 1;
    const queueJobId = createQueueJobId({ runId, attemptSeq });
    const httpRequestId = command.httpRequestId ?? createHttpRequestId();
    const pageLockToken = createPageLockToken(
      runId,
      command.request.editorContext.pageId,
    );
    const cancelToken = createCancelToken(runId);
    const dedupeKey = this.buildDedupeKey(command.request);
    const requestRef = await this.writeRequestObject(
      requestId,
      command.request,
      traceId,
    );
    const snapshotRef = await this.writeSnapshotObject(runId, command.request);

    const existing = await this.runRequestRepository.findByDedupeKey(dedupeKey);
    if (existing) {
      const existingRun = await this.runRepository.findById(existing.runId);
      if (existingRun && !isTerminalRunStatus(existingRun.status)) {
        this.logger.warn("Dedupe placeholder reusing non-terminal run", {
          requestId: existing.requestId,
          runId: existing.runId,
          dedupeKey,
        });
        return this.buildAcceptedResponse(
          existing.runId,
          existing.traceId,
          existing.createdAt,
          existingRun.deadlineAt,
          command.publicBaseUrl,
        );
      }
    }

    await this.runRequestRepository.create({
      requestId,
      clientRequestId: command.request.clientRequestId,
      editorSessionId: command.request.editorSessionId,
      runId,
      traceId,
      surface: command.request.surface,
      normalizedPrompt: command.request.userInput.prompt,
      locale: command.request.userInput.locale,
      timezone: command.request.userInput.timezone,
      acceptedHttpRequestId: httpRequestId,
      dedupeKey,
      promptRef: requestRef,
      redactedPreview: command.request.userInput.prompt.slice(0, 80),
      createdAt: toIsoDateTime(startedAt),
    });

    const initialStatus: RunStatus = "enqueue_pending";
    await this.runRepository.create({
      runId,
      traceId,
      requestId,
      documentId: command.request.editorContext.documentId,
      pageId: command.request.editorContext.pageId,
      status: initialStatus,
      statusReasonCode: null,
      attemptSeq: 0,
      queueJobId: null,
      requestRef,
      snapshotRef,
      deadlineAt: toIsoDateTime(deadlineAt),
      lastAckedSeq: 0,
      pageLockToken,
      cancelRequestedAt: null,
      createdAt: toIsoDateTime(startedAt),
      updatedAt: toIsoDateTime(startedAt),
    });

    const runJob: RunJobEnvelope = {
      messageVersion: "v1",
      runId,
      traceId,
      queueJobId,
      attemptSeq,
      priority: "interactive",
      requestRef,
      snapshotRef,
      deadlineAt: toIsoDateTime(deadlineAt),
      pageLockToken,
      cancelToken,
    };
    try {
      await this.runQueue.enqueueRunJob(runJob, {
        timeoutMs: RunBootstrapService.ENQUEUE_TIMEOUT_MS,
      });
    } catch (error) {
      const reasonCode =
        error instanceof RunQueueEnqueueTimeoutError
          ? "enqueue_timeout"
          : "queue_publish_failed";
      const message =
        error instanceof Error
          ? error.message
          : "Queue publish failed before worker handoff";
      await this.runRepository.updateStatus(runId, "failed", reasonCode);
      await this.runEventService.appendFailed(
        runId,
        traceId,
        {
          code: reasonCode,
          message,
        },
        toIsoDateTime(now()),
      );
      this.logger.error("Failed to enqueue run before worker handoff", {
        runId,
        traceId,
        reasonCode,
        error: message,
      });
      throw error;
    }

    await this.runAttemptRepository.create({
      attemptId,
      runId,
      traceId,
      attemptSeq,
      retryOfAttemptSeq: null,
      queueJobId,
      acceptedHttpRequestId: httpRequestId,
      attemptState: "enqueued",
      statusReasonCode: null,
      workerId: null,
      startedAt: null,
      leaseRecognizedAt: null,
      lastHeartbeatAt: null,
      createdAt: toIsoDateTime(startedAt),
    });
    await this.runRepository.activateAttempt(
      runId,
      attemptSeq,
      queueJobId,
      "planning_queued",
    );
    this.runWatchdogService.trackEnqueuedAttempt({
      runId,
      traceId,
      attemptSeq,
      queueJobId,
    });

    await this.runEventService.appendAccepted(runId, traceId, toIsoDateTime(startedAt));
    await this.runEventService.appendPhase(
      runId,
      traceId,
      "queued",
      "Run accepted and enqueued for worker pickup",
      toIsoDateTime(startedAt),
    );

    return this.buildAcceptedResponse(
      runId,
      traceId,
      toIsoDateTime(startedAt),
      toIsoDateTime(deadlineAt),
      command.publicBaseUrl,
    );
  }

  private assertCreateFromEmptyCanvasPolicy(
    request: StartAgentWorkflowRunRequest,
  ): void {
    if (request.editorContext.canvasState !== "empty") {
      throw new ValidationError("v1 agent workflow only supports empty canvas bootstrap");
    }
    if (request.runPolicy.mode !== "live_commit") {
      throw new ValidationError("v1 runPolicy.mode must be live_commit");
    }
  }

  private buildDedupeKey(request: StartAgentWorkflowRunRequest): string {
    return [
      request.editorSessionId,
      "create_from_empty_canvas",
      request.editorContext.documentId,
      request.editorContext.pageId,
      request.clientRequestId,
    ].join(":");
  }

  private async writeRequestObject(
    requestId: string,
    request: StartAgentWorkflowRunRequest,
    traceId: string,
  ): Promise<string> {
    const ref = createRequestObjectRef(requestId);
    await this.objectStore.putObject({
      key: getRequestObjectKey(requestId),
      body: JSON.stringify(request),
      contentType: "application/json",
      metadata: {
        ref,
        traceId,
      },
    });
    return ref;
  }

  private async writeSnapshotObject(
    runId: string,
    request: StartAgentWorkflowRunRequest,
  ): Promise<string> {
    const ref = createSnapshotRef(runId);
    await this.objectStore.putObject({
      key: getSnapshotObjectKey(runId),
      body: JSON.stringify({
        editorContext: request.editorContext,
        brandContext: request.brandContext,
        referenceAssets: request.referenceAssets,
        runPolicy: request.runPolicy,
      }),
      contentType: "application/json",
      metadata: {
        ref,
      },
    });
    return ref;
  }

  private buildAcceptedResponse(
    runId: string,
    traceId: string,
    startedAt: string,
    deadlineAt: string,
    publicBaseUrl: string,
  ): RunAccepted {
    const root = `${publicBaseUrl}/api/agent-workflow/runs/${runId}`;
    return {
      runId,
      traceId,
      status: "queued",
      startedAt,
      deadlineAt,
      streamUrl: `${root}/events`,
      cancelUrl: `${root}/cancel`,
      mutationAckUrl: `${root}/mutation-acks`,
    };
  }
}
