import assert from "node:assert/strict";
import test from "node:test";

import type {
  MessageAtomPlan,
  ProjectedObjectGraph,
} from "../types.js";
import {
  finalizeAdaptiveCompositionDecision,
  type FinalizeAdaptiveCompositionDecisionContext,
} from "./buildAdaptiveCompositionDecision.js";

function createProjectedGraph(): ProjectedObjectGraph {
  return {
    graphId: "graph-test",
    runId: "run-test",
    traceId: "trace-test",
    templateCode: "tmpl-test",
    templateTitle: "test",
    canvasWidth: 1200,
    canvasHeight: 628,
    objectCount: 3,
    summary: "test graph",
    objects: [
      {
        objectId: "obj-text-headline",
        layerType: "text",
        bounds: { x: 100, y: 100, width: 800, height: 120 },
        sourceText: "기존 헤드라인",
        fontSize: 96,
        fillColorHex: "#111111",
        fontFamily: null,
        fontWeight: null,
        textAlign: null,
        sourceOriginUrl: null,
        sourceWidth: null,
        sourceHeight: null,
        visualWeight: "dominant",
        zone: "top",
        prominence: 9600,
        backingSurfaceObjectId: null,
        backingSurfaceColorHex: null,
        backingSurfaceBounds: null,
        compositeHint: null,
      },
      {
        objectId: "obj-shape-card",
        layerType: "shape",
        bounds: { x: 80, y: 260, width: 1040, height: 200 },
        sourceText: null,
        fontSize: null,
        fillColorHex: "#ff6a00",
        fontFamily: null,
        fontWeight: null,
        textAlign: null,
        sourceOriginUrl: null,
        sourceWidth: null,
        sourceHeight: null,
        visualWeight: "secondary",
        zone: "center",
        prominence: 208000,
        backingSurfaceObjectId: null,
        backingSurfaceColorHex: null,
        backingSurfaceBounds: null,
        compositeHint: null,
      },
      {
        objectId: "obj-image-bg",
        layerType: "image",
        bounds: { x: 0, y: 0, width: 1200, height: 628 },
        sourceText: null,
        fontSize: null,
        fillColorHex: null,
        fontFamily: null,
        fontWeight: null,
        textAlign: null,
        sourceOriginUrl: "https://file.tooldi.com/test.png",
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
  };
}

function createMessageAtomPlan(): MessageAtomPlan {
  return {
    planId: "plan-test",
    runId: "run-test",
    traceId: "trace-test",
    workflowVariant: "object_native_v1",
    atoms: [
      {
        atomId: "atom_primary",
        kind: "primary",
        text: "봄 신메뉴 출시",
        optional: false,
      },
      {
        atomId: "atom_cta",
        kind: "cta",
        text: "지금 주문하기",
        optional: false,
      },
      {
        atomId: "atom_detail",
        kind: "detail",
        text: "4월 한정",
        optional: true,
      },
    ],
    summary: "test atoms",
  };
}

function createContext(): FinalizeAdaptiveCompositionDecisionContext {
  return {
    runId: "run-test",
    traceId: "trace-test",
    projectedGraph: createProjectedGraph(),
    messageAtomPlan: createMessageAtomPlan(),
  };
}

test("finalizeAdaptiveCompositionDecision accepts retain + modify + add carriage and returns all required atoms covered", () => {
  const context = createContext();
  const result = finalizeAdaptiveCompositionDecision(
    {
      elementDecisions: [
        {
          objectId: "obj-text-headline",
          operation: "modify",
          newText: "봄 신메뉴 출시!",
          carriesAtomIds: ["atom_primary"],
          reason: "primary headline",
        },
        {
          objectId: "obj-shape-card",
          operation: "retain",
          newText: null,
          carriesAtomIds: [],
          reason: "surface kept",
        },
      ],
      addDecisions: [
        {
          vocabularyId: "cta_button",
          text: "지금 주문하기",
          placementZone: "bottom",
          carriesAtomIds: ["atom_cta"],
          reason: "cta add",
        },
      ],
      compositionSummary: "ok",
    },
    context,
  );

  assert.equal(result.elementDecisions.length, 2);
  assert.equal(result.addDecisions.length, 1);
  assert.deepEqual(
    result.elementDecisions[0]?.carriesAtomIds,
    ["atom_primary"],
  );
  assert.deepEqual(result.addDecisions[0]?.carriesAtomIds, ["atom_cta"]);
});

test("finalizeAdaptiveCompositionDecision accepts retain with carriesAtomIds when existing sourceText already carries an atom", () => {
  const context = createContext();
  const result = finalizeAdaptiveCompositionDecision(
    {
      elementDecisions: [
        {
          objectId: "obj-text-headline",
          operation: "retain",
          newText: null,
          carriesAtomIds: ["atom_primary"],
          reason: "already representative",
        },
      ],
      addDecisions: [
        {
          vocabularyId: "cta_button",
          text: "지금 주문하기",
          placementZone: "bottom",
          carriesAtomIds: ["atom_cta"],
          reason: "cta add",
        },
      ],
      compositionSummary: "ok",
    },
    context,
  );

  assert.deepEqual(
    result.elementDecisions[0]?.carriesAtomIds,
    ["atom_primary"],
  );
});

test("finalizeAdaptiveCompositionDecision rejects unknown atom ids in ElementDecision", () => {
  const context = createContext();
  assert.throws(
    () =>
      finalizeAdaptiveCompositionDecision(
        {
          elementDecisions: [
            {
              objectId: "obj-text-headline",
              operation: "modify",
              newText: "봄 신메뉴 출시",
              carriesAtomIds: ["atom_primary", "atom_ghost"],
              reason: "primary",
            },
          ],
          addDecisions: [
            {
              vocabularyId: "cta_button",
              text: "지금 주문하기",
              placementZone: "bottom",
              carriesAtomIds: ["atom_cta"],
              reason: "cta",
            },
          ],
          compositionSummary: "ok",
        },
        context,
      ),
    /unknown atom ids in carriesAtomIds: atom_ghost/,
  );
});

test("finalizeAdaptiveCompositionDecision rejects unknown atom ids in AddDecision", () => {
  const context = createContext();
  assert.throws(
    () =>
      finalizeAdaptiveCompositionDecision(
        {
          elementDecisions: [
            {
              objectId: "obj-text-headline",
              operation: "modify",
              newText: "봄 신메뉴 출시",
              carriesAtomIds: ["atom_primary"],
              reason: "primary",
            },
          ],
          addDecisions: [
            {
              vocabularyId: "cta_button",
              text: "지금 주문하기",
              placementZone: "bottom",
              carriesAtomIds: ["atom_cta", "atom_ghost"],
              reason: "cta",
            },
          ],
          compositionSummary: "ok",
        },
        context,
      ),
    /unknown atom ids in carriesAtomIds: atom_ghost/,
  );
});

test("finalizeAdaptiveCompositionDecision rejects duplicate atom ids inside one ElementDecision carriesAtomIds", () => {
  const context = createContext();
  assert.throws(
    () =>
      finalizeAdaptiveCompositionDecision(
        {
          elementDecisions: [
            {
              objectId: "obj-text-headline",
              operation: "modify",
              newText: "봄 신메뉴 출시",
              carriesAtomIds: ["atom_primary", "atom_primary"],
              reason: "primary",
            },
          ],
          addDecisions: [
            {
              vocabularyId: "cta_button",
              text: "지금 주문하기",
              placementZone: "bottom",
              carriesAtomIds: ["atom_cta"],
              reason: "cta",
            },
          ],
          compositionSummary: "ok",
        },
        context,
      ),
    /duplicate atom ids in carriesAtomIds/,
  );
});

test("finalizeAdaptiveCompositionDecision rejects duplicate atom ids inside one AddDecision carriesAtomIds", () => {
  const context = createContext();
  assert.throws(
    () =>
      finalizeAdaptiveCompositionDecision(
        {
          elementDecisions: [
            {
              objectId: "obj-text-headline",
              operation: "modify",
              newText: "봄 신메뉴 출시",
              carriesAtomIds: ["atom_primary"],
              reason: "primary",
            },
          ],
          addDecisions: [
            {
              vocabularyId: "cta_button",
              text: "지금 주문하기",
              placementZone: "bottom",
              carriesAtomIds: ["atom_cta", "atom_cta"],
              reason: "cta",
            },
          ],
          compositionSummary: "ok",
        },
        context,
      ),
    /duplicate atom ids in carriesAtomIds/,
  );
});

test("finalizeAdaptiveCompositionDecision rejects remove decisions with non-empty carriesAtomIds", () => {
  const context = createContext();
  assert.throws(
    () =>
      finalizeAdaptiveCompositionDecision(
        {
          elementDecisions: [
            {
              objectId: "obj-text-headline",
              operation: "remove",
              newText: null,
              carriesAtomIds: ["atom_primary"],
              reason: "should not carry",
            },
          ],
          addDecisions: [],
          compositionSummary: "ok",
        },
        context,
      ),
    /remove but carriesAtomIds is non-empty/,
  );
});

test("finalizeAdaptiveCompositionDecision rejects carriesAtomIds on non-text objects (shape/image)", () => {
  const context = createContext();
  assert.throws(
    () =>
      finalizeAdaptiveCompositionDecision(
        {
          elementDecisions: [
            {
              objectId: "obj-shape-card",
              operation: "retain",
              newText: null,
              carriesAtomIds: ["atom_primary"],
              reason: "shape cannot carry",
            },
          ],
          addDecisions: [],
          compositionSummary: "ok",
        },
        context,
      ),
    /layerType=shape .* only text-bearing objects can carry atoms/,
  );
});

test("finalizeAdaptiveCompositionDecision rejects carriesAtomIds on accent_shape add", () => {
  const context = createContext();
  assert.throws(
    () =>
      finalizeAdaptiveCompositionDecision(
        {
          elementDecisions: [
            {
              objectId: "obj-text-headline",
              operation: "modify",
              newText: "봄 신메뉴 출시",
              carriesAtomIds: ["atom_primary"],
              reason: "primary",
            },
          ],
          addDecisions: [
            {
              vocabularyId: "cta_button",
              text: "지금 주문하기",
              placementZone: "bottom",
              carriesAtomIds: ["atom_cta"],
              reason: "cta",
            },
            {
              vocabularyId: "accent_shape",
              text: null,
              placementZone: "center",
              carriesAtomIds: ["atom_detail"],
              reason: "accent cannot carry",
            },
          ],
          compositionSummary: "ok",
        },
        context,
      ),
    /accent_shape cannot carry atoms/,
  );
});

test("finalizeAdaptiveCompositionDecision rejects output missing a required atom from carriesAtomIds union", () => {
  const context = createContext();
  assert.throws(
    () =>
      finalizeAdaptiveCompositionDecision(
        {
          elementDecisions: [
            {
              objectId: "obj-text-headline",
              operation: "modify",
              newText: "봄 신메뉴 출시",
              carriesAtomIds: ["atom_primary"],
              reason: "primary only",
            },
          ],
          addDecisions: [],
          compositionSummary: "missing cta",
        },
        context,
      ),
    /omitted required atoms: atom_cta/,
  );
});

test("finalizeAdaptiveCompositionDecision treats optional atoms as non-required", () => {
  const context = createContext();
  const result = finalizeAdaptiveCompositionDecision(
    {
      elementDecisions: [
        {
          objectId: "obj-text-headline",
          operation: "modify",
          newText: "봄 신메뉴 출시",
          carriesAtomIds: ["atom_primary"],
          reason: "primary",
        },
      ],
      addDecisions: [
        {
          vocabularyId: "cta_button",
          text: "지금 주문하기",
          placementZone: "bottom",
          carriesAtomIds: ["atom_cta"],
          reason: "cta",
        },
      ],
      compositionSummary: "optional atom omitted",
    },
    context,
  );

  assert.equal(result.elementDecisions.length, 1);
  assert.equal(result.addDecisions.length, 1);
});

test("finalizeAdaptiveCompositionDecision still rejects unknown object ids returned by the LLM", () => {
  const context = createContext();
  assert.throws(
    () =>
      finalizeAdaptiveCompositionDecision(
        {
          elementDecisions: [
            {
              objectId: "obj-ghost",
              operation: "modify",
              newText: "봄 신메뉴 출시",
              carriesAtomIds: ["atom_primary"],
              reason: "unknown obj",
            },
          ],
          addDecisions: [
            {
              vocabularyId: "cta_button",
              text: "지금 주문하기",
              placementZone: "bottom",
              carriesAtomIds: ["atom_cta"],
              reason: "cta",
            },
          ],
          compositionSummary: "ok",
        },
        context,
      ),
    /unknown object ids: obj-ghost/,
  );
});
