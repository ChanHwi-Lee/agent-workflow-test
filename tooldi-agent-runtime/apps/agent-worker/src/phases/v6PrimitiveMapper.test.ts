import assert from "node:assert/strict";
import test from "node:test";

import {
  mapRenderedElements,
  parseColor,
  parseLinearGradient,
  parseRadialGradient,
} from "./v6PrimitiveMapper.js";
import type {
  V6ComputedStyle,
  V6ExtractionResult,
  V6RenderedElement,
  V6RectCommand,
  V6TextCommand,
  V6ImageCommand,
  V6SvgCommand,
} from "./v6Types.js";

// --------- fixture helpers ---------

const DEFAULT_STYLE: V6ComputedStyle = {
  backgroundColor: "rgba(0, 0, 0, 0)",
  backgroundImage: "none",
  borderTopLeftRadius: "0px",
  borderTopRightRadius: "0px",
  borderBottomRightRadius: "0px",
  borderBottomLeftRadius: "0px",
  borderTopWidth: "0px",
  borderRightWidth: "0px",
  borderBottomWidth: "0px",
  borderLeftWidth: "0px",
  borderTopColor: "rgb(0, 0, 0)",
  paddingTop: "0px",
  paddingRight: "0px",
  paddingBottom: "0px",
  paddingLeft: "0px",
  color: "rgb(0, 0, 0)",
  fontFamily: "sans-serif",
  fontSize: "16px",
  fontWeight: "400",
  fontStyle: "normal",
  textDecorationLine: "none",
  textAlign: "start",
  lineHeight: "normal",
  letterSpacing: "normal",
  opacity: "1",
  transform: "none",
  transformOrigin: "0px 0px",
  position: "static",
  zIndex: "auto",
  boxShadow: "none",
  textShadow: "none",
  filter: "none",
  objectFit: "fill",
  overflow: "visible",
  display: "block",
  alignItems: "normal",
  justifyContent: "normal",
  visibility: "visible",
  whiteSpace: "normal",
};

type ElOverrides = Omit<Partial<V6RenderedElement>, "style"> & {
  style?: Partial<V6ComputedStyle>;
};

function el(overrides: ElOverrides = {}): V6RenderedElement {
  const { style: styleOverride, ...rest } = overrides;
  return {
    serial: 0,
    path: "0",
    tagName: "div",
    bounds: { left: 0, top: 0, width: 100, height: 100 },
    style: { ...DEFAULT_STYLE, ...(styleOverride ?? {}) },
    isTextLeaf: false,
    text: null,
    img: null,
    svg: null,
    hasChildren: false,
    visible: true,
    ...rest,
  };
}

function extract(...elements: V6RenderedElement[]): V6ExtractionResult {
  return { canvas: { width: 1200, height: 628 }, elements };
}

// --------- tests ---------

test("mapRenderedElements — emits rect for solid-color div", () => {
  const result = mapRenderedElements(
    extract(
      el({
        style: { backgroundColor: "rgb(255, 100, 50)" },
        bounds: { left: 10, top: 20, width: 200, height: 100 },
      }),
    ),
  );
  assert.equal(result.commands.length, 1);
  const cmd = result.commands[0] as V6RectCommand;
  assert.equal(cmd.primitive, "rect");
  assert.equal(cmd.fill, "#FF6432");
  assert.deepEqual(cmd.bounds, { left: 10, top: 20, width: 200, height: 100 });
});

test("mapRenderedElements는 가까운 조상 z-index 기준으로 append 순서를 정렬한다", () => {
  const result = mapRenderedElements(
    extract(
      el({
        serial: 0,
        path: "0",
        bounds: { left: 0, top: 0, width: 1200, height: 628 },
        style: { backgroundColor: "rgb(253, 251, 247)" },
      }),
      el({
        serial: 1,
        path: "0.0",
        hasChildren: true,
        style: { position: "absolute", zIndex: "2" },
      }),
      el({
        serial: 2,
        path: "0.0.0",
        isTextLeaf: true,
        text: "foreground text",
        style: { color: "rgb(20, 20, 20)" },
      }),
      el({
        serial: 3,
        path: "0.1",
        tagName: "img",
        bounds: { left: 600, top: 0, width: 600, height: 628 },
        style: { position: "absolute", zIndex: "1", objectFit: "cover" },
        img: {
          src: "placeholder://hero",
          naturalWidth: 1,
          naturalHeight: 1,
          alt: "",
        },
      }),
      el({
        serial: 4,
        path: "0.2",
        tagName: "svg",
        bounds: { left: 0, top: 0, width: 1200, height: 628 },
        style: { position: "absolute", zIndex: "0" },
        svg: { outerHTML: "<svg></svg>" },
      }),
    ),
  );

  assert.deepEqual(
    result.commands.map((command) => command.source.path),
    ["0", "0.2", "0.1", "0.0.0"],
  );
});

test("mapRenderedElements는 rgba 배경 fill과 stroke의 alpha를 보존한다", () => {
  const result = mapRenderedElements(
    extract(
      el({
        style: {
          backgroundColor: "rgba(255, 100, 50, 0.42)",
          borderTopWidth: "2px",
          borderTopColor: "rgba(15, 23, 42, 0.35)",
        },
      }),
    ),
  );
  const cmd = result.commands[0] as V6RectCommand;
  assert.equal(cmd.fill, "#FF6432");
  assert.equal(cmd.paint?.type, "solid");
  if (cmd.paint?.type === "solid") {
    assert.equal(cmd.paint.alpha, 0.42);
    assert.equal(cmd.paint.cssColor, "rgba(255, 100, 50, 0.42)");
  }
  assert.equal(cmd.stroke?.color, "#0F172A");
  assert.equal(cmd.stroke?.alpha, 0.35);
  assert.equal(cmd.stroke?.cssColor, "rgba(15, 23, 42, 0.35)");
});

test("mapRenderedElements — linear-gradient preserves angle and stops", () => {
  const result = mapRenderedElements(
    extract(
      el({
        style: {
          backgroundImage:
            "linear-gradient(135deg, rgb(255, 179, 71), rgb(255, 112, 67))",
        },
      }),
    ),
  );
  const cmd = result.commands[0] as V6RectCommand;
  const fill = cmd.fill;
  assert.ok(
    fill !== null && typeof fill !== "string",
    "fill must be gradient object",
  );
  if (fill === null || typeof fill === "string") return;
  assert.equal(fill.type, "linear-gradient");
  assert.equal(fill.angle, 135);
  assert.equal(fill.stops.length, 2);
  assert.equal(fill.stops[0]?.color, "#FFB347");
  assert.equal(fill.stops[0]?.offset, 0);
  assert.equal(fill.stops[1]?.color, "#FF7043");
  assert.equal(fill.stops[1]?.offset, 1);
});

test("mapRenderedElements는 radial-gradient를 non-null fill paint로 보존한다", () => {
  const result = mapRenderedElements(
    extract(
      el({
        style: {
          backgroundImage:
            "radial-gradient(circle at 75% 50%, #FF4500, #8B0000)",
        },
      }),
    ),
  );
  const cmd = result.commands[0] as V6RectCommand;
  const fill = cmd.fill;
  assert.ok(fill !== null && typeof fill !== "string");
  assert.equal(fill.type, "radial-gradient");
  if (fill.type !== "radial-gradient") return;
  assert.equal(fill.shape, "circle");
  assert.equal(fill.position, "75% 50%");
  assert.equal(fill.stops[0]?.color, "#FF4500");
  assert.equal(fill.stops[1]?.color, "#8B0000");
  assert.equal(cmd.paint?.type, "radial-gradient");
});

test("mapRenderedElements — emits text for text leaf, inset by padding+border with safety bounds", () => {
  const result = mapRenderedElements(
    extract(
      el({
        isTextLeaf: true,
        text: "Click",
        bounds: { left: 100, top: 200, width: 220, height: 60 },
        style: {
          color: "rgb(15, 23, 42)",
          fontFamily: "sans-serif",
          fontSize: "18px",
          fontWeight: "700",
          paddingLeft: "48px",
          paddingRight: "48px",
          paddingTop: "18px",
          paddingBottom: "18px",
          borderLeftWidth: "2px",
          borderRightWidth: "2px",
          borderTopWidth: "2px",
          borderBottomWidth: "2px",
        },
      }),
    ),
  );

  // No visible paint here (no bg, no border color set to non-default? border
  // color default is rgb(0,0,0) which IS visible → should get rect too).
  // Deliberately set backgroundColor transparent to isolate text behaviour.
  const textCmd = result.commands.find(
    (c): c is V6TextCommand => c.primitive === "text",
  );
  assert.ok(textCmd, "expected a text command");
  assert.deepEqual(textCmd.bounds, {
    left: 100 + 48 + 2,
    top: 200 + 18 + 2,
    width: 220 - 48 - 48 - 2 - 2 + 6,
    height: 60 - 18 - 18 - 2 - 2 + 10.8,
  });
  assert.equal(textCmd.text, "Click");
  assert.equal(textCmd.color, "#0F172A");
  assert.equal(textCmd.fontSize, 18);
  assert.equal(textCmd.fontWeight, "700");
});

test("mapRenderedElements — centered text safety expands around the center", () => {
  const result = mapRenderedElements(
    extract(
      el({
        isTextLeaf: true,
        text: "Centered",
        bounds: { left: 100, top: 80, width: 200, height: 40 },
        style: {
          fontSize: "40px",
          textAlign: "center",
        },
      }),
    ),
  );
  const textCmd = result.commands.find(
    (c): c is V6TextCommand => c.primitive === "text",
  );
  assert.ok(textCmd, "expected a text command");
  assert.deepEqual(textCmd.bounds, {
    left: 95,
    top: 80,
    width: 210,
    height: 64,
  });
});

test("mapRenderedElements — flex-centered multiline text keeps vertical center", () => {
  const result = mapRenderedElements(
    extract(
      el({
        bounds: { left: 1020, top: 475, width: 120, height: 120 },
        isTextLeaf: true,
        text: "PDF\n제공",
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          fontSize: "16px",
          lineHeight: "19.2px",
        },
      }),
    ),
  );

  const textCmd = result.commands.find(
    (c): c is V6TextCommand => c.primitive === "text",
  );
  assert.ok(textCmd, "expected a text command");
  assert.deepEqual(textCmd.bounds, {
    left: 1017,
    top: 515.8,
    width: 126,
    height: 48,
  });
});

test("mapRenderedElements — right-aligned text safety expands to the left", () => {
  const result = mapRenderedElements(
    extract(
      el({
        isTextLeaf: true,
        text: "Right",
        bounds: { left: 100, top: 80, width: 200, height: 40 },
        style: {
          fontSize: "40px",
          textAlign: "right",
        },
      }),
    ),
  );
  const textCmd = result.commands.find(
    (c): c is V6TextCommand => c.primitive === "text",
  );
  assert.ok(textCmd, "expected a text command");
  assert.deepEqual(textCmd.bounds, {
    left: 90,
    top: 80,
    width: 210,
    height: 64,
  });
});

test("mapRenderedElements — textAlign 'start' is normalized to 'left'", () => {
  const result = mapRenderedElements(
    extract(
      el({
        isTextLeaf: true,
        text: "hi",
        style: { textAlign: "start" },
      }),
    ),
  );
  const text = result.commands[0] as V6TextCommand;
  assert.equal(text.textAlign, "left");
});

test("mapRenderedElements — lineHeight in px becomes ratio; 'normal' stays 'normal'", () => {
  const a = mapRenderedElements(
    extract(
      el({
        isTextLeaf: true,
        text: "x",
        style: { fontSize: "20px", lineHeight: "30px" },
      }),
    ),
  );
  assert.equal((a.commands[0] as V6TextCommand).lineHeight, 1.5);

  const b = mapRenderedElements(
    extract(
      el({
        isTextLeaf: true,
        text: "x",
        style: { fontSize: "20px", lineHeight: "normal" },
      }),
    ),
  );
  assert.equal((b.commands[0] as V6TextCommand).lineHeight, "normal");
});

test("mapRenderedElements — rect + text both emitted when element has paint AND text", () => {
  const result = mapRenderedElements(
    extract(
      el({
        isTextLeaf: true,
        text: "CTA",
        bounds: { left: 0, top: 0, width: 200, height: 60 },
        style: {
          backgroundColor: "rgb(14, 165, 233)",
          borderTopLeftRadius: "12px",
          borderTopRightRadius: "12px",
          borderBottomRightRadius: "12px",
          borderBottomLeftRadius: "12px",
          color: "rgb(255, 255, 255)",
          fontSize: "18px",
        },
      }),
    ),
  );
  assert.equal(result.commands.length, 2);
  assert.equal(result.commands[0]?.primitive, "rect");
  assert.equal(result.commands[1]?.primitive, "text");
  const rect = result.commands[0] as V6RectCommand;
  assert.equal(rect.fill, "#0EA5E9");
  assert.equal(rect.borderRadius, 12);
});

test("mapRenderedElements — borderRadius returns tuple when corners differ", () => {
  const result = mapRenderedElements(
    extract(
      el({
        style: {
          backgroundColor: "rgb(255, 255, 255)",
          borderTopLeftRadius: "4px",
          borderTopRightRadius: "8px",
          borderBottomRightRadius: "12px",
          borderBottomLeftRadius: "16px",
        },
      }),
    ),
  );
  const rect = result.commands[0] as V6RectCommand;
  assert.deepEqual(rect.borderRadius, [4, 8, 12, 16]);
});

test("mapRenderedElements — 퍼센트 borderRadius를 bounds 기준 px radius로 정규화한다", () => {
  const result = mapRenderedElements(
    extract(
      el({
        bounds: { left: 670, top: 89, width: 450, height: 450 },
        style: {
          backgroundColor: "rgb(255, 255, 255)",
          borderTopLeftRadius: "50%",
          borderTopRightRadius: "50%",
          borderBottomRightRadius: "50%",
          borderBottomLeftRadius: "50%",
        },
      }),
    ),
  );
  const rect = result.commands[0] as V6RectCommand;
  assert.equal(rect.borderRadius, 225);
});

test("mapRenderedElements — 이미지 퍼센트 borderRadius도 px radius로 보존한다", () => {
  const result = mapRenderedElements(
    extract(
      el({
        tagName: "img",
        bounds: { left: 695, top: 114, width: 400, height: 400 },
        img: {
          src: "placeholder://cute-dog-on-cooling-mat",
          naturalWidth: 1,
          naturalHeight: 1,
          alt: "cute dog on cooling mat",
        },
        style: {
          objectFit: "cover",
          borderTopLeftRadius: "50%",
          borderTopRightRadius: "50%",
          borderBottomRightRadius: "50%",
          borderBottomLeftRadius: "50%",
        },
      }),
    ),
  );
  const image = result.commands[0] as V6ImageCommand;
  assert.equal(image.primitive, "bitmap");
  assert.equal(image.objectFit, "cover");
  assert.equal(image.borderRadius, 200);
});

test("mapRenderedElements — 같은 bounds의 rounded overflow 부모 clip을 이미지 radius로 반영한다", () => {
  const result = mapRenderedElements(
    extract(
      el({
        serial: 1,
        path: "0.2.0",
        bounds: { left: 695, top: 114, width: 410, height: 410 },
        style: {
          backgroundColor: "rgb(225, 245, 254)",
          borderTopLeftRadius: "50%",
          borderTopRightRadius: "50%",
          borderBottomRightRadius: "50%",
          borderBottomLeftRadius: "50%",
          overflow: "hidden",
        },
      }),
      el({
        serial: 2,
        path: "0.2.0.0",
        tagName: "img",
        bounds: { left: 695, top: 114, width: 410, height: 410 },
        img: {
          src: "placeholder://happy-dog-on-cooling-mat",
          naturalWidth: 1,
          naturalHeight: 1,
          alt: "happy dog on cooling mat",
        },
        style: {
          objectFit: "cover",
        },
      }),
    ),
  );

  const image = result.commands.find(
    (cmd): cmd is V6ImageCommand => cmd.primitive === "bitmap",
  );
  assert.ok(image, "expected a bitmap command");
  assert.equal(image.borderRadius, 205);
});

test("mapRenderedElements — bounds가 다른 부모 clip은 이미지 radius로 추정하지 않는다", () => {
  const result = mapRenderedElements(
    extract(
      el({
        serial: 1,
        path: "0.2",
        bounds: { left: 670, top: 89, width: 450, height: 450 },
        style: {
          backgroundColor: "rgb(255, 255, 255)",
          borderTopLeftRadius: "50%",
          borderTopRightRadius: "50%",
          borderBottomRightRadius: "50%",
          borderBottomLeftRadius: "50%",
          overflow: "hidden",
        },
      }),
      el({
        serial: 2,
        path: "0.2.0",
        tagName: "img",
        bounds: { left: 695, top: 114, width: 410, height: 410 },
        img: {
          src: "placeholder://happy-dog-on-cooling-mat",
          naturalWidth: 1,
          naturalHeight: 1,
          alt: "happy dog on cooling mat",
        },
        style: {
          objectFit: "cover",
        },
      }),
    ),
  );

  const image = result.commands.find(
    (cmd): cmd is V6ImageCommand => cmd.primitive === "bitmap",
  );
  assert.ok(image, "expected a bitmap command");
  assert.equal(image.borderRadius, 0);
});

test("mapRenderedElements — <img> jpg → image, png → bitmap, placeholder:// → bitmap", () => {
  const cases: Array<{ src: string; expected: "image" | "bitmap" }> = [
    { src: "https://cdn/foo.jpg", expected: "image" },
    { src: "https://cdn/foo.jpeg?v=2", expected: "image" },
    { src: "https://cdn/foo.png", expected: "bitmap" },
    { src: "placeholder://hero.png", expected: "bitmap" },
    { src: "data:image/jpeg;base64,abc", expected: "image" },
    { src: "data:image/png;base64,abc", expected: "bitmap" },
  ];
  for (const c of cases) {
    const result = mapRenderedElements(
      extract(
        el({
          tagName: "img",
          img: { src: c.src, naturalWidth: 100, naturalHeight: 100, alt: "" },
        }),
      ),
    );
    const cmd = result.commands[0] as V6ImageCommand;
    assert.equal(
      cmd.primitive,
      c.expected,
      `${c.src} should classify as ${c.expected}`,
    );
    assert.equal(cmd.src, c.src);
  }
});

test("mapRenderedElements — <svg> preserves outerHTML, doesn't descend", () => {
  const result = mapRenderedElements(
    extract(
      el({
        tagName: "svg",
        bounds: { left: 10, top: 20, width: 80, height: 80 },
        svg: {
          outerHTML:
            '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="red"/></svg>',
        },
      }),
    ),
  );
  assert.equal(result.commands.length, 1);
  const cmd = result.commands[0] as V6SvgCommand;
  assert.equal(cmd.primitive, "svg");
  assert.match(cmd.outerHTML, /<circle/);
  assert.deepEqual(cmd.bounds, { left: 10, top: 20, width: 80, height: 80 });
});

test("mapRenderedElements — invisible / zero-area elements skipped", () => {
  const result = mapRenderedElements(
    extract(
      el({ visible: false, style: { backgroundColor: "rgb(255,0,0)" } }),
      el({ visible: true, style: { backgroundColor: "rgb(0,255,0)" } }),
    ),
  );
  assert.equal(result.commands.length, 1);
  assert.equal((result.commands[0] as V6RectCommand).fill, "#00FF00");
});

test("mapRenderedElements — no paint + no text → no command (wrapper skipped)", () => {
  const result = mapRenderedElements(
    extract(el({ hasChildren: true })), // transparent bg, no text, no border
  );
  assert.equal(result.commands.length, 0);
});

test("mapRenderedElements는 unsupported backgroundImage를 fill 없는 rect로 숨기지 않는다", () => {
  const result = mapRenderedElements(
    extract(
      el({
        style: {
          backgroundImage: "conic-gradient(from 45deg, red, blue)",
        },
      }),
    ),
  );
  const cmd = result.commands[0] as V6RectCommand;
  assert.equal(cmd.primitive, "rect");
  assert.ok(
    cmd.fill !== null,
    "unsupported paint should be explicit fill token",
  );
  assert.equal(typeof cmd.fill, "object");
  if (cmd.fill !== null && typeof cmd.fill === "object") {
    assert.equal(cmd.fill.type, "unsupported-paint");
  }
  assert.equal(cmd.paint?.type, "unsupported-paint");
});

test("mapRenderedElements — opacity and transform flow through", () => {
  const result = mapRenderedElements(
    extract(
      el({
        style: {
          backgroundColor: "rgb(10, 20, 30)",
          opacity: "0.5",
          transform: "rotate(5deg)",
        },
      }),
    ),
  );
  const cmd = result.commands[0] as V6RectCommand;
  assert.equal(cmd.opacity, 0.5);
  assert.equal(cmd.transform, "rotate(5deg)");
});

test("mapRenderedElements — layout-only ancestor transform flows to child primitives", () => {
  const result = mapRenderedElements(
    extract(
      el({
        serial: 0,
        path: "0",
        bounds: { left: 600, top: 40, width: 420, height: 520 },
        style: {
          transform: "rotate(5deg)",
        },
      }),
      el({
        serial: 1,
        path: "0.0",
        bounds: { left: 620, top: 60, width: 400, height: 500 },
        style: {
          backgroundColor: "rgb(255, 255, 255)",
          borderTopLeftRadius: "12px",
          borderTopRightRadius: "12px",
          borderBottomRightRadius: "12px",
          borderBottomLeftRadius: "12px",
        },
      }),
      el({
        serial: 2,
        path: "0.0.0",
        tagName: "svg",
        bounds: { left: 800, top: 90, width: 40, height: 40 },
        svg: {
          outerHTML:
            '<svg viewBox="0 0 24 24"><path d="M14 2H6"/></svg>',
        },
      }),
    ),
  );

  assert.equal(result.commands.length, 2);
  assert.equal(result.commands[0]?.transform, "rotate(5deg)");
  assert.equal(result.commands[1]?.transform, "rotate(5deg)");
});

test("mapRenderedElements — own transform wins over ancestor transform", () => {
  const result = mapRenderedElements(
    extract(
      el({
        serial: 0,
        path: "0",
        style: {
          transform: "rotate(5deg)",
        },
      }),
      el({
        serial: 1,
        path: "0.0",
        style: {
          backgroundColor: "rgb(10, 20, 30)",
          transform: "rotate(-2deg)",
        },
      }),
    ),
  );

  assert.equal(result.commands.length, 1);
  assert.equal(result.commands[0]?.transform, "rotate(-2deg)");
});

test("mapRenderedElements — stroke captured when border width > 0", () => {
  const result = mapRenderedElements(
    extract(
      el({
        style: {
          backgroundColor: "rgba(0,0,0,0)",
          borderTopWidth: "2px",
          borderTopColor: "rgb(15, 23, 42)",
        },
      }),
    ),
  );
  const cmd = result.commands[0] as V6RectCommand;
  assert.equal(cmd.stroke?.color, "#0F172A");
  assert.equal(cmd.stroke?.width, 2);
});

test("mapRenderedElements는 textShadow와 filter 문자열을 text command에 보존한다", () => {
  const result = mapRenderedElements(
    extract(
      el({
        isTextLeaf: true,
        text: "Shadow",
        style: {
          textShadow: "2px 4px 8px rgba(0, 0, 0, 0.4)",
          filter: "drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.25))",
        },
      }),
    ),
  );
  const cmd = result.commands.find(
    (c): c is V6TextCommand => c.primitive === "text",
  );
  assert.ok(cmd, "expected text command");
  assert.equal(cmd.textShadow, "2px 4px 8px rgba(0, 0, 0, 0.4)");
  assert.equal(cmd.filter, "drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.25))");
});

test("mapRenderedElements — serial + path preserved for traceability", () => {
  const result = mapRenderedElements(
    extract(
      el({
        serial: 42,
        path: "0.3.1",
        tagName: "span",
        style: { backgroundColor: "rgb(1,2,3)" },
      }),
    ),
  );
  const cmd = result.commands[0] as V6RectCommand;
  assert.deepEqual(cmd.source, { serial: 42, path: "0.3.1", tag: "span" });
});

// --------- parser-level tests ---------

test("parseColor — rgb and rgba", () => {
  assert.deepEqual(parseColor("rgb(255, 100, 50)"), {
    hex: "#FF6432",
    alpha: 1,
    cssColor: "rgb(255, 100, 50)",
  });
  assert.deepEqual(parseColor("rgba(0, 0, 0, 0.5)"), {
    hex: "#000000",
    alpha: 0.5,
    cssColor: "rgba(0, 0, 0, 0.5)",
  });
  assert.deepEqual(parseColor("rgba(0, 0, 0, 0)"), {
    hex: "#000000",
    alpha: 0,
    cssColor: "rgba(0, 0, 0, 0)",
  });
  assert.deepEqual(parseColor("transparent"), {
    hex: "#000000",
    alpha: 0,
    cssColor: "transparent",
  });
  assert.equal(parseColor(""), null);
  assert.equal(parseColor("none"), null);
});

test("parseLinearGradient — angle form", () => {
  const g = parseLinearGradient(
    "linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 0, 255))",
  );
  assert.ok(g);
  assert.equal(g.angle, 90);
  assert.equal(g.stops[0]?.color, "#FF0000");
  assert.equal(g.stops[1]?.color, "#0000FF");
});

test("parseLinearGradient — `to bottom right` direction", () => {
  const g = parseLinearGradient(
    "linear-gradient(to bottom right, rgb(255,0,0), rgb(0,0,255))",
  );
  assert.ok(g);
  assert.equal(g.angle, 135);
});

test("parseLinearGradient — single-stop returns null (need at least 2)", () => {
  assert.equal(parseLinearGradient("linear-gradient(90deg, rgb(0,0,0))"), null);
});

test("parseLinearGradient — explicit stop percentages preserved", () => {
  const g = parseLinearGradient(
    "linear-gradient(180deg, rgb(255,0,0) 20%, rgb(0,0,255) 80%)",
  );
  assert.ok(g);
  assert.equal(g.stops[0]?.offset, 0.2);
  assert.equal(g.stops[1]?.offset, 0.8);
});

test("parseLinearGradient는 stop alpha를 보존한다", () => {
  const g = parseLinearGradient(
    "linear-gradient(90deg, rgba(255,0,0,0.25), #0000FF80)",
  );
  assert.ok(g);
  assert.equal(g.stops[0]?.color, "#FF0000");
  assert.equal(g.stops[0]?.alpha, 0.25);
  assert.equal(g.stops[0]?.cssColor, "rgba(255,0,0,0.25)");
  assert.equal(g.stops[1]?.color, "#0000FF");
  assert.equal(g.stops[1]?.alpha, 0.502);
  assert.equal(g.stops[1]?.cssColor, "#0000FF80");
});

test("parseRadialGradient는 circle position과 stop을 보존한다", () => {
  const g = parseRadialGradient(
    "radial-gradient(circle at 75% 50%, #FF4500, #8B0000)",
  );
  assert.ok(g);
  assert.equal(g.shape, "circle");
  assert.equal(g.position, "75% 50%");
  assert.equal(g.stops[0]?.color, "#FF4500");
  assert.equal(g.stops[1]?.color, "#8B0000");
});

test("parseLinearGradient — `none` and empty return null", () => {
  assert.equal(parseLinearGradient("none"), null);
  assert.equal(parseLinearGradient(""), null);
});
