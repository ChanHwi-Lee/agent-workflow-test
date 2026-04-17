import assert from "node:assert/strict";
import test from "node:test";

import type { SceneBindingPlan } from "../types.js";
import { emitAdaptiveCompositionMutations } from "./emitAdaptiveCompositionMutations.js";

function createSceneBindingPlan(overrides: Partial<ReturnType<typeof createSceneBindingPlanBase>> = {}) {
  return {
    ...createSceneBindingPlanBase(),
    ...overrides,
  };
}

function createSceneBindingPlanBase(): SceneBindingPlan {
  return {
    planId: "plan-test",
    runId: "run-test",
    traceId: "trace-test",
    workflowVariant: "object_native_v1" as const,
    selectedTemplateCode: "82945706194",
    selectedTemplateTitle: "도시락 배송받자 인스타",
    backgroundMode: "spring_photo" as const,
    backgroundColorHex: "#ffffff",
    secondaryBackgroundColorHex: null,
    primaryTextColorHex: "#1a1a1a",
    secondaryTextColorHex: "#3f3f46",
    accentTextColorHex: "#ff6a00",
    inverseTextColorHex: "#ffffff",
    promoSurfaceColorHex: "#ff6a00",
    promoTextColorHex: "#ffffff",
    promoTextColorSource: "reference" as const,
    ctaSurfaceColorHex: "#111111",
    ctaTextColorHex: "#ffffff",
    ctaShapeLanguage: "pill" as const,
    preferredDecorationMode: "ribbon_badge" as const,
    preferredAccentDensity: "medium" as const,
    preferredBadgeProminence: "supporting" as const,
    preferredCtaTreatment: "standard" as const,
    motifTags: [],
    includeRibbon: false,
    includeFrame: false,
    summary: "test binding plan",
  };
}

test("emitAdaptiveCompositionMutations expands background-slot images to the full target canvas", () => {
  const batch = emitAdaptiveCompositionMutations({
    runId: "run-test",
    traceId: "trace-test",
    documentId: "document-test",
    pageId: "page-test",
    targetCanvasWidth: 1200,
    targetCanvasHeight: 628,
    projectedGraph: {
      graphId: "graph-test",
      runId: "run-test",
      traceId: "trace-test",
      templateCode: "82945706194",
      templateTitle: "도시락 배송받자 인스타",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 1,
      summary: "test graph",
      objects: [
        {
          objectId: "obj-004",
          layerType: "image",
          bounds: {
            x: 509.56033994121015,
            y: 231.52004815192277,
            width: 274.4025882394111,
            height: 188.0001644197187,
          },
          sourceText: null,
          fontSize: null,
          fillColorHex: "rgb(0,0,0)",
          fontFamily: null,
          fontWeight: null,
          textAlign: null,
          sourceOriginUrl: "https://file.tooldi.com/example.png",
          sourceWidth: 580.125,
          sourceHeight: 397.45833333333326,
          visualWeight: "background",
          zone: "center",
          prominence: 51587.28295827203,
          backingSurfaceObjectId: null,
          backingSurfaceColorHex: null,
          backingSurfaceBounds: null,
          compositeHint: null,
        },
      ],
    },
    compositionDecision: {
      decisionId: "decision-test",
      runId: "run-test",
      traceId: "trace-test",
      templateCode: "82945706194",
      projectedGraphId: "graph-test",
      elementDecisions: [],
      addDecisions: [],
      compositionSummary: "background image should be retained",
    },
    sceneBindingPlan: createSceneBindingPlan(),
  });

  const backgroundCommand = batch.proposals[0]?.mutation.commands.find(
    (
      command,
    ): command is Extract<
      (typeof batch.proposals)[number]["mutation"]["commands"][number],
      { op: "createLayer" }
    > => command.op === "createLayer" && command.executionSlotKey === "background",
  );
  assert.ok(backgroundCommand, "expected a background command");
  assert.deepEqual(backgroundCommand.layerBlueprint.bounds, {
    x: 0,
    y: 0,
    width: 1200,
    height: 628,
  });
});

test("emitAdaptiveCompositionMutations keeps non-background images in their projected bounds", () => {
  const batch = emitAdaptiveCompositionMutations({
    runId: "run-test",
    traceId: "trace-test",
    documentId: "document-test",
    pageId: "page-test",
    targetCanvasWidth: 1200,
    targetCanvasHeight: 628,
    projectedGraph: {
      graphId: "graph-test",
      runId: "run-test",
      traceId: "trace-test",
      templateCode: "82945706194",
      templateTitle: "도시락 배송받자 인스타",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 1,
      summary: "test graph",
      objects: [
        {
          objectId: "obj-004",
          layerType: "image",
          bounds: {
            x: 509.56033994121015,
            y: 231.52004815192277,
            width: 274.4025882394111,
            height: 188.0001644197187,
          },
          sourceText: null,
          fontSize: null,
          fillColorHex: "rgb(0,0,0)",
          fontFamily: null,
          fontWeight: null,
          textAlign: null,
          sourceOriginUrl: "https://file.tooldi.com/example.png",
          sourceWidth: 580.125,
          sourceHeight: 397.45833333333326,
          visualWeight: "tertiary",
          zone: "center",
          prominence: 51587.28295827203,
          backingSurfaceObjectId: null,
          backingSurfaceColorHex: null,
          backingSurfaceBounds: null,
          compositeHint: null,
        },
      ],
    },
    compositionDecision: {
      decisionId: "decision-test",
      runId: "run-test",
      traceId: "trace-test",
      templateCode: "82945706194",
      projectedGraphId: "graph-test",
      elementDecisions: [],
      addDecisions: [],
      compositionSummary: "local image should remain local",
    },
    sceneBindingPlan: createSceneBindingPlan(),
  });

  const imageCommand = batch.proposals[0]?.mutation.commands.find(
    (
      command,
    ): command is Extract<
      (typeof batch.proposals)[number]["mutation"]["commands"][number],
      { op: "createLayer" }
    > => command.op === "createLayer" && command.clientLayerKey === "obj-004_retain_run-test",
  );
  assert.ok(imageCommand, "expected a retained local image command");
  assert.equal(imageCommand.executionSlotKey, null);
  assert.deepEqual(imageCommand.layerBlueprint.bounds, {
    x: 509.56033994121015,
    y: 231.52004815192277,
    width: 274.4025882394111,
    height: 188.0001644197187,
  });
});

test("emitAdaptiveCompositionMutations preserves source fill for plain adaptive headline text", () => {
  const batch = emitAdaptiveCompositionMutations({
    runId: "run-test",
    traceId: "trace-test",
    documentId: "document-test",
    pageId: "page-test",
    targetCanvasWidth: 1200,
    targetCanvasHeight: 628,
    projectedGraph: {
      graphId: "graph-test",
      runId: "run-test",
      traceId: "trace-test",
      templateCode: "82945706194",
      templateTitle: "도시락 배송받자 인스타",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 1,
      summary: "test graph",
      objects: [
        {
          objectId: "obj-010",
          layerType: "text",
          bounds: {
            x: 98.43030782449318,
            y: 93.39629901473711,
            width: 777.4644898857712,
            height: 141.25,
          },
          sourceText: "도시락 싸지 말고",
          fontSize: 108,
          fillColorHex: "#ffffff",
          fontFamily: "869_400",
          fontWeight: 700,
          textAlign: "left",
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
          visualWeight: "dominant",
          zone: "top",
          prominence: 120000,
          backingSurfaceObjectId: null,
          backingSurfaceColorHex: null,
          backingSurfaceBounds: null,
          compositeHint: null,
        },
      ],
    },
    compositionDecision: {
      decisionId: "decision-test",
      runId: "run-test",
      traceId: "trace-test",
      templateCode: "82945706194",
      projectedGraphId: "graph-test",
      elementDecisions: [
        {
          objectId: "obj-010",
          operation: "modify",
          newText: "봄을 한 그릇에 담았습니다,",
          carriesAtomIds: [],
          reason: "헤드라인 교체",
        },
      ],
      addDecisions: [],
      compositionSummary: "headline contrast test",
    },
    sceneBindingPlan: createSceneBindingPlan(),
  });

  const headlineCommand = batch.proposals[0]?.mutation.commands.find(
    (
      command,
    ): command is Extract<
      (typeof batch.proposals)[number]["mutation"]["commands"][number],
      { op: "createLayer" }
    > => command.op === "createLayer" && command.executionSlotKey === "headline",
  );
  assert.ok(headlineCommand, "expected a headline command");
  assert.equal(
    headlineCommand.layerBlueprint.styleTokens?.fillColor,
    "#ffffff",
  );
});

test("emitAdaptiveCompositionMutations keeps template text/shape pairs as separate layers while preserving readable text fill", () => {
  const batch = emitAdaptiveCompositionMutations({
    runId: "run-test",
    traceId: "trace-test",
    documentId: "document-test",
    pageId: "page-test",
    targetCanvasWidth: 1200,
    targetCanvasHeight: 628,
    projectedGraph: {
      graphId: "graph-test",
      runId: "run-test",
      traceId: "trace-test",
      templateCode: "82945706194",
      templateTitle: "도시락 배송받자 인스타",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 2,
      summary: "test graph",
      objects: [
        {
          objectId: "obj-001",
          layerType: "shape",
          bounds: {
            x: 737.4298101146917,
            y: 109.54525808197775,
            width: 414.57018988530837,
            height: 287.36623662216624,
          },
          sourceText: null,
          fontSize: null,
          fillColorHex: "#ffffff",
          fontFamily: null,
          fontWeight: null,
          textAlign: null,
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
          visualWeight: "secondary",
          zone: "right",
          prominence: 120001,
          backingSurfaceObjectId: null,
          backingSurfaceColorHex: null,
          backingSurfaceBounds: null,
          compositeHint: null,
        },
        {
          objectId: "obj-005",
          layerType: "text",
          bounds: {
            x: 851.6297830767444,
            y: 325.62790828322613,
            width: 201.11622967307474,
            height: 25.99,
          },
          sourceText: "도시락 하나 더 받기",
          fontSize: 20,
          fillColorHex: "#68570f",
          fontFamily: "701_400",
          fontWeight: 400,
          textAlign: "center",
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
          visualWeight: "tertiary",
          zone: "right",
          prominence: 7000,
          backingSurfaceObjectId: "obj-001",
          backingSurfaceColorHex: "#ffffff",
          backingSurfaceBounds: {
            x: 737.4298101146917,
            y: 109.54525808197775,
            width: 414.57018988530837,
            height: 287.36623662216624,
          },
          compositeHint: null,
        },
      ],
    },
    compositionDecision: {
      decisionId: "decision-test",
      runId: "run-test",
      traceId: "trace-test",
      templateCode: "82945706194",
      projectedGraphId: "graph-test",
      elementDecisions: [
        {
          objectId: "obj-005",
          operation: "modify",
          newText: "메뉴 확인하기",
          carriesAtomIds: [],
          reason: "CTA text",
        },
      ],
      addDecisions: [],
      compositionSummary: "cta text over retained surface test",
    },
    sceneBindingPlan: createSceneBindingPlan(),
  });

  const textCommand = batch.proposals[0]?.mutation.commands.find(
    (
      command,
    ): command is Extract<
      (typeof batch.proposals)[number]["mutation"]["commands"][number],
      { op: "createLayer" }
    > => command.op === "createLayer" && command.clientLayerKey === "obj-005_modify_run-test",
  );
  assert.ok(textCommand, "expected the modified text command");
  assert.equal(textCommand.layerBlueprint.layerType, "text");
  assert.equal(
    textCommand.layerBlueprint.styleTokens?.fillColor,
    "#68570f",
  );
  const surfaceCommand = batch.proposals[0]?.mutation.commands.find(
    (
      command,
    ): command is Extract<
      (typeof batch.proposals)[number]["mutation"]["commands"][number],
      { op: "createLayer" }
    > => command.op === "createLayer" && command.clientLayerKey === "obj-001_retain_run-test",
  );
  assert.ok(surfaceCommand, "expected the backing surface shape to remain");
  assert.equal(
    surfaceCommand.layerBlueprint.layerType,
    "shape",
  );
});

test("emitAdaptiveCompositionMutations falls back to contrasting text when local backing surface makes the source fill unreadable", () => {
  const batch = emitAdaptiveCompositionMutations({
    runId: "run-test",
    traceId: "trace-test",
    documentId: "document-test",
    pageId: "page-test",
    targetCanvasWidth: 1200,
    targetCanvasHeight: 628,
    projectedGraph: {
      graphId: "graph-test",
      runId: "run-test",
      traceId: "trace-test",
      templateCode: "82945706194",
      templateTitle: "도시락 배송받자 인스타",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 1,
      summary: "test graph",
      objects: [
        {
          objectId: "obj-010",
          layerType: "text",
          bounds: {
            x: 98.43030782449318,
            y: 93.39629901473711,
            width: 777.4644898857712,
            height: 141.25,
          },
          sourceText: "봄을 한 그릇에 담았습니다",
          fontSize: 108,
          fillColorHex: "#ffffff",
          fontFamily: "869_400",
          fontWeight: 700,
          textAlign: "left",
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
          visualWeight: "dominant",
          zone: "top",
          prominence: 120000,
          backingSurfaceObjectId: "obj-surface",
          backingSurfaceColorHex: "#ffffff",
          backingSurfaceBounds: {
            x: 84,
            y: 72,
            width: 840,
            height: 180,
          },
          compositeHint: null,
        },
      ],
    },
    compositionDecision: {
      decisionId: "decision-test",
      runId: "run-test",
      traceId: "trace-test",
      templateCode: "82945706194",
      projectedGraphId: "graph-test",
      elementDecisions: [
        {
          objectId: "obj-010",
          operation: "modify",
          newText: "봄을 한 그릇에 담았습니다,",
          carriesAtomIds: [],
          reason: "헤드라인 교체",
        },
      ],
      addDecisions: [],
      compositionSummary: "headline local surface contrast test",
    },
    sceneBindingPlan: createSceneBindingPlan({
      primaryTextColorHex: "#ffffff",
    }),
  });

  const headlineCommand = batch.proposals[0]?.mutation.commands.find(
    (
      command,
    ): command is Extract<
      (typeof batch.proposals)[number]["mutation"]["commands"][number],
      { op: "createLayer" }
    > => command.op === "createLayer" && command.executionSlotKey === "headline",
  );
  assert.ok(headlineCommand, "expected a headline command");
  assert.equal(headlineCommand.layerBlueprint.layerType, "text");
  assert.equal(headlineCommand.layerBlueprint.styleTokens?.fillColor, "#1a1a1a");
});

test("emitAdaptiveCompositionMutations emits badge additions as compound groups", () => {
  const batch = emitAdaptiveCompositionMutations({
    runId: "run-test",
    traceId: "trace-test",
    documentId: "document-test",
    pageId: "page-test",
    targetCanvasWidth: 1200,
    targetCanvasHeight: 628,
    projectedGraph: {
      graphId: "graph-test",
      runId: "run-test",
      traceId: "trace-test",
      templateCode: "82945706194",
      templateTitle: "도시락 배송받자 인스타",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 0,
      summary: "test graph",
      objects: [],
    },
    compositionDecision: {
      decisionId: "decision-test",
      runId: "run-test",
      traceId: "trace-test",
      templateCode: "82945706194",
      projectedGraphId: "graph-test",
      elementDecisions: [],
      addDecisions: [
        {
          vocabularyId: "badge_chip",
          text: "SPRING SPECIAL",
          placementZone: "top-left",
          carriesAtomIds: [],
          reason: "badge",
        },
      ],
      compositionSummary: "badge add test",
    },
    sceneBindingPlan: createSceneBindingPlan(),
  });

  const badgeCommand = batch.proposals[0]?.mutation.commands.find(
    (
      command,
    ): command is Extract<
      (typeof batch.proposals)[number]["mutation"]["commands"][number],
      { op: "createLayer" }
    > => command.op === "createLayer" && command.executionSlotKey === "badge_text",
  );
  assert.ok(badgeCommand, "expected a badge command");
  assert.equal(badgeCommand.layerBlueprint.layerType, "group");
  assert.equal(badgeCommand.layerBlueprint.styleTokens?.surfaceColor, "#ff6a00");
  assert.equal(badgeCommand.layerBlueprint.styleTokens?.textColor, "#ffffff");
});

test("emitAdaptiveCompositionMutations forwards text sourceAngle and sourceOpacity into styleTokens on retain", () => {
  const batch = emitAdaptiveCompositionMutations({
    runId: "run-test",
    traceId: "trace-test",
    documentId: "document-test",
    pageId: "page-test",
    targetCanvasWidth: 1200,
    targetCanvasHeight: 628,
    projectedGraph: {
      graphId: "graph-test",
      runId: "run-test",
      traceId: "trace-test",
      templateCode: "82945706194",
      templateTitle: "도시락 배송받자 인스타",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 1,
      summary: "test graph",
      objects: [
        {
          objectId: "obj-010",
          layerType: "text",
          bounds: { x: 100, y: 100, width: 800, height: 120 },
          sourceText: "회전된 헤드라인",
          fontSize: 96,
          fillColorHex: "#111111",
          fontFamily: "701_400",
          fontWeight: 700,
          textAlign: "left",
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
          sourceAngle: -8,
          sourceOpacity: 0.85,
          visualWeight: "dominant",
          zone: "top",
          prominence: 96000,
          backingSurfaceObjectId: null,
          backingSurfaceColorHex: null,
          backingSurfaceBounds: null,
          compositeHint: null,
        },
      ],
    },
    compositionDecision: {
      decisionId: "decision-test",
      runId: "run-test",
      traceId: "trace-test",
      templateCode: "82945706194",
      projectedGraphId: "graph-test",
      elementDecisions: [],
      addDecisions: [],
      compositionSummary: "rotated headline retain test",
    },
    sceneBindingPlan: createSceneBindingPlan(),
  });

  const headlineCommand = batch.proposals[0]?.mutation.commands.find(
    (
      command,
    ): command is Extract<
      (typeof batch.proposals)[number]["mutation"]["commands"][number],
      { op: "createLayer" }
    > => command.op === "createLayer" && command.executionSlotKey === "headline",
  );
  assert.ok(headlineCommand, "expected a headline command");
  assert.equal(headlineCommand.layerBlueprint.styleTokens?.angle, -8);
  assert.equal(headlineCommand.layerBlueprint.styleTokens?.opacity, 0.85);
});

test("emitAdaptiveCompositionMutations omits angle/opacity styleTokens when text has identity transform", () => {
  const batch = emitAdaptiveCompositionMutations({
    runId: "run-test",
    traceId: "trace-test",
    documentId: "document-test",
    pageId: "page-test",
    targetCanvasWidth: 1200,
    targetCanvasHeight: 628,
    projectedGraph: {
      graphId: "graph-test",
      runId: "run-test",
      traceId: "trace-test",
      templateCode: "82945706194",
      templateTitle: "도시락 배송받자 인스타",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 1,
      summary: "test graph",
      objects: [
        {
          objectId: "obj-010",
          layerType: "text",
          bounds: { x: 100, y: 100, width: 800, height: 120 },
          sourceText: "일반 텍스트",
          fontSize: 96,
          fillColorHex: "#111111",
          fontFamily: "701_400",
          fontWeight: 700,
          textAlign: "left",
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
          sourceAngle: 0,
          sourceOpacity: 1,
          visualWeight: "dominant",
          zone: "top",
          prominence: 96000,
          backingSurfaceObjectId: null,
          backingSurfaceColorHex: null,
          backingSurfaceBounds: null,
          compositeHint: null,
        },
      ],
    },
    compositionDecision: {
      decisionId: "decision-test",
      runId: "run-test",
      traceId: "trace-test",
      templateCode: "82945706194",
      projectedGraphId: "graph-test",
      elementDecisions: [],
      addDecisions: [],
      compositionSummary: "plain headline retain test",
    },
    sceneBindingPlan: createSceneBindingPlan(),
  });

  const headlineCommand = batch.proposals[0]?.mutation.commands.find(
    (
      command,
    ): command is Extract<
      (typeof batch.proposals)[number]["mutation"]["commands"][number],
      { op: "createLayer" }
    > => command.op === "createLayer" && command.executionSlotKey === "headline",
  );
  assert.ok(headlineCommand, "expected a headline command");
  assert.equal(headlineCommand.layerBlueprint.styleTokens?.angle, undefined);
  assert.equal(headlineCommand.layerBlueprint.styleTokens?.opacity, undefined);
});

test("emitAdaptiveCompositionMutations forwards text sourceAngle/sourceOpacity on modify", () => {
  const batch = emitAdaptiveCompositionMutations({
    runId: "run-test",
    traceId: "trace-test",
    documentId: "document-test",
    pageId: "page-test",
    targetCanvasWidth: 1200,
    targetCanvasHeight: 628,
    projectedGraph: {
      graphId: "graph-test",
      runId: "run-test",
      traceId: "trace-test",
      templateCode: "82945706194",
      templateTitle: "도시락 배송받자 인스타",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 1,
      summary: "test graph",
      objects: [
        {
          objectId: "obj-010",
          layerType: "text",
          bounds: { x: 100, y: 100, width: 800, height: 120 },
          sourceText: "기존 헤드라인",
          fontSize: 96,
          fillColorHex: "#111111",
          fontFamily: "701_400",
          fontWeight: 700,
          textAlign: "left",
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
          sourceAngle: 12,
          sourceOpacity: 0.75,
          visualWeight: "dominant",
          zone: "top",
          prominence: 96000,
          backingSurfaceObjectId: null,
          backingSurfaceColorHex: null,
          backingSurfaceBounds: null,
          compositeHint: null,
        },
      ],
    },
    compositionDecision: {
      decisionId: "decision-test",
      runId: "run-test",
      traceId: "trace-test",
      templateCode: "82945706194",
      projectedGraphId: "graph-test",
      elementDecisions: [
        {
          objectId: "obj-010",
          operation: "modify",
          newText: "봄 한정",
          carriesAtomIds: [],
          reason: "replace copy",
        },
      ],
      addDecisions: [],
      compositionSummary: "rotated headline modify test",
    },
    sceneBindingPlan: createSceneBindingPlan(),
  });

  const headlineCommand = batch.proposals[0]?.mutation.commands.find(
    (
      command,
    ): command is Extract<
      (typeof batch.proposals)[number]["mutation"]["commands"][number],
      { op: "createLayer" }
    > => command.op === "createLayer" && command.executionSlotKey === "headline",
  );
  assert.ok(headlineCommand, "expected a headline command");
  assert.equal(headlineCommand.layerBlueprint.styleTokens?.angle, 12);
  assert.equal(headlineCommand.layerBlueprint.styleTokens?.opacity, 0.75);
});
