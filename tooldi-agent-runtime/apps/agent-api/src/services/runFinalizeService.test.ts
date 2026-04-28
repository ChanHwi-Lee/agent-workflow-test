import assert from "node:assert/strict";
import test from "node:test";

import type {
  MutationApplyAckRequest,
  RunFinalizeRequest,
} from "@tooldi/agent-contracts";
import {
  createObjectStoreClient,
  createPgClient,
  resetAgentRuntimeData,
} from "@tooldi/agent-persistence";
import type { Logger } from "@tooldi/agent-observability";

import { CompletionRepository } from "../repositories/completionRepository.js";
import { CostSummaryRepository } from "../repositories/costSummaryRepository.js";
import { DraftBundleRepository } from "../repositories/draftBundleRepository.js";
import { MutationLedgerRepository } from "../repositories/mutationLedgerRepository.js";
import { RunAttemptRepository } from "../repositories/runAttemptRepository.js";
import { RunRepository } from "../repositories/runRepository.js";
import { RunEventService } from "./runEventService.js";
import { normalizeFinalizeInput } from "./runFinalizeInput.js";
import { RunFinalizeService } from "./runFinalizeService.js";

const DEFAULT_TEST_POSTGRES_URL =
  process.env.POSTGRES_URL ??
  "postgres://postgres:postgres@127.0.0.1:55432/tooldi_agent_runtime_test";

class RecordingLogger implements Logger {
  readonly level = "debug" as const;

  child(): Logger {
    return this;
  }

  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class SilentSseHub {
  async publish(): Promise<void> {}
}

class InMemoryRunEventRepository {
  readonly records: Array<{ eventId: string; event: unknown }> = [];

  async append(event: unknown) {
    const stored = {
      eventId: String(this.records.length + 1),
      event,
    };
    this.records.push(stored);
    return stored;
  }

  async listAfter() {
    return this.records;
  }
}

async function createTestDb() {
  const db = createPgClient({
    connectionString: DEFAULT_TEST_POSTGRES_URL,
  });
  await db.connect();
  await resetAgentRuntimeData(db);
  return db;
}

function createFinalizeRequest(overrides: Partial<RunFinalizeRequest> = {}): RunFinalizeRequest {
  return {
    traceId: "trace-1",
    attempt: 1,
    queueJobId: "run-1__attempt_1",
    finalStatus: "completed",
    completionState: "editable_draft_ready",
    draftId: "draft_run-1",
    finalRevision: 1,
    lastAckedSeq: 1,
    latestSaveEvidence: {
      code: "template_draft_run-1",
      serial: 198008,
      modified: "2026-04-10T02:42:19.000Z",
      version: "2",
    },
    latestSaveReceipt: {
      saveReceiptId: "save-receipt-1",
      outputTemplateCode: "template_draft_run-1",
      savedRevision: 1,
      savedAt: "2026-04-10T02:42:19.000Z",
      reason: "run_completed",
    },
    outputTemplateCode: "template_draft_run-1",
    canonicalDesignBriefRef: "runs/run-1/attempts/1/canonical-design-brief.json",
    templatePriorSummaryRef: "runs/run-1/attempts/1/template-prior-summary.json",
    searchProfileRef: "runs/run-1/attempts/1/search-profile.json",
    executablePlanRef: "runs/run-1/attempts/1/executable-plan.json",
    candidateSetRef: "runs/run-1/attempts/1/template-candidate-set.json",
    sourceSearchSummaryRef: "runs/run-1/attempts/1/source-search-summary.json",
    retrievalStageRef: "runs/run-1/attempts/1/retrieval-stage.json",
    selectionDecisionRef: "runs/run-1/attempts/1/selection-decision.json",
    typographyDecisionRef: "runs/run-1/attempts/1/typography-decision.json",
    ruleJudgeVerdictRef: "runs/run-1/attempts/1/rule-judge-verdict.json",
    executionSceneSummaryRef: "runs/run-1/attempts/1/execution-scene-summary.json",
    judgePlanRef: "runs/run-1/attempts/1/judge-plan.json",
    refineDecisionRef: "runs/run-1/attempts/1/refine-decision.json",
    sourceMutationRange: {
      firstSeq: 1,
      lastSeq: 1,
      reconciledThroughSeq: 1,
    },
    createdLayerIds: ["layer-1"],
    updatedLayerIds: [],
    deletedLayerIds: [],
    fallbackCount: 0,
    ...overrides,
  };
}

test("RunFinalizeService materializes bundle and completion chain for completed happy-path", async () => {
  const db = await createTestDb();

  try {
    const runRepository = new RunRepository(db);
    const runAttemptRepository = new RunAttemptRepository(db);
    const mutationLedgerRepository = new MutationLedgerRepository(db);
    const costSummaryRepository = new CostSummaryRepository(db);
    const draftBundleRepository = new DraftBundleRepository(db);
    const completionRepository = new CompletionRepository(db);
    const runEventService = new RunEventService(
      new InMemoryRunEventRepository() as never,
      new SilentSseHub() as never,
      new RecordingLogger(),
    );
    const objectStore = createObjectStoreClient({
      bucket: "finalize-service-test",
      mode: "memory",
    });
    const service = new RunFinalizeService(
      runRepository,
      runAttemptRepository,
      mutationLedgerRepository,
      costSummaryRepository,
      draftBundleRepository,
      completionRepository,
      objectStore,
      runEventService,
      new RecordingLogger(),
    );

    const now = new Date().toISOString();
    await runRepository.create({
      runId: "run-1",
      traceId: "trace-1",
      requestId: "request-1",
      documentId: "document-1",
      pageId: "page-1",
      status: "finalizing",
      statusReasonCode: null,
      attemptSeq: 1,
      queueJobId: "run-1__attempt_1",
      requestRef: "request_ref_request-1",
      snapshotRef: "snapshot_ref_run-1",
      deadlineAt: new Date(Date.now() + 60000).toISOString(),
      lastAckedSeq: 1,
      pageLockToken: "page-lock-1",
      cancelRequestedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await runAttemptRepository.create({
      attemptId: "attempt-1",
      runId: "run-1",
      traceId: "trace-1",
      attemptSeq: 1,
      retryOfAttemptSeq: null,
      queueJobId: "run-1__attempt_1",
      acceptedHttpRequestId: "http-1",
      attemptState: "finalizing",
      statusReasonCode: null,
      workerId: "worker-1",
      startedAt: now,
      leaseRecognizedAt: now,
      lastHeartbeatAt: now,
      createdAt: now,
    });

    await mutationLedgerRepository.recordProposal({
      runId: "run-1",
      traceId: "trace-1",
      attemptSeq: 1,
      queueJobId: "run-1__attempt_1",
      event: {
        type: "mutation.proposed",
        mutationId: "mutation-1",
        rollbackGroupId: "plan-step-1",
        expectedBaseRevision: 0,
        mutation: {
          mutationId: "mutation-1",
          mutationVersion: "v1",
          traceId: "trace-1",
          runId: "run-1",
          draftId: "draft_run-1",
          documentId: "document-1",
          pageId: "page-1",
          seq: 1,
          commitGroup: "plan-step-1",
          idempotencyKey: "mutation-1",
          expectedBaseRevision: 0,
          ownershipScope: "draft_only",
          commands: [
            {
              commandId: "command-background",
              op: "createLayer",
              executionSlotKey: "background",
              clientLayerKey: "background-layer",
              targetRef: {
                layerId: null,
                clientLayerKey: "background-layer",
              },
              targetLayerVersion: null,
              parentRef: { position: "append" },
              expectedLayerType: null,
              allowNoop: false,
              metadataTags: {},
              layerBlueprint: {
                layerType: "shape",
                bounds: { x: 0, y: 0, width: 1080, height: 1080 },
                metadata: {},
              },
              editable: true,
            },
            {
              commandId: "command-headline",
              op: "createLayer",
              executionSlotKey: "headline",
              clientLayerKey: "headline-layer",
              targetRef: {
                layerId: null,
                clientLayerKey: "headline-layer",
              },
              targetLayerVersion: null,
              parentRef: { position: "append" },
              expectedLayerType: null,
              allowNoop: false,
              metadataTags: {},
              layerBlueprint: {
                layerType: "text",
                bounds: { x: 80, y: 120, width: 720, height: 140 },
                metadata: {},
              },
              editable: true,
            },
            {
              commandId: "command-supporting",
              op: "createLayer",
              executionSlotKey: "subheadline",
              clientLayerKey: "supporting-layer",
              targetRef: {
                layerId: null,
                clientLayerKey: "supporting-layer",
              },
              targetLayerVersion: null,
              parentRef: { position: "append" },
              expectedLayerType: null,
              allowNoop: false,
              metadataTags: {},
              layerBlueprint: {
                layerType: "text",
                bounds: { x: 80, y: 280, width: 720, height: 80 },
                metadata: {},
              },
              editable: true,
            },
            {
              commandId: "command-offer",
              op: "createLayer",
              executionSlotKey: "offer_line",
              clientLayerKey: "offer-layer",
              targetRef: {
                layerId: null,
                clientLayerKey: "offer-layer",
              },
              targetLayerVersion: null,
              parentRef: { position: "append" },
              expectedLayerType: null,
              allowNoop: false,
              metadataTags: {},
              layerBlueprint: {
                layerType: "text",
                bounds: { x: 80, y: 360, width: 320, height: 48 },
                metadata: {
                  role: "price_callout",
                },
              },
              editable: true,
            },
            {
              commandId: "command-cta",
              op: "createLayer",
              executionSlotKey: "cta",
              clientLayerKey: "cta-layer",
              targetRef: {
                layerId: null,
                clientLayerKey: "cta-layer",
              },
              targetLayerVersion: null,
              parentRef: { position: "append" },
              expectedLayerType: null,
              allowNoop: false,
              metadataTags: {},
              layerBlueprint: {
                layerType: "group",
                bounds: { x: 80, y: 420, width: 200, height: 72 },
                metadata: {},
              },
              editable: true,
            },
            {
              commandId: "command-footer",
              op: "createLayer",
              executionSlotKey: "footer_note",
              clientLayerKey: "footer-layer",
              targetRef: {
                layerId: null,
                clientLayerKey: "footer-layer",
              },
              targetLayerVersion: null,
              parentRef: { position: "append" },
              expectedLayerType: null,
              allowNoop: false,
              metadataTags: {},
              layerBlueprint: {
                layerType: "text",
                bounds: { x: 80, y: 540, width: 360, height: 24 },
                metadata: {
                  role: "footer_note",
                },
              },
              editable: true,
            },
            {
              commandId: "command-hero-image",
              op: "createLayer",
              executionSlotKey: "hero_image",
              clientLayerKey: "hero-image-layer",
              targetRef: {
                layerId: null,
                clientLayerKey: "hero-image-layer",
              },
              targetLayerVersion: null,
              parentRef: { position: "append" },
              expectedLayerType: null,
              allowNoop: false,
              metadataTags: {},
              layerBlueprint: {
                layerType: "image",
                bounds: { x: 700, y: 140, width: 260, height: 260 },
                metadata: {
                  role: "hero_image",
                  sourceOriginUrl: "https://cdn.tooldi.test/photo-33.jpg",
                  sourceWidth: 1600,
                  sourceHeight: 900,
                },
              },
              editable: true,
            },
            {
              commandId: "command-decoration",
              op: "createLayer",
              executionSlotKey: null,
              clientLayerKey: "decoration-layer",
              targetRef: {
                layerId: null,
                clientLayerKey: "decoration-layer",
              },
              targetLayerVersion: null,
              parentRef: { position: "append" },
              expectedLayerType: null,
              allowNoop: false,
              metadataTags: {},
              layerBlueprint: {
                layerType: "shape",
                bounds: { x: 860, y: 60, width: 140, height: 140 },
                metadata: {},
              },
              editable: true,
            },
          ],
          rollbackHint: {
            rollbackGroupId: "plan-step-1",
            strategy: "delete_created_layers",
          },
          emittedAt: now,
          deliveryDeadlineAt: new Date(Date.now() + 10000).toISOString(),
        },
      },
    });

    await mutationLedgerRepository.recordAck({
      runId: "run-1",
      traceId: "trace-1",
      mutationId: "mutation-1",
      seq: 1,
      status: "applied",
      targetPageId: "page-1",
      baseRevision: 0,
      resultingRevision: 1,
      resolvedLayerIds: {
        "background-layer": "background-layer",
        "headline-layer": "headline-layer",
        "supporting-layer": "supporting-layer",
        "offer-layer": "offer-layer",
        "cta-layer": "cta-layer",
        "footer-layer": "footer-layer",
        "hero-image-layer": "hero-image-layer",
        "decoration-layer": "decoration-layer",
      },
      commandResults: [
        {
          commandId: "command-headline",
          op: "createLayer",
          status: "applied",
          resolvedLayerId: "headline-layer",
        },
      ],
      clientObservedAt: now,
    } satisfies MutationApplyAckRequest);

    const request = createFinalizeRequest();
    const result = await service.finalizeRun({
      runId: "run-1",
      traceId: "trace-1",
      attemptSeq: 1,
      queueJobId: "run-1__attempt_1",
      result: {
        finalStatus: "completed",
        draftId: "draft_run-1",
        finalRevision: 1,
        durabilityState: "final_saved",
        latestSaveEvidence: {
          code: "template_draft_run-1",
          serial: 198008,
          modified: "2026-04-10T02:42:19.000Z",
          version: "2",
        },
        latestSaveReceiptId: null,
        warningCount: 0,
        fallbackCount: 0,
        warnings: [],
        errorSummary: null,
      },
      request,
      at: now,
    });

    assert.equal(result.runStatus, "completed");
    assert.equal(result.completionRecordRef, "completion_run-1");

    const storedRun = await runRepository.findById("run-1");
    assert.equal(storedRun?.finalArtifactRef, "bundle_run-1");
    assert.equal(storedRun?.completionRecordRef, "completion_run-1");

    const bundle = await draftBundleRepository.findByRunId("run-1");
    assert.ok(bundle);
    assert.equal(bundle.payload.saveMetadata.latestSaveEvidence?.code, "template_draft_run-1");
    assert.equal(bundle.payload.saveMetadata.latestSaveEvidence?.serial, 198008);
    assert.deepEqual(bundle.payload.saveMetadata.latestSaveReceipt, {
      saveReceiptId: "save-receipt-1",
      outputTemplateCode: "template_draft_run-1",
      savedRevision: 1,
      savedAt: "2026-04-10T02:42:19.000Z",
      reason: "run_completed",
    });
    assert.equal(bundle.payload.editableCanvasState.commitPayload.firstRenderableSeq, 1);
    assert.equal(bundle.payload.mutationLedger.lastKnownGoodCheckpointId, "checkpoint_run-1_latest_saved");
    assert.equal(
      bundle.payload.editableCanvasState.draftManifest.slotBindings.some(
        (binding) =>
          binding.executionSlotKey === "offer_line" &&
          binding.primaryLayerId === "offer-layer",
      ),
      true,
    );
    assert.equal(
      bundle.payload.mutationLedger.checkpoints[0]?.bundleSnapshot.slotStatuses.some(
        (status) =>
          status.executionSlotKey === "footer_note" &&
          status.primaryLayerId === "footer-layer",
      ),
      true,
    );
    assert.equal(
      bundle.payload.editableCanvasState.draftManifest.slotBindings.some(
        (binding) =>
          binding.executionSlotKey === "hero_image" &&
          binding.primaryLayerId === "hero-image-layer",
      ),
      true,
    );
    assert.equal(
      bundle.payload.mutationLedger.checkpoints[0]?.sourceRefs.executionSceneSummaryRef,
      "runs/run-1/attempts/1/execution-scene-summary.json",
    );
    assert.equal(
      bundle.payload.mutationLedger.checkpoints[0]?.sourceRefs.judgePlanRef,
      "runs/run-1/attempts/1/judge-plan.json",
    );
    assert.equal(
      bundle.payload.mutationLedger.checkpoints[0]?.sourceRefs.refineDecisionRef,
      "runs/run-1/attempts/1/refine-decision.json",
    );

    const completion = await completionRepository.findByRunId("run-1");
    assert.ok(completion);
    assert.equal(completion.completionRecordId, "completion_run-1");
    assert.equal(completion.latestSaveEvidence?.code, "template_draft_run-1");
    assert.equal(
      completion.sourceRefs.canonicalDesignBriefRef,
      "runs/run-1/attempts/1/canonical-design-brief.json",
    );
    assert.equal(
      completion.sourceRefs.templatePriorSummaryRef,
      "runs/run-1/attempts/1/template-prior-summary.json",
    );
    assert.equal(
      completion.sourceRefs.searchProfileRef,
      "runs/run-1/attempts/1/search-profile.json",
    );
    assert.equal(
      completion.sourceRefs.executablePlanRef,
      "runs/run-1/attempts/1/executable-plan.json",
    );
    assert.equal(
      completion.sourceRefs.candidateSetRef,
      "runs/run-1/attempts/1/template-candidate-set.json",
    );
    assert.equal(
      completion.sourceRefs.sourceSearchSummaryRef,
      "runs/run-1/attempts/1/source-search-summary.json",
    );
    assert.equal(
      completion.sourceRefs.retrievalStageRef,
      "runs/run-1/attempts/1/retrieval-stage.json",
    );
    assert.equal(
      completion.sourceRefs.selectionDecisionRef,
      "runs/run-1/attempts/1/selection-decision.json",
    );
    assert.equal(
      completion.sourceRefs.typographyDecisionRef,
      "runs/run-1/attempts/1/typography-decision.json",
    );
    assert.equal(
      completion.sourceRefs.ruleJudgeVerdictRef,
      "runs/run-1/attempts/1/rule-judge-verdict.json",
    );
    assert.equal(
      completion.sourceRefs.executionSceneSummaryRef,
      "runs/run-1/attempts/1/execution-scene-summary.json",
    );
    assert.equal(
      completion.sourceRefs.judgePlanRef,
      "runs/run-1/attempts/1/judge-plan.json",
    );
    assert.equal(
      completion.sourceRefs.refineDecisionRef,
      "runs/run-1/attempts/1/refine-decision.json",
    );
  } finally {
    await db.end();
  }
});

test("normalizeFinalizeInput downgrades completed runs when save receipt is missing", () => {
  const normalized = normalizeFinalizeInput({
    request: createFinalizeRequest({
      latestSaveReceipt: null,
    }),
    result: {
      finalStatus: "completed",
      draftId: "draft_run-1",
      finalRevision: 1,
      durabilityState: "final_saved",
      latestSaveEvidence: {
        code: "template_draft_run-1",
        serial: 198008,
        modified: "2026-04-10T02:42:19.000Z",
        version: "2",
      },
      latestSaveReceiptId: null,
      warningCount: 0,
      fallbackCount: 0,
      warnings: [],
      errorSummary: null,
    },
  });

  assert.equal(normalized.result.finalStatus, "save_failed_after_apply");
  assert.equal(normalized.result.durabilityState, "save_uncertain");
  assert.equal(normalized.result.latestSaveEvidence, null);
  assert.equal(normalized.result.latestSaveReceiptId, null);
  assert.equal(
    normalized.result.errorSummary?.code,
    "save_evidence_incomplete",
  );
});

test("RunFinalizeService accepts object-native completed runs without slotBindings", async () => {
  const db = await createTestDb();

  try {
    const runRepository = new RunRepository(db);
    const runAttemptRepository = new RunAttemptRepository(db);
    const mutationLedgerRepository = new MutationLedgerRepository(db);
    const costSummaryRepository = new CostSummaryRepository(db);
    const draftBundleRepository = new DraftBundleRepository(db);
    const completionRepository = new CompletionRepository(db);
    const runEventService = new RunEventService(
      new InMemoryRunEventRepository() as never,
      new SilentSseHub() as never,
      new RecordingLogger(),
    );
    const objectStore = createObjectStoreClient({
      bucket: "finalize-service-test-object-native",
      mode: "memory",
    });
    const service = new RunFinalizeService(
      runRepository,
      runAttemptRepository,
      mutationLedgerRepository,
      costSummaryRepository,
      draftBundleRepository,
      completionRepository,
      objectStore,
      runEventService,
      new RecordingLogger(),
    );

    const now = new Date().toISOString();
    await runRepository.create({
      runId: "run-object-native",
      traceId: "trace-object-native",
      requestId: "request-object-native",
      documentId: "document-1",
      pageId: "page-1",
      status: "finalizing",
      statusReasonCode: null,
      attemptSeq: 1,
      queueJobId: "run-object-native__attempt_1",
      requestRef: "request_ref_request-object-native",
      snapshotRef: "snapshot_ref_run-object-native",
      deadlineAt: new Date(Date.now() + 60000).toISOString(),
      lastAckedSeq: 1,
      pageLockToken: "page-lock-object-native",
      cancelRequestedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await runAttemptRepository.create({
      attemptId: "attempt-object-native",
      runId: "run-object-native",
      traceId: "trace-object-native",
      attemptSeq: 1,
      retryOfAttemptSeq: null,
      queueJobId: "run-object-native__attempt_1",
      acceptedHttpRequestId: "http-object-native",
      attemptState: "finalizing",
      statusReasonCode: null,
      workerId: "worker-1",
      startedAt: now,
      leaseRecognizedAt: now,
      lastHeartbeatAt: now,
      createdAt: now,
    });

    await mutationLedgerRepository.recordProposal({
      runId: "run-object-native",
      traceId: "trace-object-native",
      attemptSeq: 1,
      queueJobId: "run-object-native__attempt_1",
      event: {
        type: "mutation.proposed",
        mutationId: "mutation-object-native-1",
        rollbackGroupId: "plan-step-object-native-1",
        expectedBaseRevision: 0,
        mutation: {
          mutationId: "mutation-object-native-1",
          mutationVersion: "v1",
          traceId: "trace-object-native",
          runId: "run-object-native",
          draftId: "draft_run-object-native",
          documentId: "document-1",
          pageId: "page-1",
          seq: 1,
          commitGroup: "plan-step-object-native-1",
          idempotencyKey: "mutation-object-native-1",
          expectedBaseRevision: 0,
          ownershipScope: "draft_only",
          commands: [
            {
              commandId: "command-background",
              op: "createLayer",
              executionSlotKey: null,
              clientLayerKey: "background-layer",
              targetRef: {
                layerId: null,
                clientLayerKey: "background-layer",
              },
              targetLayerVersion: null,
              parentRef: { position: "append" },
              expectedLayerType: null,
              allowNoop: false,
              metadataTags: {},
              layerBlueprint: {
                layerType: "shape",
                bounds: { x: 0, y: 0, width: 1200, height: 628 },
                metadata: {},
              },
              editable: true,
            },
            {
              commandId: "command-headline",
              op: "createLayer",
              executionSlotKey: null,
              clientLayerKey: "headline-layer",
              targetRef: {
                layerId: null,
                clientLayerKey: "headline-layer",
              },
              targetLayerVersion: null,
              parentRef: { position: "append" },
              expectedLayerType: null,
              allowNoop: false,
              metadataTags: {},
              layerBlueprint: {
                layerType: "text",
                bounds: { x: 24, y: 232, width: 822, height: 155 },
                metadata: {},
              },
              editable: true,
            },
            {
              commandId: "command-offer",
              op: "createLayer",
              executionSlotKey: null,
              clientLayerKey: "offer-layer",
              targetRef: {
                layerId: null,
                clientLayerKey: "offer-layer",
              },
              targetLayerVersion: null,
              parentRef: { position: "append" },
              expectedLayerType: null,
              allowNoop: false,
              metadataTags: {},
              layerBlueprint: {
                layerType: "text",
                bounds: { x: 101, y: 100, width: 639, height: 96 },
                metadata: {
                  role: "promo_band_cluster",
                },
              },
              editable: true,
            },
            {
              commandId: "command-cta",
              op: "createLayer",
              executionSlotKey: null,
              clientLayerKey: "cta-layer",
              targetRef: {
                layerId: null,
                clientLayerKey: "cta-layer",
              },
              targetLayerVersion: null,
              parentRef: { position: "append" },
              expectedLayerType: null,
              allowNoop: false,
              metadataTags: {},
              layerBlueprint: {
                layerType: "group",
                bounds: { x: 235, y: 452, width: 420, height: 60 },
                metadata: {},
              },
              editable: true,
            },
          ],
          rollbackHint: {
            rollbackGroupId: "plan-step-object-native-1",
            strategy: "delete_created_layers",
          },
          emittedAt: now,
          deliveryDeadlineAt: new Date(Date.now() + 10000).toISOString(),
        },
      },
    });

    await mutationLedgerRepository.recordAck({
      runId: "run-object-native",
      traceId: "trace-object-native",
      mutationId: "mutation-object-native-1",
      seq: 1,
      status: "applied",
      targetPageId: "page-1",
      baseRevision: 0,
      resultingRevision: 1,
      resolvedLayerIds: {
        "background-layer": "background-layer",
        "headline-layer": "headline-layer",
        "offer-layer": "offer-layer",
        "cta-layer": "cta-layer",
      },
      commandResults: [
        {
          commandId: "command-headline",
          op: "createLayer",
          status: "applied",
          resolvedLayerId: "headline-layer",
        },
      ],
      clientObservedAt: now,
    } satisfies MutationApplyAckRequest);

    const request = createFinalizeRequest({
      traceId: "trace-object-native",
      queueJobId: "run-object-native__attempt_1",
      draftId: "draft_run-object-native",
      canonicalDesignBriefRef:
        "runs/run-object-native/attempts/1/canonical-design-brief.json",
      executablePlanRef: "runs/run-object-native/attempts/1/executable-plan.json",
    });
    const result = await service.finalizeRun({
      runId: "run-object-native",
      traceId: "trace-object-native",
      attemptSeq: 1,
      queueJobId: "run-object-native__attempt_1",
      result: {
        finalStatus: "completed",
        draftId: "draft_run-object-native",
        finalRevision: 1,
        durabilityState: "final_saved",
        latestSaveEvidence: {
          code: "template_draft_run-object-native",
          serial: 198068,
          modified: "2026-04-15T07:35:58.000Z",
          version: "2",
        },
        latestSaveReceiptId: null,
        warningCount: 0,
        fallbackCount: 0,
        warnings: [],
        errorSummary: null,
      },
      request: {
        ...request,
        latestSaveEvidence: {
          code: "template_draft_run-object-native",
          serial: 198068,
          modified: "2026-04-15T07:35:58.000Z",
          version: "2",
        },
        latestSaveReceipt: {
          saveReceiptId: "save-receipt-object-native-1",
          outputTemplateCode: "template_draft_run-object-native",
          savedRevision: 1,
          savedAt: "2026-04-15T07:35:58.000Z",
          reason: "run_completed",
        },
        outputTemplateCode: "template_draft_run-object-native",
      },
      at: now,
    });

    assert.equal(result.runStatus, "completed");

    const bundle = await draftBundleRepository.findByRunId("run-object-native");
    assert.ok(bundle);
    assert.equal(
      bundle.payload.saveMetadata.completionSnapshot.minimumDraftSatisfied,
      true,
    );
    assert.deepEqual(bundle.payload.editableCanvasState.draftManifest.slotBindings, []);
    assert.deepEqual(bundle.payload.editableCanvasState.draftManifest.rootLayerIds, [
      "background-layer",
      "headline-layer",
      "offer-layer",
      "cta-layer",
    ]);
    assert.deepEqual(bundle.payload.editableCanvasState.draftManifest.editableLayerIds, [
      "background-layer",
      "headline-layer",
      "offer-layer",
      "cta-layer",
    ]);
    assert.equal(
      bundle.payload.saveMetadata.latestSaveEvidence?.code,
      "template_draft_run-object-native",
    );
    assert.equal(bundle.payload.editableCanvasState.commitPayload.firstRenderableSeq, 1);
  } finally {
    await db.end();
  }
});

test("RunFinalizeService rejects completed runs with no live draft layers", async () => {
  const db = await createTestDb();

  try {
    const runRepository = new RunRepository(db);
    const runAttemptRepository = new RunAttemptRepository(db);
    const mutationLedgerRepository = new MutationLedgerRepository(db);
    const costSummaryRepository = new CostSummaryRepository(db);
    const draftBundleRepository = new DraftBundleRepository(db);
    const completionRepository = new CompletionRepository(db);
    const runEventService = new RunEventService(
      new InMemoryRunEventRepository() as never,
      new SilentSseHub() as never,
      new RecordingLogger(),
    );
    const objectStore = createObjectStoreClient({
      bucket: "finalize-service-test-no-draft",
      mode: "memory",
    });
    const service = new RunFinalizeService(
      runRepository,
      runAttemptRepository,
      mutationLedgerRepository,
      costSummaryRepository,
      draftBundleRepository,
      completionRepository,
      objectStore,
      runEventService,
      new RecordingLogger(),
    );

    const now = new Date().toISOString();
    await runRepository.create({
      runId: "run-no-draft",
      traceId: "trace-no-draft",
      requestId: "request-no-draft",
      documentId: "document-1",
      pageId: "page-1",
      status: "finalizing",
      statusReasonCode: null,
      attemptSeq: 1,
      queueJobId: "run-no-draft__attempt_1",
      requestRef: "request_ref_request-no-draft",
      snapshotRef: "snapshot_ref_run-no-draft",
      deadlineAt: new Date(Date.now() + 60000).toISOString(),
      lastAckedSeq: 1,
      pageLockToken: "page-lock-no-draft",
      cancelRequestedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await runAttemptRepository.create({
      attemptId: "attempt-no-draft",
      runId: "run-no-draft",
      traceId: "trace-no-draft",
      attemptSeq: 1,
      retryOfAttemptSeq: null,
      queueJobId: "run-no-draft__attempt_1",
      acceptedHttpRequestId: "http-no-draft",
      attemptState: "finalizing",
      statusReasonCode: null,
      workerId: "worker-1",
      startedAt: now,
      leaseRecognizedAt: now,
      lastHeartbeatAt: now,
      createdAt: now,
    });

    await mutationLedgerRepository.recordProposal({
      runId: "run-no-draft",
      traceId: "trace-no-draft",
      attemptSeq: 1,
      queueJobId: "run-no-draft__attempt_1",
      event: {
        type: "mutation.proposed",
        mutationId: "mutation-no-draft-1",
        rollbackGroupId: "plan-step-no-draft-1",
        expectedBaseRevision: 0,
        mutation: {
          mutationId: "mutation-no-draft-1",
          mutationVersion: "v1",
          traceId: "trace-no-draft",
          runId: "run-no-draft",
          draftId: "draft_run-no-draft",
          documentId: "document-1",
          pageId: "page-1",
          seq: 1,
          commitGroup: "plan-step-no-draft-1",
          idempotencyKey: "mutation-no-draft-1",
          expectedBaseRevision: 0,
          ownershipScope: "draft_only",
          commands: [
            {
              commandId: "command-save-only",
              op: "saveTemplate",
              targetRef: {},
              targetLayerVersion: null,
              allowNoop: false,
              metadataTags: {},
              reason: "run_completed",
            },
          ],
          rollbackHint: {
            rollbackGroupId: "plan-step-no-draft-1",
            strategy: "restore_snapshot",
          },
          emittedAt: now,
          deliveryDeadlineAt: new Date(Date.now() + 10000).toISOString(),
        },
      },
    });

    await mutationLedgerRepository.recordAck({
      runId: "run-no-draft",
      traceId: "trace-no-draft",
      mutationId: "mutation-no-draft-1",
      seq: 1,
      status: "applied",
      targetPageId: "page-1",
      baseRevision: 0,
      resultingRevision: 1,
      commandResults: [
        {
          commandId: "command-save-only",
          op: "saveTemplate",
          status: "applied",
          saveEvidence: {
            code: "template_draft_run-no-draft",
            serial: 198099,
            modified: "2026-04-15T08:00:00.000Z",
            version: "2",
          },
          saveReceipt: {
            saveReceiptId: "save-receipt-no-draft-1",
            outputTemplateCode: "template_draft_run-no-draft",
            savedRevision: 1,
            savedAt: "2026-04-15T08:00:00.000Z",
            reason: "run_completed",
          },
        },
      ],
      clientObservedAt: now,
    } satisfies MutationApplyAckRequest);

    const result = await service.finalizeRun({
      runId: "run-no-draft",
      traceId: "trace-no-draft",
      attemptSeq: 1,
      queueJobId: "run-no-draft__attempt_1",
      result: {
        finalStatus: "completed",
        draftId: "draft_run-no-draft",
        finalRevision: 1,
        durabilityState: "final_saved",
        latestSaveEvidence: {
          code: "template_draft_run-no-draft",
          serial: 198099,
          modified: "2026-04-15T08:00:00.000Z",
          version: "2",
        },
        latestSaveReceiptId: null,
        warningCount: 0,
        fallbackCount: 0,
        warnings: [],
        errorSummary: null,
      },
      request: createFinalizeRequest({
        traceId: "trace-no-draft",
        queueJobId: "run-no-draft__attempt_1",
        draftId: "draft_run-no-draft",
        latestSaveEvidence: {
          code: "template_draft_run-no-draft",
          serial: 198099,
          modified: "2026-04-15T08:00:00.000Z",
          version: "2",
        },
        latestSaveReceipt: {
          saveReceiptId: "save-receipt-no-draft-1",
          outputTemplateCode: "template_draft_run-no-draft",
          savedRevision: 1,
          savedAt: "2026-04-15T08:00:00.000Z",
          reason: "run_completed",
        },
        outputTemplateCode: "template_draft_run-no-draft",
        canonicalDesignBriefRef:
          "runs/run-no-draft/attempts/1/canonical-design-brief.json",
        executablePlanRef: "runs/run-no-draft/attempts/1/executable-plan.json",
        createdLayerIds: [],
        updatedLayerIds: [],
        deletedLayerIds: [],
      }),
      at: now,
    });

    assert.equal(result.runStatus, "failed");

    const storedRun = await runRepository.findById("run-no-draft");
    assert.equal(storedRun?.status, "failed");

    const bundle = await draftBundleRepository.findByRunId("run-no-draft");
    assert.ok(bundle);
    assert.equal(
      bundle.payload.saveMetadata.completionSnapshot.minimumDraftSatisfied,
      false,
    );
    assert.equal(bundle.payload.saveMetadata.latestSaveEvidence, null);
    assert.equal(
      bundle.payload.saveMetadata.completionSnapshot.terminalStatus,
      "failed",
    );

    const completion = await completionRepository.findByRunId("run-no-draft");
    assert.ok(completion);
    assert.equal(completion.terminalStatus, "failed");
    assert.equal(completion.latestSaveEvidence, null);
    assert.equal(completion.minimumDraftSatisfied, false);
  } finally {
    await db.end();
  }
});
