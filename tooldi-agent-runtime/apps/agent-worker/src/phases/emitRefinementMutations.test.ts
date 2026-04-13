import assert from "node:assert/strict";
import test from "node:test";

import type {
  CanvasMutationCommand,
  ExecutablePlan,
  WaitMutationAckResponse,
} from "@tooldi/agent-contracts";
import { normalizeTemplateAssetPolicy } from "@tooldi/agent-llm";
import { createTestRun } from "@tooldi/agent-testkit";

import type {
  CopyPlan,
  ExecutionSceneSummary,
  HydratedPlanningInput,
  NormalizedIntent,
  RefineDecision,
  RefinementPatchOperation,
} from "../types.js";
import { emitRefinementMutations } from "./emitRefinementMutations.js";
import { emitSkeletonMutations } from "./emitSkeletonMutations.js";

const TEXT_LAYOUT_HELPER = {
  estimate: async () => ({
    width: 240,
    height: 84,
    estimatedLineCount: 1,
  }),
};

function createHydratedPlanningInput(): HydratedPlanningInput {
  const testRun = createTestRun({
    userInput: {
      prompt: "봄 세일 배너를 만들어줘",
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
    goalSummary: "봄 세일 배너를 만들어줘",
    requestedOutputCount: 1,
    templateKind: "promo_banner",
    domain: "general_marketing",
    audience: "general_consumers",
    campaignGoal: "promotion_awareness",
    canvasPreset: "wide_1200x628",
    layoutIntent: "copy_focused",
    tone: "bright_playful",
    subjectBinding: "subjectless",
    offerIntent: "sale",
    backgroundColorHex: "#FFEDF0",
    requiredSlots: [
      "background",
      "headline",
      "supporting_copy",
      "cta",
      "decoration",
    ],
    assetPolicy: normalizeTemplateAssetPolicy("graphic_allowed_photo_optional"),
    primaryVisualPolicy: "graphic_preferred",
    searchKeywords: ["봄", "세일", "프로모션"],
    facets: {
      seasonality: "spring",
      menuType: null,
      promotionStyle: "sale_campaign",
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

function createCopyPlan(): CopyPlan {
  return {
    planId: "copy-plan-1",
    runId: "run-1",
    traceId: "trace-1",
    plannerMode: "langchain",
    source: "heuristic",
    slots: [
      {
        key: "headline",
        text: "설레는 봄, 특별한 세일이 시작됩니다!",
        priority: "primary",
        required: true,
        maxLength: 32,
        toneHint: "promotional",
      },
      {
        key: "subheadline",
        text: "지금 바로 봄맞이 쇼핑을 즐겨보세요.",
        priority: "secondary",
        required: true,
        maxLength: 40,
        toneHint: "informational",
      },
      {
        key: "offer_line",
        text: "전 품목 최대 50% 할인 혜택",
        priority: "secondary",
        required: true,
        maxLength: 24,
        toneHint: "promotional",
      },
      {
        key: "cta",
        text: "지금 쇼핑하기",
        priority: "secondary",
        required: true,
        maxLength: 16,
        toneHint: "promotional",
      },
      {
        key: "footer_note",
        text: "본 행사는 재고 소진 시 조기 종료될 수 있습니다.",
        priority: "supporting",
        required: true,
        maxLength: 40,
        toneHint: "informational",
      },
    ],
    primaryMessage: "설레는 봄, 특별한 세일이 시작됩니다!",
    summary: "generic promo copy plan",
  };
}

function createExecutablePlan(options?: {
  spacingIntent?: "dense" | "balanced" | "airy";
  includeCatalogCtaContainer?: boolean;
  ctaContainerExpected?: boolean;
}): ExecutablePlan {
  const spacingIntent = options?.spacingIntent ?? "balanced";
  const includeCatalogCtaContainer = options?.includeCatalogCtaContainer ?? true;
  const ctaContainerExpected = options?.ctaContainerExpected ?? includeCatalogCtaContainer;
  const graphicRoles = [
    {
      role: "primary_accent",
      candidateId: "graphic-1",
      variantKey: "graphic_primary",
      sourceAssetId: "asset-1",
      sourceSerial: "serial-1",
      sourceCategory: "vector",
    },
    ...(includeCatalogCtaContainer
      ? [
          {
            role: "cta_container",
            candidateId: "graphic-2",
            variantKey: "graphic_cta",
            sourceAssetId: "asset-2",
            sourceSerial: "serial-2",
            sourceCategory: "vector",
          },
        ]
      : []),
    {
      role: "corner_accent",
      candidateId: "graphic-3",
      variantKey: "graphic_corner",
      sourceAssetId: "asset-3",
      sourceSerial: "serial-3",
      sourceCategory: "vector",
    },
  ];

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
          backgroundMode: "generated_solid",
          selectedBackgroundCandidateId: "background-1",
          backgroundColorHex: "#FFEDF0",
          includeHeroPanel: false,
          includeBadge: false,
          includeRibbon: false,
          includeFrame: false,
        },
        rollback: { strategy: "delete_created_layers" },
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
          displayFontFamily: "1168_700",
          displayFontWeight: 700,
          bodyFontFamily: "1168_400",
          bodyFontWeight: 400,
          includeHeroCaption: false,
          includeBadge: false,
          copySlotTexts: {
            headline: "설레는 봄, 특별한 세일이 시작됩니다!",
            subheadline: "지금 바로 봄맞이 쇼핑을 즐겨보세요.",
            offer_line: "전 품목 최대 50% 할인 혜택",
            cta: "지금 쇼핑하기",
            footer_note: "본 행사는 재고 소진 시 조기 종료될 수 있습니다.",
          },
          copySlotAnchors: {
            headline: "left_copy_column",
            subheadline: "left_copy_column",
            offer_line: "left_copy_column",
            cta: "left_copy_column",
            footer_note: "footer_strip",
          },
          clusterZones: ["right_cluster", "top_corner", "bottom_strip"],
          spacingIntent,
        },
        rollback: { strategy: "delete_created_layers" },
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
          selectedDecorationAssetId: "graphic:serial-1",
          selectedDecorationSerial: "serial-1",
          selectedDecorationCategory: "vector",
          graphicCompositionSet: {
            roles: graphicRoles,
          },
          graphicRolePlacementHints: graphicRoles.map((role) => ({
            role: role.role,
            zone: role.role === "corner_accent" ? "top_corner" : "right_cluster",
          })),
          clusterZones: ["right_cluster", "top_corner", "bottom_strip"],
          ctaContainerExpected,
          spacingIntent,
          includeUnderline: false,
          includeRibbon: false,
        },
        rollback: { strategy: "delete_created_layers" },
      },
    ],
  };
}

function createRefineDecision(
  operations: RefinementPatchOperation[],
): RefineDecision {
  return {
    decisionId: "refine-1",
    runId: "run-1",
    traceId: "trace-1",
    decision: "patch",
    reason: "judge requested bounded patch refinement",
    refineAttempt: 0,
    targetRevision: 3,
    patchPlan: {
      patchPlanId: "patch-plan-1",
      runId: "run-1",
      traceId: "trace-1",
      operations,
      summary: "patch operations",
    },
  };
}

function createLastMutationAck(): WaitMutationAckResponse {
  return {
    found: true,
    status: "acked",
    seq: 3,
    resultingRevision: 3,
    resolvedLayerIds: {},
    commandResults: [],
  };
}

async function createExecutionSceneSummaryFromPlan(
  executablePlan: ExecutablePlan,
): Promise<ExecutionSceneSummary> {
  const input = createHydratedPlanningInput();
  const normalizedIntent = createNormalizedIntent();
  const batch = await emitSkeletonMutations(
    input,
    normalizedIntent,
    executablePlan,
    {
      textLayoutHelper: TEXT_LAYOUT_HELPER,
    },
  );

  const createCommands = batch.proposals.flatMap((proposal) =>
    proposal.mutation.commands.filter(
      (
        command,
      ): command is Extract<typeof proposal.mutation.commands[number], { op: "createLayer" }> =>
        command.op === "createLayer",
    ),
  );

  return {
    summaryId: "scene-summary-1",
    runId: "run-1",
    traceId: "trace-1",
    attemptSeq: 1,
    finalRevision: 3,
    stageResults: [],
    copyLayerBindings: createCommands
      .filter((command) => command.executionSlotKey !== null)
      .filter(
        (command) =>
          command.executionSlotKey === "headline" ||
          command.executionSlotKey === "subheadline" ||
          command.executionSlotKey === "offer_line" ||
          command.executionSlotKey === "cta" ||
          command.executionSlotKey === "footer_note",
      )
      .map((command) => {
        const executionSlotKey = command.executionSlotKey as
          | "headline"
          | "subheadline"
          | "offer_line"
          | "cta"
          | "footer_note";
        return {
          executionSlotKey,
          identityObserved: true,
          layerId:
            executionSlotKey === "cta"
              ? "group-cta"
              : `text-${executionSlotKey}`,
          text:
            typeof command.layerBlueprint.metadata.copyText === "string"
              ? command.layerBlueprint.metadata.copyText
              : null,
          anchor: "left_copy_column",
          plannedBounds: command.layerBlueprint.bounds,
          resolvedBounds: command.layerBlueprint.bounds,
        };
      }),
    graphicLayerBindings: createCommands
      .filter(
        (command) =>
          typeof command.layerBlueprint.metadata.role === "string" &&
          (command.layerBlueprint.metadata.role === "primary_accent" ||
            command.layerBlueprint.metadata.role === "cta_container" ||
            command.layerBlueprint.metadata.role === "corner_accent"),
      )
      .map((command) => ({
        role: command.layerBlueprint.metadata.role as
          | "primary_accent"
          | "cta_container"
          | "corner_accent",
        layerId:
          command.layerBlueprint.metadata.role === "cta_container"
            ? "group-cta-container"
            : `illust-${command.layerBlueprint.metadata.role}`,
        zone:
          command.layerBlueprint.metadata.role === "corner_accent"
            ? "top_corner"
            : "right_cluster",
        sourceAssetId:
          typeof command.layerBlueprint.metadata.sourceAssetId === "string"
            ? command.layerBlueprint.metadata.sourceAssetId
            : null,
        sourceSerial:
          typeof command.layerBlueprint.metadata.sourceSerial === "string"
            ? command.layerBlueprint.metadata.sourceSerial
            : null,
      })),
    photoLayerBinding: null,
    ctaContainerResolved: createCommands.some(
      (command) => command.layerBlueprint.metadata.role === "cta_container",
    ),
    summary: "execution scene summary",
  };
}

function isUpdateLayerCommand(
  command: CanvasMutationCommand,
): command is Extract<CanvasMutationCommand, { op: "updateLayer" }> {
  return command.op === "updateLayer";
}

function isCreateLayerCommand(
  command: CanvasMutationCommand,
): command is Extract<CanvasMutationCommand, { op: "createLayer" }> {
  return command.op === "createLayer";
}

test("emitRefinementMutations는 CTA copy refine에서 graphic role update를 만들지 않는다", async () => {
  const executablePlan = createExecutablePlan({
    includeCatalogCtaContainer: true,
    ctaContainerExpected: true,
  });
  const executionSceneSummary = await createExecutionSceneSummaryFromPlan(
    executablePlan,
  );

  const result = await emitRefinementMutations(
    createHydratedPlanningInput(),
    createNormalizedIntent(),
    executablePlan,
    createCopyPlan(),
    executionSceneSummary,
    createRefineDecision([
      {
        kind: "rewrite_copy_slot_text",
        slotKey: "cta",
        text: "혜택 보기",
      },
    ]),
    createLastMutationAck(),
    {
      textLayoutHelper: TEXT_LAYOUT_HELPER,
    },
  );

  assert.ok(result.proposal);
  assert.equal(result.proposal?.mutation.commands.length, 1);
  const command = result.proposal?.mutation.commands[0];
  if (!command || !isUpdateLayerCommand(command)) {
    throw new Error("CTA refine updateLayer command is required");
  }

  assert.equal(command.executionSlotKey, "cta");
  assert.equal(command.expectedLayerType, "group");
  assert.equal(command.targetRef.layerId, "group-cta");
  assert.deepEqual(command.patchMask, ["metadata"]);
  assert.deepEqual(command.patch, {
    metadata: {
      copyText: "혜택 보기",
    },
  });
  assert.equal(
    result.proposal?.mutation.commands.some(
      (candidate) =>
        candidate.op === "updateLayer" &&
        candidate.expectedLayerType === "shape",
    ),
    false,
  );
});

test("emitRefinementMutations는 spacing refine에서 copy slot bounds만 갱신한다", async () => {
  const executablePlan = createExecutablePlan({
    spacingIntent: "dense",
    includeCatalogCtaContainer: true,
    ctaContainerExpected: true,
  });
  const executionSceneSummary = await createExecutionSceneSummaryFromPlan(
    executablePlan,
  );

  const result = await emitRefinementMutations(
    createHydratedPlanningInput(),
    createNormalizedIntent(),
    executablePlan,
    createCopyPlan(),
    executionSceneSummary,
    createRefineDecision([
      {
        kind: "set_spacing_intent",
        spacingIntent: "airy",
      },
    ]),
    createLastMutationAck(),
    {
      textLayoutHelper: TEXT_LAYOUT_HELPER,
    },
  );

  assert.ok(result.proposal);
  assert.equal((result.proposal?.mutation.commands.length ?? 0) > 0, true);
  assert.equal(
    result.proposal?.mutation.commands.every(
      (command) =>
        isUpdateLayerCommand(command) &&
        (command.executionSlotKey === "headline" ||
          command.executionSlotKey === "subheadline" ||
          command.executionSlotKey === "offer_line" ||
          command.executionSlotKey === "cta" ||
          command.executionSlotKey === "footer_note"),
    ),
    true,
  );
  assert.equal(
    result.proposal?.mutation.commands.some(
      (command) =>
        isUpdateLayerCommand(command) &&
        command.expectedLayerType === "shape",
    ),
    false,
  );
});

test("emitRefinementMutations는 CTA fallback refine에서 fallback createLayer만 추가한다", async () => {
  const executablePlan = createExecutablePlan({
    includeCatalogCtaContainer: false,
    ctaContainerExpected: false,
  });
  const executionSceneSummary = await createExecutionSceneSummaryFromPlan(
    executablePlan,
  );
  executionSceneSummary.ctaContainerResolved = false;

  const result = await emitRefinementMutations(
    createHydratedPlanningInput(),
    createNormalizedIntent(),
    executablePlan,
    createCopyPlan(),
    executionSceneSummary,
    createRefineDecision([
      {
        kind: "ensure_cta_container_fallback",
      },
    ]),
    createLastMutationAck(),
    {
      textLayoutHelper: TEXT_LAYOUT_HELPER,
    },
  );

  assert.ok(result.proposal);
  assert.equal(result.proposal?.mutation.commands.length, 1);
  const command = result.proposal?.mutation.commands[0];
  if (!command || !isCreateLayerCommand(command)) {
    throw new Error("CTA fallback createLayer command is required");
  }

  assert.equal(command.layerBlueprint.layerType, "shape");
  assert.equal(command.layerBlueprint.metadata.role, "cta_container");
  assert.equal(command.layerBlueprint.metadata.renderPrimitive, null);
});
