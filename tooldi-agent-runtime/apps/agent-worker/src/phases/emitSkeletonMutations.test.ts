import assert from "node:assert/strict";
import test from "node:test";

import type {
  CanvasMutationCommand,
  ExecutablePlan,
} from "@tooldi/agent-contracts";
import { normalizeTemplateAssetPolicy } from "@tooldi/agent-llm";
import { createTestRun } from "@tooldi/agent-testkit";

import type { HydratedPlanningInput, NormalizedIntent } from "../types.js";
import { emitSkeletonMutations } from "./emitSkeletonMutations.js";

function createHydratedPlanningInput(): HydratedPlanningInput {
  const testRun = createTestRun({
    userInput: {
      prompt: "오픈 이벤트 배너를 만들어줘",
      locale: "ko-KR",
      timezone: "Asia/Seoul",
    },
    editorContext: {
      documentId: "document-1",
      pageId: "page-1",
      canvasState: "empty",
      canvasWidth: 1200,
      canvasHeight: 628,
      sizeSerial: "1200x628@1",
      workingTemplateCode: null,
      canvasSnapshotRef: null,
      selectedLayerIds: [],
    },
  });

  return {
    job: testRun.job,
    request: testRun.request,
    snapshot: testRun.snapshot,
    requestRef: testRun.requestRef,
    snapshotRef: testRun.snapshotRef,
    repairContext: null,
  };
}

function createNormalizedIntent(): NormalizedIntent {
  return {
    intentId: "intent-1",
    runId: "run-1",
    traceId: "trace-1",
    plannerMode: "langchain",
    operationFamily: "create_template",
    artifactType: "LiveDraftArtifactBundle",
    goalSummary: "오픈 이벤트 배너를 만들어줘",
    requestedOutputCount: 1,
    templateKind: "promo_banner",
    domain: "general_marketing",
    audience: "general_consumers",
    campaignGoal: "promotion_awareness",
    canvasPreset: "wide_1200x628",
    layoutIntent: "copy_focused",
    tone: "bright_playful",
    requiredSlots: [
      "background",
      "headline",
      "supporting_copy",
      "cta",
      "decoration",
    ],
    assetPolicy: normalizeTemplateAssetPolicy("graphic_allowed_photo_optional"),
    searchKeywords: ["오픈", "이벤트", "프로모션"],
    facets: {
      seasonality: "spring",
      menuType: null,
      promotionStyle: "general_campaign",
      offerSpecificity: "broad_offer",
    },
    brandConstraints: {
      palette: [],
      typographyHint: null,
      forbiddenStyles: [],
    },
    consistencyFlags: [],
    normalizationNotes: [],
    supportedInV1: true,
    futureCapableOperations: ["create_template"],
  };
}

function createExecutablePlan(): ExecutablePlan {
  return {
    planId: "plan-1",
    planVersion: 1,
    planSchemaVersion: "v1-stub",
    runId: "run-1",
    traceId: "trace-1",
    attemptSeq: 1,
    intent: {
      operationFamily: "create_template",
      artifactType: "LiveDraftArtifactBundle",
    },
    constraintsRef: "constraints-1",
    actions: [
      {
        actionId: "a-foundation",
        kind: "canvas_mutation",
        operation: "prepare_background_and_foundation",
        toolName: "background-catalog",
        toolVersion: "1",
        commitGroup: "group-1",
        liveCommit: true,
        idempotencyKey: "id-1",
        dependsOn: [],
        targetRef: {
          documentId: "document-1",
          pageId: "page-1",
          layerId: null,
          slotKey: "background",
        },
        inputs: {
          backgroundMode: "spring_pattern",
          selectedBackgroundCandidateId: "background-1",
          includeHeroPanel: false,
          includeBadge: false,
          includeRibbon: false,
          includeFrame: false,
        },
        rollback: {
          strategy: "delete_created_layers",
        },
      },
      {
        actionId: "a-copy",
        kind: "canvas_mutation",
        operation: "place_copy_cluster",
        toolName: "layout-selector",
        toolVersion: "1",
        commitGroup: "group-1",
        liveCommit: true,
        idempotencyKey: "id-2",
        dependsOn: ["a-foundation"],
        targetRef: {
          documentId: "document-1",
          pageId: "page-1",
          layerId: null,
          slotKey: "headline",
        },
        inputs: {
          layoutMode: "left_copy_right_graphic",
          selectedLayoutCandidateId: "layout-1",
          displayFontFamily: "font_display_700",
          displayFontWeight: 700,
          bodyFontFamily: "font_body_400",
          bodyFontWeight: 400,
          includeHeroCaption: false,
          includeBadge: false,
          copySlotTexts: {
            headline: "오픈 이벤트",
            subheadline: "지금 바로 확인하세요",
            offer_line: "특별 혜택 진행 중",
            cta: "이벤트 확인",
            footer_note: "기간 한정 혜택",
          },
          copySlotAnchors: {
            headline: "left_copy_column",
            subheadline: "left_copy_column",
            offer_line: "left_copy_column",
            cta: "bottom_center",
            footer_note: "footer_strip",
          },
          clusterZones: ["right_cluster", "top_corner", "bottom_strip"],
          spacingIntent: "balanced",
        },
        rollback: {
          strategy: "delete_created_layers",
        },
      },
      {
        actionId: "a-polish",
        kind: "canvas_mutation",
        operation: "place_promo_polish",
        toolName: "style-heuristic",
        toolVersion: "1",
        commitGroup: "group-1",
        liveCommit: true,
        idempotencyKey: "id-3",
        dependsOn: ["a-copy"],
        targetRef: {
          documentId: "document-1",
          pageId: "page-1",
          layerId: null,
          slotKey: "decoration",
        },
        inputs: {
          decorationMode: "promo_multi_graphic",
          selectedDecorationCandidateId: "graphic-1",
          graphicCompositionSet: {
            roles: [
              {
                role: "primary_accent",
                candidateId: "graphic-1",
                variantKey: "graphic_primary",
                sourceAssetId: "asset-1",
                sourceSerial: "serial-1",
                sourceCategory: "vector",
              },
              {
                role: "corner_accent",
                candidateId: "graphic-2",
                variantKey: "graphic_corner",
                sourceAssetId: "asset-2",
                sourceSerial: "serial-2",
                sourceCategory: "vector",
              },
            ],
          },
          graphicRolePlacementHints: [
            { role: "primary_accent", zone: "right_cluster" },
            { role: "corner_accent", zone: "top_corner" },
          ],
          clusterZones: ["right_cluster", "top_corner", "bottom_strip"],
          ctaContainerExpected: true,
          spacingIntent: "balanced",
          includeUnderline: false,
          includeRibbon: false,
        },
        rollback: {
          strategy: "delete_created_layers",
        },
      },
    ],
  };
}

function isCreateLayerCommand(
  command: CanvasMutationCommand | undefined,
): command is Extract<CanvasMutationCommand, { op: "createLayer" }> {
  return command?.op === "createLayer";
}

test("emitSkeletonMutations uses copy slot text and concrete layout hints in mutation payloads", async () => {
  const batch = await emitSkeletonMutations(
    createHydratedPlanningInput(),
    createNormalizedIntent(),
    createExecutablePlan(),
    {
      textLayoutHelper: {
        estimate: async () => ({
          width: 240,
          height: 84,
          lineCount: 1,
          estimatedLineCount: 1,
        }),
      },
    },
  );

  const copyProposal = batch.proposals.find((proposal) => proposal.stageLabel === "copy");
  assert.ok(copyProposal);
  const headlineCommand = copyProposal.mutation.commands.find(
    (command) => command.slotKey === "headline",
  );
  const supportingCopyCommand = copyProposal.mutation.commands.find(
    (command) => command.slotKey === "supporting_copy",
  );
  const ctaProposal = batch.proposals.find((proposal) => proposal.stageLabel === "polish");
  assert.ok(ctaProposal);
  if (!headlineCommand || !isCreateLayerCommand(headlineCommand)) {
    throw new Error("headline createLayer command is required");
  }
  if (!supportingCopyCommand || !isCreateLayerCommand(supportingCopyCommand)) {
    throw new Error("supporting copy createLayer command is required");
  }
  assert.equal(headlineCommand.layerBlueprint.metadata?.copyText, "오픈 이벤트");
  assert.equal(
    supportingCopyCommand.layerBlueprint.metadata?.copyText,
    "지금 바로 확인하세요",
  );

  const ctaCommand = ctaProposal.mutation.commands.find(
    (command) => command.slotKey === "cta",
  );
  if (!ctaCommand || !isCreateLayerCommand(ctaCommand)) {
    throw new Error("cta createLayer command is required");
  }
  assert.equal(ctaCommand.layerBlueprint.metadata?.copyText, "이벤트 확인");
  assert.equal(
    typeof ctaCommand.layerBlueprint.bounds.x === "number" &&
      ctaCommand.layerBlueprint.bounds.x > 300,
    true,
  );

  const primaryAccentCommand = ctaProposal.mutation.commands.find(
    (command) =>
      isCreateLayerCommand(command) &&
      command.layerBlueprint.metadata?.role === "primary_accent",
  );
  if (!primaryAccentCommand || !isCreateLayerCommand(primaryAccentCommand)) {
    throw new Error("primary accent createLayer command is required");
  }
  assert.equal(primaryAccentCommand.layerBlueprint.metadata?.clusterZone, "right_cluster");
});
