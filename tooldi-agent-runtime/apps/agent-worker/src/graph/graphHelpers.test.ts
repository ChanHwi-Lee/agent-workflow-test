import assert from "node:assert/strict";
import test from "node:test";

import { buildArtifactRefs, buildFinalizeOptions, buildStageAckRecord } from "./graphHelpers.js";

test("graphHelpers는 정의된 artifact ref만 노출한다", () => {
  const refs = buildArtifactRefs({
    canonicalDesignBriefRef: "runs/run-1/attempts/1/canonical-design-brief.json",
    semanticBriefDraftRef: null,
    briefCompilationReportRef: "runs/run-1/attempts/1/brief-compilation-report.json",
    compositionBriefRef: "runs/run-1/attempts/1/composition-brief.json",
    compositionVariantSetRef: null,
    compositionRankingRef: "runs/run-1/attempts/1/composition-ranking.json",
    copyPlanRef: null,
    copyPlanNormalizationReportRef: null,
    abstractLayoutPlanRef: null,
    abstractLayoutPlanNormalizationReportRef: null,
    assetPlanRef: "runs/run-1/attempts/1/asset-plan.json",
    concreteLayoutPlanRef: null,
    templatePriorSummaryRef: null,
    templatePriorBundleRef: null,
    sceneRolePlanRef: null,
    sceneLayoutPlanRef: null,
    sceneStylePlanRef: null,
    sceneBindingPlanRef: null,
    searchProfileRef: null,
    executablePlanRef: "runs/run-1/attempts/1/executable-plan.json",
    candidateSetRef: null,
    sourceSearchSummaryRef: null,
    retrievalStageRef: null,
    selectionDecisionRef: null,
    typographyDecisionRef: null,
    ruleJudgeVerdictRef: null,
    executionSceneSummaryRef: "runs/run-1/attempts/1/execution-scene-summary.json",
    judgePlanRef: null,
    refineDecisionRef: null,
    ruleJudgeVerdict: null,
    judgePlan: null,
    sourceSearchSummary: null,
  });

  assert.deepEqual(refs, {
    canonicalDesignBriefRef: "runs/run-1/attempts/1/canonical-design-brief.json",
    briefCompilationReportRef:
      "runs/run-1/attempts/1/brief-compilation-report.json",
    compositionBriefRef: "runs/run-1/attempts/1/composition-brief.json",
    compositionRankingRef: "runs/run-1/attempts/1/composition-ranking.json",
    assetPlanRef: "runs/run-1/attempts/1/asset-plan.json",
    executablePlanRef: "runs/run-1/attempts/1/executable-plan.json",
    executionSceneSummaryRef:
      "runs/run-1/attempts/1/execution-scene-summary.json",
  });
});

test("graphHelpers는 judge warning을 finalize option에 투영한다", () => {
  const options = buildFinalizeOptions(
    {
      canonicalDesignBriefRef: "runs/run-1/attempts/1/canonical-design-brief.json",
      semanticBriefDraftRef: null,
      briefCompilationReportRef: null,
      compositionBriefRef: null,
      compositionVariantSetRef: null,
      compositionRankingRef: null,
      copyPlanRef: null,
      copyPlanNormalizationReportRef: null,
      abstractLayoutPlanRef: null,
      abstractLayoutPlanNormalizationReportRef: null,
      assetPlanRef: null,
      concreteLayoutPlanRef: null,
      templatePriorSummaryRef: null,
      templatePriorBundleRef: null,
      sceneRolePlanRef: null,
      sceneLayoutPlanRef: null,
      sceneStylePlanRef: null,
      sceneBindingPlanRef: null,
      searchProfileRef: null,
      executablePlanRef: null,
      candidateSetRef: null,
      sourceSearchSummaryRef: null,
      retrievalStageRef: null,
      selectionDecisionRef: null,
      typographyDecisionRef: null,
      ruleJudgeVerdictRef: null,
      executionSceneSummaryRef: null,
      judgePlanRef: "runs/run-1/attempts/1/judge-plan.json",
      refineDecisionRef: null,
      ruleJudgeVerdict: null,
      judgePlan: {
        judgePlanId: "judge-1",
        runId: "run-1",
        traceId: "trace-1",
        refineAttempt: 0,
        recommendation: "warn_only",
        patchable: false,
        allowedPatchScopes: [],
        issues: [
          {
            code: "slot_materialization_missing",
            severity: "warn",
            message: "footer missing",
            patchable: false,
            suggestedPatchScopes: [],
          },
        ],
        summary: "warn",
      },
      sourceSearchSummary: null,
    },
    false,
    [1, 2, 3],
  );

  assert.ok("warningSummary" in options);
  assert.deepEqual(options.warningSummary, [
    {
      code: "slot_materialization_missing",
      message: "footer missing",
    },
  ]);
  assert.equal(options.judgePlanRef, "runs/run-1/attempts/1/judge-plan.json");
});

test("graphHelpers는 representative degraded warning을 finalize option에 투영하지 않는다", () => {
  const options = buildFinalizeOptions(
    {
      canonicalDesignBriefRef: "runs/run-1/attempts/1/canonical-design-brief.json",
      semanticBriefDraftRef: null,
      briefCompilationReportRef: null,
      compositionBriefRef: null,
      compositionVariantSetRef: null,
      compositionRankingRef: null,
      copyPlanRef: null,
      copyPlanNormalizationReportRef: null,
      abstractLayoutPlanRef: null,
      abstractLayoutPlanNormalizationReportRef: null,
      assetPlanRef: null,
      concreteLayoutPlanRef: null,
      templatePriorSummaryRef: null,
      templatePriorBundleRef: null,
      sceneRolePlanRef: null,
      sceneLayoutPlanRef: null,
      sceneStylePlanRef: null,
      sceneBindingPlanRef: null,
      searchProfileRef: null,
      executablePlanRef: null,
      candidateSetRef: null,
      sourceSearchSummaryRef: null,
      retrievalStageRef: null,
      selectionDecisionRef: null,
      typographyDecisionRef: null,
      ruleJudgeVerdictRef: null,
      executionSceneSummaryRef: null,
      judgePlanRef: null,
      refineDecisionRef: null,
      ruleJudgeVerdict: null,
      judgePlan: null,
      sourceSearchSummary: {
        summaryId: "source-1",
        runId: "run-1",
        traceId: "trace-1",
        sourceMode: "tooldi_api",
        background: {
          family: "background",
          queryAttempts: [],
          returnedCount: 1,
          filteredCount: 1,
          fallbackUsed: false,
          selectedAssetId: null,
          selectedSerial: null,
          selectedCategory: null,
        },
        graphic: {
          family: "graphic",
          queryAttempts: [],
          returnedCount: 1,
          filteredCount: 1,
          fallbackUsed: false,
          selectedAssetId: "graphic:1",
          selectedSerial: "1",
          selectedCategory: "illust",
        },
        photo: {
          family: "photo",
          queryAttempts: [],
          returnedCount: 0,
          filteredCount: 0,
          fallbackUsed: true,
          selectedAssetId: null,
          selectedSerial: null,
          selectedCategory: null,
        },
        font: {
          family: "font",
          queryAttempts: [],
          returnedCount: 1,
          filteredCount: 1,
          fallbackUsed: false,
          selectedAssetId: "font:1",
          selectedSerial: "701",
          selectedCategory: "gothic",
        },
        representativeReadiness: {
          path: "generic_promo_phase6",
          overallStatus: "degraded",
          background: {
            status: "not_applicable",
            mode: "generated_solid",
            colorHex: "#dff2ff",
            reasonCodes: [],
          },
          graphic: {
            status: "degraded",
            targetRequired: 2,
            minimumRequired: 1,
            materializedRealCount: 1,
            reasonCodes: ["graphic_real_target_not_met"],
          },
          font: {
            status: "target_met",
            targetRequired: "display_and_body",
            minimumRequired: 1,
            displayRealSelected: true,
            bodyRealSelected: true,
            realSelectionCount: 2,
            reasonCodes: [],
          },
        },
      },
    },
    false,
    [1, 2, 3],
  );

  assert.equal("warningSummary" in options, false);
  assert.equal("overrideResult" in options, false);
});

test("graphHelpers는 ack와 proposal을 stage record로 보존한다", () => {
  const record = buildStageAckRecord(
    {
      mutationId: "mutation-1",
      rollbackGroupId: "rollback-1",
      stageLabel: "copy",
      stageDescription: "copy stage",
      mutation: {
        mutationId: "mutation-1",
        mutationVersion: "v1",
        traceId: "trace-1",
        runId: "run-1",
        draftId: "draft-1",
        documentId: "document-1",
        pageId: "page-1",
        seq: 2,
        commitGroup: "group-1",
        idempotencyKey: "idem-1",
        expectedBaseRevision: 1,
        ownershipScope: "draft_only",
        commands: [
          {
            commandId: "command-1",
            op: "createLayer",
            executionSlotKey: "headline",
            clientLayerKey: "headline_1",
            targetRef: {
              layerId: null,
              clientLayerKey: "headline_1",
            },
            targetLayerVersion: null,
            parentRef: {
              position: "append",
            },
            expectedLayerType: null,
            allowNoop: false,
            metadataTags: {
              source: "agent-worker-spring-template",
              stage: "copy",
            },
            layerBlueprint: {
              layerType: "text",
              bounds: {
                x: 100,
                y: 120,
                width: 300,
                height: 80,
              },
              metadata: {
                role: "headline",
              },
            },
            editable: true,
          },
        ],
        rollbackHint: {
          rollbackGroupId: "rollback-1",
          strategy: "delete_created_layers",
        },
        emittedAt: new Date().toISOString(),
        deliveryDeadlineAt: new Date().toISOString(),
      },
    },
    {
      found: true,
      status: "acked",
      seq: 2,
      resultingRevision: 5,
      resolvedLayerIds: {
        headline_1: "layer-1",
      },
    },
  );

  assert.equal(record.stageLabel, "copy");
  assert.equal(record.commands[0]?.executionSlotKey, "headline");
  assert.deepEqual(record.commands[0]?.proposedBounds, {
    x: 100,
    y: 120,
    width: 300,
    height: 80,
  });
  assert.equal(record.resolvedLayerIds?.headline_1, "layer-1");
});
