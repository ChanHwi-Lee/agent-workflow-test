import assert from "node:assert/strict";
import test from "node:test";

import { adaptV6Commands } from "./v6CommandAdapter.js";
import type {
  V6ImageCommand,
  V6PrimitiveCommand,
  V6RectCommand,
  V6SvgCommand,
  V6TextCommand,
} from "./v6Types.js";

const RECT_SOLID: V6RectCommand = {
  type: "create",
  primitive: "rect",
  source: { serial: 0, path: "0", tag: "div" },
  bounds: { left: 10, top: 20, width: 300, height: 200 },
  opacity: 0.9,
  fill: "#FF6432",
  borderRadius: 12,
  stroke: null,
  shadow: null,
};

const RECT_GRADIENT: V6RectCommand = {
  ...RECT_SOLID,
  source: { serial: 1, path: "0.0", tag: "div" },
  fill: {
    type: "linear-gradient",
    angle: 135,
    stops: [
      { color: "#FF0000", offset: 0 },
      { color: "#0000FF", offset: 1 },
    ],
  },
  borderRadius: [4, 8, 12, 16],
  stroke: { color: "#111111", width: 2 },
  shadow: "0 4px 12px rgba(0,0,0,0.2)",
};

const RECT_ALPHA: V6RectCommand = {
  ...RECT_SOLID,
  fill: "#FF6432",
  paint: {
    type: "solid",
    color: "#FF6432",
    alpha: 0.42,
    cssColor: "rgba(255, 100, 50, 0.42)",
  },
  stroke: {
    color: "#0F172A",
    width: 3,
    alpha: 0.35,
    cssColor: "rgba(15, 23, 42, 0.35)",
  },
};

const RECT_RADIAL: V6RectCommand = {
  ...RECT_SOLID,
  fill: {
    type: "radial-gradient",
    shape: "circle",
    position: "75% 50%",
    css: "radial-gradient(circle at 75% 50%, #FF4500, #8B0000)",
    stops: [
      { color: "#FF4500", offset: 0, alpha: 1, cssColor: "#FF4500" },
      { color: "#8B0000", offset: 1, alpha: 1, cssColor: "#8B0000" },
    ],
  },
};

const RECT_UNSUPPORTED_PAINT: V6RectCommand = {
  ...RECT_SOLID,
  fill: {
    type: "unsupported-paint",
    css: "conic-gradient(from 45deg, red, blue)",
    reason: "unsupported-background-image",
  },
};

const TEXT_CMD: V6TextCommand = {
  type: "create",
  primitive: "text",
  source: { serial: 2, path: "0.1", tag: "h1" },
  bounds: { left: 80, top: 140, width: 520, height: 100 },
  opacity: 1,
  text: "SPRING SALE",
  fontFamily: "sans-serif",
  fontSize: 72,
  fontWeight: "800",
  fontStyle: "normal",
  textDecoration: "none",
  textAlign: "left",
  lineHeight: 1.1,
  letterSpacing: 0,
  color: "#D2691E",
};

const IMAGE_CMD: V6ImageCommand = {
  type: "create",
  primitive: "image",
  source: { serial: 3, path: "0.2", tag: "img" },
  bounds: { left: 700, top: 94, width: 440, height: 440 },
  opacity: 1,
  src: "https://cdn/foo.jpg",
  naturalWidth: 1920,
  naturalHeight: 1920,
  objectFit: "cover",
  borderRadius: 32,
  alt: "hero",
};

const BITMAP_CMD: V6ImageCommand = {
  ...IMAGE_CMD,
  primitive: "bitmap",
  source: { serial: 4, path: "0.3", tag: "img" },
  src: "placeholder://hero-product.png",
};

const SVG_CMD: V6SvgCommand = {
  type: "create",
  primitive: "svg",
  source: { serial: 5, path: "0.4", tag: "svg" },
  bounds: { left: 60, top: 60, width: 140, height: 140 },
  opacity: 1,
  outerHTML: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
};

test("adaptV6Commands — rect solid → shape with fillColor", () => {
  const { commands } = adaptV6Commands([RECT_SOLID], { runId: "r1" });
  assert.equal(commands.length, 1);
  const c = commands[0];
  assert.ok(c);
  assert.equal(c.op, "createLayer");
  assert.equal(c.layerBlueprint.layerType, "shape");
  assert.deepEqual(c.layerBlueprint.bounds, {
    x: 10,
    y: 20,
    width: 300,
    height: 200,
  });
  assert.equal(c.executionSlotKey, null, "v6 emits slot-free");
  assert.equal(c.parentRef.position, "append");
  assert.equal(c.clientLayerKey, "v6:r1:001:shape");
  assert.equal(c.commandId, "cmd:r1:001");
  const tokens = c.layerBlueprint.styleTokens as Record<string, unknown>;
  assert.equal(tokens.fillColor, "#FF6432");
  assert.equal(tokens.borderRadius, 12);
  assert.equal(tokens.opacity, 0.9);
});

test("adaptV6Commands는 fillColor 호환성과 fillPaint alpha를 함께 직렬화한다", () => {
  const { commands } = adaptV6Commands([RECT_ALPHA], { runId: "alpha" });
  const tokens = commands[0]?.layerBlueprint.styleTokens as Record<
    string,
    unknown
  >;
  assert.equal(tokens.fillColor, "#FF6432");
  const fillPaint = tokens.fillPaint as Record<string, unknown>;
  assert.equal(fillPaint.type, "solid");
  assert.equal(fillPaint.color, "#FF6432");
  assert.equal(fillPaint.alpha, 0.42);
  assert.equal(fillPaint.cssColor, "rgba(255, 100, 50, 0.42)");
  assert.deepEqual(tokens.stroke, { color: "#0F172A", width: 3 });
  const strokePaint = tokens.strokePaint as Record<string, unknown>;
  assert.equal(strokePaint.alpha, 0.35);
  assert.equal(strokePaint.cssColor, "rgba(15, 23, 42, 0.35)");
});

test("adaptV6Commands — rect gradient → fill.type='linear-gradient' with stops", () => {
  const { commands } = adaptV6Commands([RECT_GRADIENT], { runId: "r2" });
  const tokens = commands[0]?.layerBlueprint.styleTokens as Record<
    string,
    unknown
  >;
  const fill = tokens.fill as Record<string, unknown>;
  assert.equal(fill.type, "linear-gradient");
  assert.equal(fill.angle, 135);
  const stops = fill.stops as Array<{ color: string; offset: number }>;
  assert.equal(stops.length, 2);
  assert.equal(stops[0]?.color, "#FF0000");
  assert.equal(stops[1]?.offset, 1);
});

test("adaptV6Commands는 radial-gradient fill token을 직렬화한다", () => {
  const { commands } = adaptV6Commands([RECT_RADIAL], { runId: "radial" });
  const tokens = commands[0]?.layerBlueprint.styleTokens as Record<
    string,
    unknown
  >;
  const fill = tokens.fill as Record<string, unknown>;
  assert.equal(fill.type, "radial-gradient");
  assert.equal(fill.shape, "circle");
  assert.equal(fill.position, "75% 50%");
  assert.equal(
    fill.css,
    "radial-gradient(circle at 75% 50%, #FF4500, #8B0000)",
  );
  const stops = fill.stops as Array<Record<string, unknown>>;
  assert.equal(stops[0]?.color, "#FF4500");
  assert.equal(stops[1]?.color, "#8B0000");
  const fillPaint = tokens.fillPaint as Record<string, unknown>;
  assert.equal(fillPaint.type, "radial-gradient");
});

test("adaptV6Commands는 unsupported paint warning을 metadata와 styleTokens에 남긴다", () => {
  const { commands } = adaptV6Commands([RECT_UNSUPPORTED_PAINT], {
    runId: "unsupported",
  });
  const command = commands[0];
  assert.ok(command);
  const tokens = command.layerBlueprint.styleTokens as Record<string, unknown>;
  const fill = tokens.fill as Record<string, unknown>;
  assert.equal(fill.type, "unsupported-paint");
  assert.equal(fill.reason, "unsupported-background-image");
  assert.equal(tokens.paintWarning, "unsupported-background-image");
  assert.equal(
    command.layerBlueprint.metadata.v6PaintWarning,
    "unsupported-background-image",
  );
  assert.equal(
    command.layerBlueprint.metadata.unsupportedPaintCss,
    "conic-gradient(from 45deg, red, blue)",
  );
});

test("adaptV6Commands — rect per-corner borderRadius serializes as object", () => {
  const { commands } = adaptV6Commands([RECT_GRADIENT], { runId: "r3" });
  const tokens = commands[0]?.layerBlueprint.styleTokens as Record<
    string,
    unknown
  >;
  assert.deepEqual(tokens.borderRadius, {
    topLeft: 4,
    topRight: 8,
    bottomRight: 12,
    bottomLeft: 16,
  });
});

test("adaptV6Commands — rect stroke + shadow flow into styleTokens", () => {
  const { commands } = adaptV6Commands([RECT_GRADIENT], { runId: "r4" });
  const tokens = commands[0]?.layerBlueprint.styleTokens as Record<
    string,
    unknown
  >;
  assert.deepEqual(tokens.stroke, { color: "#111111", width: 2 });
  assert.equal(tokens.shadow, "0 4px 12px rgba(0,0,0,0.2)");
});

test("adaptV6Commands — text → layerType 'text' with fillColor + font tokens + text metadata", () => {
  const { commands } = adaptV6Commands([TEXT_CMD], { runId: "r5" });
  const c = commands[0];
  assert.ok(c);
  assert.equal(c.layerBlueprint.layerType, "text");
  const tokens = c.layerBlueprint.styleTokens as Record<string, unknown>;
  assert.equal(tokens.fillColor, "#D2691E");
  assert.equal(tokens.fontFamily, "sans-serif");
  assert.equal(tokens.fontSize, 72);
  assert.equal(tokens.fontWeight, "800");
  assert.equal(tokens.textAlign, "left");
  assert.equal(tokens.lineHeight, 1.1);
  assert.deepEqual(c.layerBlueprint.bounds, {
    x: TEXT_CMD.bounds.left,
    y: TEXT_CMD.bounds.top,
    width: TEXT_CMD.bounds.width,
    height: TEXT_CMD.bounds.height,
  });
  const metadata = c.layerBlueprint.metadata;
  assert.equal(metadata.text, "SPRING SALE");
  assert.equal(metadata.v6Primitive, "text");
  assert.equal(metadata.sourcePath, "0.1");
});

test("adaptV6Commands — text fontFamily cascade picks first token (Toolditor ID)", () => {
  // Playwright's computed-style fontFamily often includes a full cascade with
  // quotes. Adapter must hand Toolditor only the first token (the injected
  // Toolditor ID) without surrounding quotes.
  const cascadeText: V6TextCommand = {
    ...TEXT_CMD,
    fontFamily: '"701_400", sans-serif',
  };
  const { commands } = adaptV6Commands([cascadeText], { runId: "font" });
  const tokens = commands[0]?.layerBlueprint.styleTokens as Record<
    string,
    unknown
  >;
  assert.equal(tokens.fontFamily, "701_400");
});

test("adaptV6Commands — Toolditor font ID suffix가 있으면 fontWeight를 suffix 기준으로 정규화한다", () => {
  const regularFaceComputedBold: V6TextCommand = {
    ...TEXT_CMD,
    fontFamily: '"1301_400", sans-serif',
    fontWeight: "700",
  };
  const boldFaceComputedRegular: V6TextCommand = {
    ...TEXT_CMD,
    fontFamily: '"701_700", sans-serif',
    fontWeight: "400",
  };

  const { commands } = adaptV6Commands(
    [regularFaceComputedBold, boldFaceComputedRegular],
    { runId: "font-weight" },
  );

  const firstTokens = commands[0]?.layerBlueprint.styleTokens as Record<
    string,
    unknown
  >;
  const firstMetadata = commands[0]?.layerBlueprint.metadata as Record<
    string,
    unknown
  >;
  assert.equal(firstTokens.fontFamily, "1301_400");
  assert.equal(firstTokens.fontWeight, "400");
  assert.equal(firstMetadata.computedFontWeight, "700");
  assert.equal(firstMetadata.normalizedFontWeight, "400");

  const secondTokens = commands[1]?.layerBlueprint.styleTokens as Record<
    string,
    unknown
  >;
  const secondMetadata = commands[1]?.layerBlueprint.metadata as Record<
    string,
    unknown
  >;
  assert.equal(secondTokens.fontFamily, "701_700");
  assert.equal(secondTokens.fontWeight, "700");
  assert.equal(secondMetadata.computedFontWeight, "400");
  assert.equal(secondMetadata.normalizedFontWeight, "700");
});

test("adaptV6Commands — text lineHeight 'normal' serialized as null", () => {
  const normalText: V6TextCommand = { ...TEXT_CMD, lineHeight: "normal" };
  const { commands } = adaptV6Commands([normalText], { runId: "r6" });
  const tokens = commands[0]?.layerBlueprint.styleTokens as Record<
    string,
    unknown
  >;
  assert.equal(tokens.lineHeight, null);
});

test("adaptV6Commands는 textShadow와 filter를 styleTokens에 직렬화한다", () => {
  const shadowText: V6TextCommand = {
    ...TEXT_CMD,
    textShadow: "2px 4px 8px rgba(0,0,0,0.4)",
    filter: "drop-shadow(0px 2px 4px rgba(0,0,0,0.25))",
    colorAlpha: 0.8,
    colorCssColor: "rgba(210, 105, 30, 0.8)",
  };
  const { commands } = adaptV6Commands([shadowText], { runId: "text-shadow" });
  const tokens = commands[0]?.layerBlueprint.styleTokens as Record<
    string,
    unknown
  >;
  assert.equal(tokens.textShadow, "2px 4px 8px rgba(0,0,0,0.4)");
  assert.equal(tokens.filter, "drop-shadow(0px 2px 4px rgba(0,0,0,0.25))");
  const fillPaint = tokens.fillPaint as Record<string, unknown>;
  assert.equal(fillPaint.alpha, 0.8);
  assert.equal(fillPaint.cssColor, "rgba(210, 105, 30, 0.8)");
});

test("adaptV6Commands — image (jpg) → layerType 'image' with src metadata", () => {
  const { commands } = adaptV6Commands([IMAGE_CMD], { runId: "r7" });
  const c = commands[0];
  assert.ok(c);
  assert.equal(c.layerBlueprint.layerType, "image");
  assert.equal(c.layerBlueprint.metadata.src, "https://cdn/foo.jpg");
  assert.equal(c.layerBlueprint.metadata.naturalWidth, 1920);
  assert.equal(c.layerBlueprint.metadata.alt, "hero");
  const tokens = c.layerBlueprint.styleTokens as Record<string, unknown>;
  assert.equal(tokens.objectFit, "cover");
  assert.equal(tokens.borderRadius, 32);
});

test("adaptV6Commands — bitmap → layerType 'bitmap' (NOT downcast to image)", () => {
  const { commands } = adaptV6Commands([BITMAP_CMD], { runId: "r8" });
  const c = commands[0];
  assert.ok(c);
  assert.equal(
    c.layerBlueprint.layerType,
    "bitmap",
    "Phase 2 contract extension: bitmap must preserve primitive identity",
  );
  assert.equal(c.layerBlueprint.metadata.src, "placeholder://hero-product.png");
});

test("adaptV6Commands는 generated asset metadata를 bitmap layer에 직렬화한다", () => {
  const generatedBitmap: V6ImageCommand = {
    ...BITMAP_CMD,
    src: "http://agent.test/api/agent-workflow/runs/r1/artifacts?key=runs%2Fr1%2Fgenerated-assets%2F001.png",
    generatedAssetId: "generated:r1:001",
    generatedAssetProvider: "gemini",
    generatedAssetModel: "gemini-2.5-flash-image",
    generatedAssetPrompt: "Create a clean product image.",
    generatedAssetMethod: "gemini-native-generation",
    assetSelectionDecision: "generate",
    assetSelectionConfidence: "medium",
    assetSelectionReason: "Qdrant candidates were unsuitable.",
    placeholderUri: "placeholder://hero-product.png",
    placeholderHint: "hero product",
  };

  const { commands } = adaptV6Commands([generatedBitmap], { runId: "gen" });
  const metadata = commands[0]?.layerBlueprint.metadata as Record<
    string,
    unknown
  >;
  assert.equal(metadata.generatedAssetProvider, "gemini");
  assert.equal(
    metadata.generatedAssetModel,
    "gemini-2.5-flash-image",
  );
  assert.equal(metadata.generatedAssetMethod, "gemini-native-generation");
  assert.equal(metadata.assetSelectionDecision, "generate");
  assert.equal(metadata.placeholderHint, "hero product");
  assert.doesNotMatch(String(metadata.src), /^data:/);
});

test("adaptV6Commands — svg → layerType 'svg' with outerHTML metadata", () => {
  const { commands } = adaptV6Commands([SVG_CMD], { runId: "r9" });
  const c = commands[0];
  assert.ok(c);
  assert.equal(c.layerBlueprint.layerType, "svg");
  assert.match(c.layerBlueprint.metadata.outerHTML as string, /<circle/);
});

test("adaptV6Commands — sequence ordering: commands[i].clientLayerKey seq matches order", () => {
  const mixed: V6PrimitiveCommand[] = [
    RECT_SOLID,
    TEXT_CMD,
    BITMAP_CMD,
    SVG_CMD,
  ];
  const { commands } = adaptV6Commands(mixed, { runId: "ord" });
  assert.equal(commands.length, 4);
  assert.equal(commands[0]?.clientLayerKey, "v6:ord:001:shape");
  assert.equal(commands[1]?.clientLayerKey, "v6:ord:002:text");
  assert.equal(commands[2]?.clientLayerKey, "v6:ord:003:bitmap");
  assert.equal(commands[3]?.clientLayerKey, "v6:ord:004:svg");
});

test("adaptV6Commands — zero-size bounds are clamped to 1×1 (contract exclusiveMinimum:0)", () => {
  const zeroRect: V6RectCommand = {
    ...RECT_SOLID,
    bounds: { left: 0, top: 0, width: 0, height: 0 },
  };
  const { commands } = adaptV6Commands([zeroRect], { runId: "z" });
  assert.equal(commands[0]?.layerBlueprint.bounds.width, 1);
  assert.equal(commands[0]?.layerBlueprint.bounds.height, 1);
});

test("adaptV6Commands — executionSlotKey always null (slot-free philosophy)", () => {
  const mixed: V6PrimitiveCommand[] = [
    RECT_SOLID,
    TEXT_CMD,
    IMAGE_CMD,
    BITMAP_CMD,
    SVG_CMD,
  ];
  const { commands } = adaptV6Commands(mixed, { runId: "slot" });
  for (const c of commands) {
    assert.equal(c.executionSlotKey, null);
  }
});

test("adaptV6Commands — v6 source trace metadata preserved on every command", () => {
  const { commands } = adaptV6Commands([RECT_GRADIENT, TEXT_CMD, SVG_CMD], {
    runId: "trace",
  });
  for (const c of commands) {
    assert.equal(typeof c.layerBlueprint.metadata.sourceSerial, "number");
    assert.equal(typeof c.layerBlueprint.metadata.sourcePath, "string");
    assert.equal(typeof c.layerBlueprint.metadata.sourceTag, "string");
    assert.equal(typeof c.layerBlueprint.metadata.v6Primitive, "string");
  }
});
