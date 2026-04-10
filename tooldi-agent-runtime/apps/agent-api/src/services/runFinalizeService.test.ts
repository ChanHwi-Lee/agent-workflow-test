import assert from "node:assert/strict";
import test from "node:test";

import type {
  MutationApplyAckRequest,
  RunFinalizeRequest,
} from "@tooldi/agent-contracts";
import { createObjectStoreClient, createPgClient } from "@tooldi/agent-persistence";
import type { Logger } from "@tooldi/agent-observability";

import { CompletionRepository } from "../repositories/completionRepository.js";
import { CostSummaryRepository } from "../repositories/costSummaryRepository.js";
import { DraftBundleRepository } from "../repositories/draftBundleRepository.js";
import { MutationLedgerRepository } from "../repositories/mutationLedgerRepository.js";
import { RunAttemptRepository } from "../repositories/runAttemptRepository.js";
import { RunRepository } from "../repositories/runRepository.js";
import { RunEventService } from "./runEventService.js";
import { RunFinalizeService } from "./runFinalizeService.js";

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
    latestSaveReceiptId: "save-receipt-1",
    outputTemplateCode: "template_draft_run-1",
    normalizedIntentRef: "runs/run-1/attempts/1/normalized-intent.json",
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
  const db = createPgClient({
    connectionString: "postgres://localhost:5432/tooldi_agent_runtime_test",
  });
  await db.connect();

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
              slotKey: "background",
              executionSlotKey: "background",
              clientLayerKey: "background-layer",
              targetRef: {
                layerId: null,
                clientLayerKey: "background-layer",
                slotKey: "background",
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
              slotKey: "headline",
              executionSlotKey: "headline",
              clientLayerKey: "headline-layer",
              targetRef: {
                layerId: null,
                clientLayerKey: "headline-layer",
                slotKey: "headline",
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
              slotKey: "supporting_copy",
              executionSlotKey: "subheadline",
              clientLayerKey: "supporting-layer",
              targetRef: {
                layerId: null,
                clientLayerKey: "supporting-layer",
                slotKey: "supporting_copy",
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
              slotKey: null,
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
              slotKey: "cta",
              executionSlotKey: "cta",
              clientLayerKey: "cta-layer",
              targetRef: {
                layerId: null,
                clientLayerKey: "cta-layer",
                slotKey: "cta",
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
              slotKey: null,
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
              slotKey: null,
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
              slotKey: "decoration",
              executionSlotKey: null,
              clientLayerKey: "decoration-layer",
              targetRef: {
                layerId: null,
                clientLayerKey: "decoration-layer",
                slotKey: "decoration",
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
        latestSaveReceiptId: "save-receipt-1",
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
    assert.equal(bundle.payload.saveMetadata.latestSaveReceipt, null);
    assert.equal(bundle.payload.editableCanvasState.commitPayload.requiredSlots.length, 5);
    assert.equal(bundle.payload.mutationLedger.lastKnownGoodCheckpointId, "checkpoint_run-1_latest_saved");
    assert.equal(
      bundle.payload.editableCanvasState.draftManifest.slotBindings.some(
        (binding) =>
          binding.executionSlotKey === "offer_line" &&
          binding.slotKey === null &&
          binding.primaryLayerId === "offer-layer",
      ),
      true,
    );
    assert.equal(
      bundle.payload.mutationLedger.checkpoints[0]?.bundleSnapshot.slotStatuses.some(
        (status) =>
          status.executionSlotKey === "footer_note" &&
          status.slotKey === null &&
          status.primaryLayerId === "footer-layer",
      ),
      true,
    );
    assert.equal(
      bundle.payload.editableCanvasState.draftManifest.slotBindings.some(
        (binding) =>
          binding.executionSlotKey === "hero_image" &&
          binding.slotKey === null &&
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
      completion.sourceRefs.normalizedIntentRef,
      "runs/run-1/attempts/1/normalized-intent.json",
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
