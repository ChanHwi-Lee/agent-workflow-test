import assert from "node:assert/strict";
import test from "node:test";

import { buildReferenceCompositionV2 } from "./buildReferenceCompositionV2.js";
import type {
  CopyPlan,
  HydratedPlanningInput,
  SceneBindingPlan,
  SceneStylePlan,
  TemplatePriorBundle,
} from "../types.js";

function createHydratedInput(): HydratedPlanningInput {
  return {
    job: {
      messageVersion: "v1",
      runId: "run-1",
      traceId: "trace-1",
      queueJobId: "queue-1",
      attemptSeq: 1,
      priority: "interactive",
      requestRef: "request-ref-1",
      snapshotRef: "snapshot-ref-1",
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      pageLockToken: "page-lock-1",
      cancelToken: "cancel-1",
    },
    request: {
      clientRequestId: "client-1",
      editorSessionId: "editor-session-1",
      surface: "toolditor",
      workflowVariant: "retrieval_prior_v2" as any,
      userInput: {
        prompt: "봄 세일 광고를 만들어줘",
        locale: "ko-KR",
        timezone: "Asia/Seoul",
      },
      editorContext: {
        documentId: "doc-1",
        pageId: "page-1",
        canvasState: "empty",
        canvasWidth: 1200,
        canvasHeight: 628,
        sizeSerial: "1200x628@1",
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
    },
    snapshot: {
      editorContext: {
        documentId: "doc-1",
        pageId: "page-1",
        canvasState: "empty",
        canvasWidth: 1200,
        canvasHeight: 628,
        sizeSerial: "1200x628@1",
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
    },
    requestRef: "request-ref-1",
    snapshotRef: "snapshot-ref-1",
    repairContext: null,
  } as HydratedPlanningInput;
}

function createCopyPlan(): CopyPlan {
  return {
    planId: "copy-plan-1",
    runId: "run-1",
    traceId: "trace-1",
    plannerMode: "langchain",
    source: "langchain",
    slots: [
      { key: "headline", text: "설레는 봄 할인전", priority: "primary", required: true, maxLength: 28, toneHint: "promotional" },
      { key: "subheadline", text: "지금 바로 확인하세요", priority: "secondary", required: false, maxLength: 36, toneHint: "informational" },
      { key: "offer_line", text: "전제품 최대 30%", priority: "primary", required: false, maxLength: 20, toneHint: "urgent" },
      { key: "cta", text: "혜택 보기", priority: "secondary", required: false, maxLength: 18, toneHint: "promotional" },
      { key: "footer_note", text: "재고 소진 시 조기 종료", priority: "utility", required: false, maxLength: 36, toneHint: "informational" },
    ],
    primaryMessage: "설레는 봄 할인전",
    summary: "copy plan",
  };
}

function createSceneStylePlan(): SceneStylePlan {
  return {
    planId: "style-plan-1",
    runId: "run-1",
    traceId: "trace-1",
    workflowVariant: "retrieval_prior_v2",
    selectedTemplateCode: "19046887349",
    selectedTemplateTitle: "봄맞이 할인 이벤트 광고",
    backgroundKind: "gradient",
    palettePolicy: {
      backgroundColorHex: "#6c9b36",
      secondaryBackgroundColorHex: "#81dc47",
      primaryTextColorHex: "#ffffff",
      secondaryTextColorHex: "#ffffff",
      accentColorHex: "#6bd357",
      ctaSurfaceColorHex: "#6bd357",
      ctaTextColorHex: "#ffffff",
    },
    typographyPolicy: {
      templateFontFamily: "1292_400",
      categoryHints: ["고딕"],
      tone: "rounded",
      displayWeightTarget: 800,
      bodyWeightTarget: 500,
      summary: "style",
    },
    motifTags: ["abstract"],
    ctaShapeLanguage: "transparent_band",
    badgeLikeTreatment: true,
    summary: "style",
  };
}

function createSceneBindingPlan(): SceneBindingPlan {
  return {
    planId: "binding-plan-1",
    runId: "run-1",
    traceId: "trace-1",
    workflowVariant: "retrieval_prior_v2",
    selectedTemplateCode: "19046887349",
    selectedTemplateTitle: "봄맞이 할인 이벤트 광고",
    backgroundMode: "pastel_gradient",
    backgroundColorHex: "#6c9b36",
    secondaryBackgroundColorHex: "#81dc47",
    primaryTextColorHex: "#ffffff",
    secondaryTextColorHex: "#ffffff",
    accentTextColorHex: "#6bd357",
    inverseTextColorHex: "#ffffff",
    ctaSurfaceColorHex: "#6bd357",
    ctaTextColorHex: "#ffffff",
    ctaShapeLanguage: "transparent_band",
    preferredDecorationMode: "promo_multi_graphic",
    preferredAccentDensity: "medium",
    preferredBadgeProminence: "supporting",
    preferredCtaTreatment: "framed",
    motifTags: ["abstract"],
    includeRibbon: false,
    includeFrame: false,
    summary: "binding",
  };
}

function createTemplatePriorBundle(withParsedPage = true): TemplatePriorBundle {
  return {
    bundleId: "bundle-1",
    runId: "run-1",
    traceId: "trace-1",
    workflowVariant: "retrieval_prior_v2",
    query: {
      keyword: "봄",
      canvas: "horizontal",
      requestedTopK: 3,
    },
    queryPlan: [{ label: "season_primary", keyword: "봄" }],
    usedFallbackToLegacy: false,
    fallbackReason: null,
    selectedTemplateCode: "19046887349",
    selectedTemplateTitle: "봄맞이 할인 이벤트 광고",
    selectedScaffold: {
      scaffoldId: "scaffold-1",
      sourceTemplateCode: "19046887349",
      sourceTemplateSerial: "39754",
      title: "봄맞이 할인 이벤트 광고",
      canvasWidth: 1200,
      canvasHeight: 628,
      backgroundMode: "gradient",
      textObjectCount: 5,
      visualObjectCount: 5,
      groupObjectCount: 1,
      dominantObjectTypes: ["textbox", "rect", "image"],
      copyAnchor: "left",
      visualAnchor: "center",
      layoutFamilyHint: "promo_badge",
      layoutModeHint: "badge_promo_stack",
      primaryVisualFamilyHint: "graphic",
      summary: "scaffold",
    },
    candidates: [
      {
        rank: 1,
        score: 0.94,
        deterministicScore: 0.93,
        geminiScore: 0.98,
        keep: true,
        keepReason: "best",
        rejectReason: null,
        matchedQueryLabels: ["season_primary"],
        templateAssetId: "template:39754",
        templateSerial: "39754",
        templateCode: "19046887349",
        title: "봄맞이 할인 이벤트 광고",
        categoryName: "소셜미디어 광고",
        width: 1200,
        height: 628,
        pages: 1,
        keywordTokens: ["봄", "할인", "이벤트"],
        thumbnailUrl: "https://dev-file.tooldi.com/template_upload/13/418/8397425.png",
        traceId: "trace-asset-1",
        fetchedDocument: withParsedPage
          ? {
              code: "19046887349",
              metaData: {
                code: "19046887349",
                innerCode: "134188397425",
                title: "봄맞이 할인 이벤트 광고",
                width: "1200",
                height: "628",
                sizeUnit: "px",
                isShare: false,
                userId: "tester",
                createdAt: "2025-03-20 18:05:57",
                modifiedAt: "2025-03-20 18:05:57",
                keyword: "",
              },
              canvas: {
                serial: "7",
                title: "소셜미디어 광고",
                width: "1200",
                height: "628",
                sizeUnit: "px",
              },
              pages: [
                {
                  index: 0,
                  raw: "{}",
                  pattern: null,
                  parsed: {
                    width: 1200,
                    height: 628,
                    objects: [
                      { type: "textbox", left_from_zero: 84, top_from_zero: 58, width: 180, height: 24, fontSize: 22, fontWeight: 500, fontFamily: "1212_500", fill: "#ffffff", textAlign: "left", text: "SPRING SALE", scaleX: 1, scaleY: 1 },
                      { type: "textbox", originX: "center", originY: "top", left_from_zero: 600, top_from_zero: 84, width: 220, height: 26, fontSize: 20, fontWeight: 400, fontFamily: "1212_400", fill: "#fff7b0", textAlign: "center", text: "4.1 ~ 4.16", scaleX: 1, scaleY: 1 },
                      { type: "rect", originX: "center", originY: "top", left_from_zero: 300, top_from_zero: 134, width: 420, height: 64, rx: 24, ry: 24, fill: "#fff59c", scaleX: 1, scaleY: 1 },
                      { type: "textbox", left_from_zero: 110, top_from_zero: 146, width: 372, height: 40, fontSize: 48, fontWeight: 400, fontFamily: "1212_400", fill: "#0f966e", textAlign: "center", text: "전제품 최대 30%", scaleX: 1, scaleY: 1 },
                      { type: "textbox", originX: "center", originY: "top", left_from_zero: 406, top_from_zero: 250, width: 420, height: 144, fontSize: 132, fontWeight: 400, fontFamily: "1292_400", fill: "#ffffff", textAlign: "left", text: "할인해", scaleX: 1, scaleY: 1 },
                      { type: "textbox", originX: "center", originY: "top", left_from_zero: 860, top_from_zero: 166, width: 280, height: 220, fontSize: 220, fontWeight: 400, fontFamily: "1292_400", fill: "#ffffff", textAlign: "center", text: "봄", scaleX: 1, scaleY: 1 },
                      { type: "rect", originX: "center", originY: "top", left_from_zero: 600, top_from_zero: 506, width: 760, height: 40, rx: 16, ry: 16, opacity: 0.18, fill: "#84f05b", scaleX: 1, scaleY: 1 },
                      { type: "rect", originX: "center", originY: "top", left_from_zero: 600, top_from_zero: 510, width: 720, height: 72, rx: 18, ry: 18, opacity: 0.38, fill: "#6bd357", scaleX: 1, scaleY: 1 },
                      { type: "textbox", originX: "center", originY: "top", left_from_zero: 600, top_from_zero: 526, width: 360, height: 36, fontSize: 37, fontWeight: 500, fontFamily: "1212_500", fill: "#0f7035", textAlign: "center", text: "지금 바로 확인하러 가기 ▶", scaleX: 1, scaleY: 1 },
                      { type: "textbox", left_from_zero: 360, top_from_zero: 596, width: 480, height: 20, fontSize: 18, fontWeight: 400, fontFamily: "1212_400", fill: "#ffffff", textAlign: "center", text: "재고 소진 시 조기 종료", scaleX: 1, scaleY: 1 },
                      { type: "rect", left_from_zero: 52, top_from_zero: 74, width: 134, height: 292, rx: 54, ry: 54, opacity: 0.96, fill: "#081403", scaleX: 1, scaleY: 1 },
                      { type: "image", left_from_zero: 980, top_from_zero: 74, width: 120, height: 120, scaleX: 1, scaleY: 1, fill: "transparent" },
                    ],
                  },
                },
              ],
            }
          : null,
        scaffold: null,
      },
    ],
    summary: "bundle",
  };
}

test("buildReferenceCompositionV2 creates stable freeform blocks from primary reference", () => {
  const result = buildReferenceCompositionV2(
    createHydratedInput(),
    createTemplatePriorBundle(true),
    createCopyPlan(),
    createSceneStylePlan(),
    createSceneBindingPlan(),
  );

  assert.equal(result.referenceCompositionGraph?.compositionStatus, "stable");
  assert.equal(result.styleDowngradeVerdict?.applied, false);
  assert.ok(result.templateRemixPlan);
  assert.ok((result.freeformLayoutPlan?.copyBlocks.length ?? 0) >= 4);
  assert.equal(
    result.referenceCompositionGraph?.blocks.some(
      (block) => block.sourceText === "SPRING SALE" || block.sourceText === "4.1 ~ 4.16",
    ),
    false,
  );
  assert.equal(
    result.copyBindingPlan?.assignments.some((assignment) => assignment.bindingKind === "split"),
    false,
  );
  assert.equal(
    result.copyBindingPlan?.assignments.filter(
      (assignment) => assignment.executionSlotKey === "headline" && assignment.text,
    ).length,
    1,
  );
  assert.equal(
    result.freeformLayoutPlan?.copyBlocks.some(
      (block) => block.layerType === "group" && block.executionSlotKey === "cta",
    ),
    true,
  );
  assert.equal(
    result.freeformLayoutPlan?.polishBlocks.some(
      (block) => block.bounds.width >= 500 && block.bounds.height <= 90,
    ),
    false,
  );
  assert.equal(
    result.freeformLayoutPlan?.polishBlocks.some(
      (block) => block.layerType === 'image',
    ),
    false,
  );
  assert.equal(
    result.freeformLayoutPlan?.polishBlocks.some(
      (block) =>
        block.layerType === 'shape' &&
        block.bounds.width >= 120 &&
        block.bounds.height >= 250,
    ),
    false,
  );
  assert.equal(
    result.freeformLayoutPlan?.copyBlocks.every(
      (block) =>
        block.bounds.x >= 0 &&
        block.bounds.y >= 0 &&
        block.bounds.x + block.bounds.width <= 1200 &&
        block.bounds.y + block.bounds.height <= 628,
    ),
    true,
  );
});

test("buildReferenceCompositionV2 stays in v2 and downgrades to style-only when no parsed page exists", () => {
  const result = buildReferenceCompositionV2(
    createHydratedInput(),
    createTemplatePriorBundle(false),
    createCopyPlan(),
    createSceneStylePlan(),
    createSceneBindingPlan(),
  );

  assert.equal(result.referenceCompositionGraph, null);
  assert.equal(result.styleDowngradeVerdict?.applied, true);
  assert.equal(result.freeformLayoutPlan?.compositionStatus, "style_only");
  assert.ok((result.freeformLayoutPlan?.copyBlocks.length ?? 0) > 0);
});
