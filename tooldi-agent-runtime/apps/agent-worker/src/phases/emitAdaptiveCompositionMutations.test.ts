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
    // Dark scene background so the white source fill stays readable and is preserved
    sceneBindingPlan: createSceneBindingPlan({ backgroundColorHex: "#1a1a1a" }),
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

test("emitAdaptiveCompositionMutations synthesizes a background shape when the projected graph has no background and sceneBindingPlan is present", () => {
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
          sourceText: "헤드라인",
          fontSize: 96,
          fillColorHex: "#ffffff",
          fontFamily: "701_400",
          fontWeight: 700,
          textAlign: "left",
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
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
      compositionSummary: "background synthesis test",
    },
    sceneBindingPlan: createSceneBindingPlan({
      backgroundMode: "generated_solid",
      backgroundColorHex: "#6aa84f",
    }),
  });

  const commands = batch.proposals[0]?.mutation.commands ?? [];
  const backgroundCommand = commands.find(
    (
      command,
    ): command is Extract<(typeof commands)[number], { op: "createLayer" }> =>
      command.op === "createLayer" && command.executionSlotKey === "background",
  );
  assert.ok(backgroundCommand, "expected a synthesized background command");
  assert.equal(backgroundCommand.layerBlueprint.layerType, "shape");
  assert.deepEqual(backgroundCommand.layerBlueprint.bounds, {
    x: 0,
    y: 0,
    width: 1200,
    height: 628,
  });
  assert.equal(
    backgroundCommand.layerBlueprint.styleTokens?.fillColor,
    "#6aa84f",
  );
  // Background must be rendered first (bottom z-order)
  assert.equal(commands[0]?.clientLayerKey, backgroundCommand.clientLayerKey);
});

test("emitAdaptiveCompositionMutations does not synthesize a background when the projected graph already has one", () => {
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
          objectId: "obj-bg",
          layerType: "image",
          bounds: { x: 0, y: 0, width: 1200, height: 628 },
          sourceText: null,
          fontSize: null,
          fillColorHex: null,
          fontFamily: null,
          fontWeight: null,
          textAlign: null,
          sourceOriginUrl: "https://file.tooldi.com/bg.png",
          sourceWidth: 1200,
          sourceHeight: 628,
          visualWeight: "background",
          zone: "full",
          prominence: 753600,
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
      compositionSummary: "no synthesis when template has background",
    },
    sceneBindingPlan: createSceneBindingPlan({
      backgroundMode: "generated_solid",
      backgroundColorHex: "#6aa84f",
    }),
  });

  const commands = batch.proposals[0]?.mutation.commands ?? [];
  const backgroundCommands = commands.filter(
    (command) =>
      command.op === "createLayer" && command.executionSlotKey === "background",
  );
  assert.equal(
    backgroundCommands.length,
    1,
    "only the template's background should be emitted",
  );
  const retained = backgroundCommands[0];
  assert.ok(retained && retained.op === "createLayer");
  // Retained from obj-bg, not the synthesis prefix
  assert.ok(retained.clientLayerKey?.startsWith("obj-bg"));
});

test("emitAdaptiveCompositionMutations passes pastel_gradient backgroundVisualMode when sceneBindingPlan requests gradient", () => {
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
      templateTitle: "test",
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
      addDecisions: [],
      compositionSummary: "gradient bg synthesis",
    },
    sceneBindingPlan: createSceneBindingPlan({
      backgroundMode: "pastel_gradient",
      backgroundColorHex: "#ffd1dc",
      secondaryBackgroundColorHex: "#ffffff",
    }),
  });

  const commands = batch.proposals[0]?.mutation.commands ?? [];
  const backgroundCommand = commands.find(
    (command) =>
      command.op === "createLayer" && command.executionSlotKey === "background",
  );
  assert.ok(backgroundCommand && backgroundCommand.op === "createLayer");
  assert.equal(
    backgroundCommand.layerBlueprint.styleTokens?.backgroundVisualMode,
    "pastel_gradient",
  );
  assert.equal(
    backgroundCommand.layerBlueprint.styleTokens?.secondaryColor,
    "#ffffff",
  );
});

test("emitAdaptiveCompositionMutations overrides unreadable text fill when contrast against the scene background is insufficient", () => {
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
      templateTitle: "test",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 1,
      summary: "test graph",
      objects: [
        {
          objectId: "obj-headline",
          layerType: "text",
          bounds: { x: 100, y: 100, width: 800, height: 120 },
          sourceText: "보이지 않던 헤드라인",
          fontSize: 96,
          fillColorHex: "#ffffff",
          fontFamily: "701_400",
          fontWeight: 700,
          textAlign: "left",
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
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
      compositionSummary: "scene contrast fallback",
    },
    // Scene background is white; white headline must be overridden
    sceneBindingPlan: createSceneBindingPlan({
      backgroundMode: "generated_solid",
      backgroundColorHex: "#ffffff",
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
  const fillColor = headlineCommand.layerBlueprint.styleTokens?.fillColor;
  assert.ok(fillColor && fillColor !== "#ffffff", `expected non-white fill, got ${fillColor}`);
});

test("emitAdaptiveCompositionMutations preserves a readable source text fill when contrast against the scene background is sufficient", () => {
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
      templateTitle: "test",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 1,
      summary: "test graph",
      objects: [
        {
          objectId: "obj-headline",
          layerType: "text",
          bounds: { x: 100, y: 100, width: 800, height: 120 },
          sourceText: "잘 보이는 헤드라인",
          fontSize: 96,
          fillColorHex: "#ffffff",
          fontFamily: "701_400",
          fontWeight: 700,
          textAlign: "left",
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
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
      compositionSummary: "scene contrast preserve",
    },
    sceneBindingPlan: createSceneBindingPlan({
      backgroundMode: "generated_solid",
      backgroundColorHex: "#111111",
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
  assert.equal(
    headlineCommand.layerBlueprint.styleTokens?.fillColor,
    "#ffffff",
    "white text on dark scene background should be preserved",
  );
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

test("emitAdaptiveCompositionMutations overrides a white decorative shape fill when it collides with a white scene background", () => {
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
      templateTitle: "식당 계절메뉴",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 1,
      summary: "test graph",
      objects: [
        {
          objectId: "obj-001",
          layerType: "shape",
          // rotated decorative shape ≈ 414×287, area ratio ≈ 0.158 of 1200×628
          bounds: { x: 737, y: 109, width: 414, height: 287 },
          sourceText: null,
          fontSize: null,
          fillColorHex: "#ffffff",
          fontFamily: null,
          fontWeight: null,
          textAlign: null,
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
          sourceAngle: 90,
          sourceOpacity: 1,
          visualWeight: "secondary",
          zone: "right",
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
      elementDecisions: [],
      addDecisions: [],
      compositionSummary: "white-on-white shape readability test",
    },
    // Scene background synthesized white → decorative white shape must be recolored
    sceneBindingPlan: createSceneBindingPlan({
      backgroundMode: "generated_solid",
      backgroundColorHex: "#ffffff",
    }),
  });

  const shapeCommand = batch.proposals[0]?.mutation.commands.find(
    (
      command,
    ): command is Extract<
      (typeof batch.proposals)[number]["mutation"]["commands"][number],
      { op: "createLayer" }
    > => command.op === "createLayer" && command.clientLayerKey === "obj-001_retain_run-test",
  );
  assert.ok(shapeCommand, "expected a retained shape command");
  const fillColor = shapeCommand.layerBlueprint.styleTokens?.fillColor;
  assert.ok(
    typeof fillColor === "string" && fillColor.toLowerCase() !== "#ffffff",
    `expected non-white fallback fill for white-on-white decorative shape, got ${fillColor}`,
  );
});

test("emitAdaptiveCompositionMutations preserves a shape that another text references as its backing surface, even when contrast with the scene background is low", () => {
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
      templateTitle: "식당 계절메뉴",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 2,
      summary: "test graph",
      objects: [
        {
          objectId: "obj-panel",
          layerType: "shape",
          // Large panel on a white scene background (low contrast)
          bounds: { x: 100, y: 100, width: 600, height: 300 },
          sourceText: null,
          fontSize: null,
          fillColorHex: "#ffffff",
          fontFamily: null,
          fontWeight: null,
          textAlign: null,
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
          sourceAngle: 0,
          sourceOpacity: 1,
          visualWeight: "secondary",
          zone: "center",
          prominence: 180000,
          backingSurfaceObjectId: null,
          backingSurfaceColorHex: null,
          backingSurfaceBounds: null,
          compositeHint: null,
        },
        {
          objectId: "obj-cta-text",
          layerType: "text",
          bounds: { x: 150, y: 180, width: 500, height: 80 },
          sourceText: "메뉴 확인하기",
          fontSize: 48,
          fillColorHex: "#1a1a1a",
          fontFamily: "701_400",
          fontWeight: 700,
          textAlign: "center",
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
          sourceAngle: 0,
          sourceOpacity: 1,
          visualWeight: "tertiary",
          zone: "center",
          prominence: 20000,
          // Text resolves readability against #ffffff panel — preserving
          // #1a1a1a. If we silently recolored the panel, the text/panel
          // pair would become incoherent.
          backingSurfaceObjectId: "obj-panel",
          backingSurfaceColorHex: "#ffffff",
          backingSurfaceBounds: { x: 100, y: 100, width: 600, height: 300 },
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
      compositionSummary: "backing-surface shape must survive scene readability gate",
    },
    sceneBindingPlan: createSceneBindingPlan({
      backgroundMode: "generated_solid",
      backgroundColorHex: "#ffffff",
    }),
  });

  const panelCommand = batch.proposals[0]?.mutation.commands.find(
    (
      command,
    ): command is Extract<
      (typeof batch.proposals)[number]["mutation"]["commands"][number],
      { op: "createLayer" }
    > => command.op === "createLayer" && command.clientLayerKey === "obj-panel_retain_run-test",
  );
  assert.ok(panelCommand, "expected a retained panel command");
  assert.equal(
    panelCommand.layerBlueprint.styleTokens?.fillColor,
    "#ffffff",
    "panel used as a text backing surface must not be recolored",
  );
  const textCommand = batch.proposals[0]?.mutation.commands.find(
    (
      command,
    ): command is Extract<
      (typeof batch.proposals)[number]["mutation"]["commands"][number],
      { op: "createLayer" }
    > => command.op === "createLayer" && command.clientLayerKey === "obj-cta-text_retain_run-test",
  );
  assert.ok(textCommand, "expected a retained text command");
  assert.equal(
    textCommand.layerBlueprint.styleTokens?.fillColor,
    "#1a1a1a",
    "text readability stays coherent against the preserved panel",
  );
});

test("emitAdaptiveCompositionMutations preserves a decorative shape fill that already contrasts with the scene background", () => {
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
      templateTitle: "식당 계절메뉴",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 1,
      summary: "test graph",
      objects: [
        {
          objectId: "obj-001",
          layerType: "shape",
          bounds: { x: 737, y: 109, width: 414, height: 287 },
          sourceText: null,
          fontSize: null,
          fillColorHex: "#ffffff",
          fontFamily: null,
          fontWeight: null,
          textAlign: null,
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
          sourceAngle: 90,
          sourceOpacity: 1,
          visualWeight: "secondary",
          zone: "right",
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
      elementDecisions: [],
      addDecisions: [],
      compositionSummary: "white on dark scene preserves shape fill",
    },
    sceneBindingPlan: createSceneBindingPlan({
      backgroundMode: "generated_solid",
      backgroundColorHex: "#111111",
    }),
  });

  const shapeCommand = batch.proposals[0]?.mutation.commands.find(
    (
      command,
    ): command is Extract<
      (typeof batch.proposals)[number]["mutation"]["commands"][number],
      { op: "createLayer" }
    > => command.op === "createLayer" && command.clientLayerKey === "obj-001_retain_run-test",
  );
  assert.ok(shapeCommand, "expected a retained shape command");
  assert.equal(
    shapeCommand.layerBlueprint.styleTokens?.fillColor,
    "#ffffff",
    "white decorative shape on dark scene background should keep its fill",
  );
});

test("emitAdaptiveCompositionMutations preserves a gradient decorative shape even when it matches the scene background", () => {
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
      templateTitle: "식당 계절메뉴",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 1,
      summary: "test graph",
      objects: [
        {
          objectId: "obj-001",
          layerType: "shape",
          bounds: { x: 737, y: 109, width: 414, height: 287 },
          sourceText: null,
          fontSize: null,
          fillColorHex: "#ffffff",
          // presence of secondaryFillColorHex flags the shape as gradient/compound
          secondaryFillColorHex: "#f6f6f6",
          fontFamily: null,
          fontWeight: null,
          textAlign: null,
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
          sourceAngle: 0,
          sourceOpacity: 1,
          visualWeight: "secondary",
          zone: "right",
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
      elementDecisions: [],
      addDecisions: [],
      compositionSummary: "gradient shape preservation test",
    },
    sceneBindingPlan: createSceneBindingPlan({
      backgroundMode: "generated_solid",
      backgroundColorHex: "#ffffff",
    }),
  });

  const shapeCommand = batch.proposals[0]?.mutation.commands.find(
    (
      command,
    ): command is Extract<
      (typeof batch.proposals)[number]["mutation"]["commands"][number],
      { op: "createLayer" }
    > => command.op === "createLayer" && command.clientLayerKey === "obj-001_retain_run-test",
  );
  assert.ok(shapeCommand, "expected a retained shape command");
  assert.equal(
    shapeCommand.layerBlueprint.styleTokens?.fillColor,
    "#ffffff",
    "gradient shape should keep its source fill even when contrast is low",
  );
  assert.equal(
    shapeCommand.layerBlueprint.styleTokens?.secondaryColor,
    "#f6f6f6",
  );
});

test("emitAdaptiveCompositionMutations preserves a subtle low-opacity decorative shape", () => {
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
      templateTitle: "식당 계절메뉴",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 1,
      summary: "test graph",
      objects: [
        {
          objectId: "obj-001",
          layerType: "shape",
          bounds: { x: 737, y: 109, width: 414, height: 287 },
          sourceText: null,
          fontSize: null,
          fillColorHex: "#ffffff",
          fontFamily: null,
          fontWeight: null,
          textAlign: null,
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
          sourceAngle: 0,
          sourceOpacity: 0.3,
          visualWeight: "secondary",
          zone: "right",
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
      elementDecisions: [],
      addDecisions: [],
      compositionSummary: "subtle alpha overlay preservation test",
    },
    sceneBindingPlan: createSceneBindingPlan({
      backgroundMode: "generated_solid",
      backgroundColorHex: "#ffffff",
    }),
  });

  const shapeCommand = batch.proposals[0]?.mutation.commands.find(
    (
      command,
    ): command is Extract<
      (typeof batch.proposals)[number]["mutation"]["commands"][number],
      { op: "createLayer" }
    > => command.op === "createLayer" && command.clientLayerKey === "obj-001_retain_run-test",
  );
  assert.ok(shapeCommand, "expected a retained shape command");
  assert.equal(
    shapeCommand.layerBlueprint.styleTokens?.fillColor,
    "#ffffff",
    "low-opacity decorative overlay should keep its source fill",
  );
});

test("emitAdaptiveCompositionMutations skips the shape readability fallback when the shape area is tiny", () => {
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
      templateTitle: "식당 계절메뉴",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 1,
      summary: "test graph",
      objects: [
        {
          objectId: "obj-001",
          layerType: "shape",
          // area ratio ≈ 0.0033 << 0.03 threshold
          bounds: { x: 10, y: 10, width: 60, height: 40 },
          sourceText: null,
          fontSize: null,
          fillColorHex: "#ffffff",
          fontFamily: null,
          fontWeight: null,
          textAlign: null,
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
          sourceAngle: 0,
          sourceOpacity: 1,
          visualWeight: "tertiary",
          zone: "top-left",
          prominence: 2400,
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
      compositionSummary: "tiny shape skip test",
    },
    sceneBindingPlan: createSceneBindingPlan({
      backgroundMode: "generated_solid",
      backgroundColorHex: "#ffffff",
    }),
  });

  const shapeCommand = batch.proposals[0]?.mutation.commands.find(
    (
      command,
    ): command is Extract<
      (typeof batch.proposals)[number]["mutation"]["commands"][number],
      { op: "createLayer" }
    > => command.op === "createLayer" && command.clientLayerKey === "obj-001_retain_run-test",
  );
  assert.ok(shapeCommand, "expected a retained shape command");
  assert.equal(
    shapeCommand.layerBlueprint.styleTokens?.fillColor,
    "#ffffff",
    "small decorative shape area should not trigger readability override",
  );
});

test("emitAdaptiveCompositionMutations normalizes rgba(...) shape fills so the blend-with-surface gate fires identically to #hex", () => {
  // Templates occasionally emit fillColorHex as "rgba(255, 255, 255, 1)".
  // Without color normalization the luminance math yields NaN and the gate
  // silently misfires. This test locks the rgba parity against a white
  // scene (the blend-with-surface case the handoff explicitly calls out).
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
      templateTitle: "식당 계절메뉴",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 1,
      summary: "test graph",
      objects: [
        {
          objectId: "obj-001",
          layerType: "shape",
          bounds: { x: 737, y: 109, width: 414, height: 287 },
          sourceText: null,
          fontSize: null,
          fillColorHex: "rgba(255, 255, 255, 1)",
          fontFamily: null,
          fontWeight: null,
          textAlign: null,
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
          sourceAngle: 90,
          sourceOpacity: 1,
          visualWeight: "secondary",
          zone: "right",
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
      elementDecisions: [],
      addDecisions: [],
      compositionSummary: "rgba parity test",
    },
    sceneBindingPlan: createSceneBindingPlan({
      backgroundMode: "generated_solid",
      backgroundColorHex: "#ffffff",
    }),
  });

  const shapeCommand = batch.proposals[0]?.mutation.commands.find(
    (
      command,
    ): command is Extract<
      (typeof batch.proposals)[number]["mutation"]["commands"][number],
      { op: "createLayer" }
    > => command.op === "createLayer" && command.clientLayerKey === "obj-001_retain_run-test",
  );
  assert.ok(shapeCommand, "expected a retained shape command");
  const fillColor = shapeCommand.layerBlueprint.styleTokens?.fillColor;
  assert.ok(
    typeof fillColor === "string" && fillColor.toLowerCase() !== "#ffffff" && fillColor !== "rgba(255, 255, 255, 1)",
    `expected the rgba shape to be recolored just like the hex case, got ${fillColor}`,
  );
});

test("emitAdaptiveCompositionMutations does NOT recolor a retained shape just because its fill matches the scene's primary text color", () => {
  // Negative guard against a past over-correction: when the shape has ample
  // contrast against scene/backing (blend-with-surface gate does not fire)
  // and projection has NOT annotated any overlap evidence, L4 must preserve
  // the shape even if its color happens to match the scene's dominant text.
  // Overlap inference is the projection/annotation layer's job, not L4's.
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
      templateTitle: "식당 계절메뉴",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 2,
      summary: "test graph",
      objects: [
        {
          // Large white decorative shape on green scene. Contrast vs scene is
          // 2.88 (above 1.5 threshold) so blend-with-surface does NOT fire.
          objectId: "obj-decor",
          layerType: "shape",
          bounds: { x: 737, y: 109, width: 414, height: 287 },
          sourceText: null,
          fontSize: null,
          fillColorHex: "#ffffff",
          fontFamily: null,
          fontWeight: null,
          textAlign: null,
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
          sourceAngle: 0,
          sourceOpacity: 1,
          visualWeight: "secondary",
          zone: "right",
          prominence: 120000,
          backingSurfaceObjectId: null,
          backingSurfaceColorHex: null,
          backingSurfaceBounds: null,
          compositeHint: null,
        },
        {
          // A separate white-text headline object elsewhere on the canvas.
          // Critically it does NOT reference obj-decor as its backing surface,
          // so no overlap evidence exists at this layer.
          objectId: "obj-headline",
          layerType: "text",
          bounds: { x: 100, y: 100, width: 500, height: 120 },
          sourceText: "헤드라인",
          fontSize: 96,
          fillColorHex: "#ffffff",
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
      compositionSummary: "no global recolor without overlap evidence",
    },
    sceneBindingPlan: createSceneBindingPlan({
      backgroundMode: "generated_solid",
      backgroundColorHex: "#6aa84f",
      primaryTextColorHex: "#ffffff",
    }),
  });

  const shapeCommand = batch.proposals[0]?.mutation.commands.find(
    (
      command,
    ): command is Extract<
      (typeof batch.proposals)[number]["mutation"]["commands"][number],
      { op: "createLayer" }
    > => command.op === "createLayer" && command.clientLayerKey === "obj-decor_retain_run-test",
  );
  assert.ok(shapeCommand, "expected a retained shape command");
  assert.equal(
    shapeCommand.layerBlueprint.styleTokens?.fillColor,
    "#ffffff",
    "a decorative shape without overlap evidence must not be recolored just because its fill equals the scene's primary text color",
  );
});

test("emitAdaptiveCompositionMutations shrinks customFontSize so a long headline fits its emit container width", () => {
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
      templateTitle: "식당 계절메뉴",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 1,
      summary: "test graph",
      objects: [
        {
          objectId: "obj-headline",
          layerType: "text",
          bounds: { x: 100, y: 100, width: 432, height: 141 },
          sourceText: "원본",
          fontSize: 108,
          fillColorHex: "#ffffff",
          fontFamily: "869_400",
          fontWeight: 700,
          textAlign: "left",
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
          sourceAngle: 0,
          sourceOpacity: 1,
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
          objectId: "obj-headline",
          operation: "modify",
          newText: "봄을 한 그릇에 담았습니다, 신메뉴 출시!",
          carriesAtomIds: [],
          reason: "restaurant headline",
        },
      ],
      addDecisions: [],
      compositionSummary: "long headline must fit width 432",
    },
    sceneBindingPlan: createSceneBindingPlan({
      backgroundMode: "generated_solid",
      backgroundColorHex: "#6aa84f",
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
  const customFontSize = headlineCommand.layerBlueprint.metadata?.customFontSize;
  assert.ok(
    typeof customFontSize === "number" && customFontSize < 108,
    `expected fitted fontSize < 108, got ${customFontSize}`,
  );
  // Sanity: fitted size must still be legible (>= min floor)
  assert.ok(
    typeof customFontSize === "number" && customFontSize >= 18,
    `expected fitted fontSize >= 18 floor, got ${customFontSize}`,
  );
});

test("emitAdaptiveCompositionMutations keeps the original fontSize when the text already fits", () => {
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
      templateTitle: "식당 계절메뉴",
      canvasWidth: 1200,
      canvasHeight: 628,
      objectCount: 1,
      summary: "test graph",
      objects: [
        {
          objectId: "obj-headline",
          layerType: "text",
          bounds: { x: 100, y: 100, width: 800, height: 141 },
          sourceText: "봄 한정",
          fontSize: 48,
          fillColorHex: "#ffffff",
          fontFamily: "869_400",
          fontWeight: 700,
          textAlign: "left",
          sourceOriginUrl: null,
          sourceWidth: null,
          sourceHeight: null,
          sourceAngle: 0,
          sourceOpacity: 1,
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
      elementDecisions: [],
      addDecisions: [],
      compositionSummary: "short headline keeps fontSize",
    },
    sceneBindingPlan: createSceneBindingPlan({
      backgroundMode: "generated_solid",
      backgroundColorHex: "#6aa84f",
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
  assert.equal(headlineCommand.layerBlueprint.metadata?.customFontSize, 48);
});
