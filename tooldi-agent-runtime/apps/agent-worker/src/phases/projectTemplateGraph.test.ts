import assert from "node:assert/strict";
import test from "node:test";

import { projectTemplateObjectGraph } from "./projectTemplateGraph.js";

function assertApproxEqual(actual: number, expected: number, epsilon = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

function createInput(objects: Record<string, unknown>[]) {
  return {
    runId: "run-test",
    traceId: "trace-test",
    templateCode: "test-template",
    templateTitle: "테스트 템플릿",
    page: {
      width: 1200,
      height: 628,
      objects,
    },
  };
}

test("projectTemplateObjectGraph excludes group objects and keeps their children", () => {
  const input = createInput([
    { type: "image", left: 0, top: 0, width: 1200, height: 628, opacity: 1 },
    { type: "textbox", left: 100, top: 100, width: 400, height: 60, opacity: 1, text: "제목 텍스트", fontSize: 48 },
    {
      type: "group",
      left: 300,
      top: 400,
      width: 250,
      height: 56,
      opacity: 1,
      objects: [
        { type: "rect", left: 0, top: 0, width: 250, height: 56, opacity: 1, fill: "#ff0000" },
        { type: "textbox", left: 10, top: 10, width: 230, height: 36, opacity: 1, text: "버튼 텍스트", fontSize: 20 },
      ],
    },
  ]);

  const graph = projectTemplateObjectGraph(input);

  const layerTypes = graph.objects.map((o) => o.layerType);
  assert.ok(
    !layerTypes.includes("group"),
    `projected graph should not contain group objects; got: [${layerTypes.join(", ")}]`,
  );

  // Group's children (rect + textbox) should be individually projected
  const textObjects = graph.objects.filter((o) => o.layerType === "text");
  const buttonText = textObjects.find((o) => o.sourceText === "버튼 텍스트");
  assert.ok(buttonText, "group's text child should appear as individual text object");

  const shapeObjects = graph.objects.filter((o) => o.layerType === "shape");
  assert.ok(shapeObjects.length >= 1, "group's shape child should appear as individual shape object");
});

test("projectTemplateObjectGraph produces flat list without group for template with nested groups", () => {
  const input = createInput([
    { type: "textbox", left: 50, top: 50, width: 300, height: 40, opacity: 1, text: "상단 텍스트", fontSize: 32 },
    {
      type: "group",
      left: 100,
      top: 200,
      width: 400,
      height: 100,
      opacity: 1,
      objects: [
        { type: "rect", left: 0, top: 0, width: 400, height: 100, opacity: 1 },
        {
          type: "group",
          left: 10,
          top: 10,
          width: 200,
          height: 40,
          opacity: 1,
          objects: [
            { type: "textbox", left: 5, top: 5, width: 190, height: 30, opacity: 1, text: "중첩 그룹 텍스트", fontSize: 16 },
          ],
        },
      ],
    },
  ]);

  const graph = projectTemplateObjectGraph(input);

  const layerTypes = graph.objects.map((o) => o.layerType);
  assert.ok(
    !layerTypes.includes("group"),
    `nested groups should also be excluded; got: [${layerTypes.join(", ")}]`,
  );

  const nestedText = graph.objects.find((o) => o.sourceText === "중첩 그룹 텍스트");
  assert.ok(nestedText, "deeply nested text child should be individually projected");
});

test("projectTemplateObjectGraph resolves group-local child coordinates into absolute canvas space", () => {
  const input = createInput([
    {
      type: "group",
      left: 80,
      top: 420,
      width: 220,
      height: 72,
      opacity: 1,
      objects: [
        {
          type: "rect",
          left: -110,
          top: -36,
          width: 220,
          height: 72,
          opacity: 1,
          fill: "#111111",
        },
        {
          type: "text",
          text: "자세히 보기",
          left: -82,
          top: -16,
          width: 164,
          height: 32,
          opacity: 1,
          fill: "#ffffff",
          textAlign: "center",
          fontSize: 24,
        },
      ],
    },
  ]);

  const graph = projectTemplateObjectGraph(input);
  const rectObject = graph.objects.find(
    (o) => o.layerType === "shape" && o.fillColorHex === "#111111",
  );
  assert.ok(rectObject, "group-local rect should be projected");
  assertApproxEqual(rectObject.bounds.x, 80);
  assertApproxEqual(rectObject.bounds.y, 420);
  assertApproxEqual(rectObject.bounds.width, 220);
  assertApproxEqual(rectObject.bounds.height, 72);

  const textObject = graph.objects.find((o) => o.sourceText === "자세히 보기");
  assert.ok(textObject, "group-local text should be projected");
  assertApproxEqual(textObject.bounds.x, 108);
  assertApproxEqual(textObject.bounds.y, 440);
  assertApproxEqual(textObject.bounds.width, 164);
  assertApproxEqual(textObject.bounds.height, 32);
});

test("projectTemplateObjectGraph preserves declared canvas basis and effective bounds for artifact-style template pages", () => {
  const input = createInput([
    {
      type: "image",
      left: -90.4397014381002,
      left_from_zero: 509.56033994121015,
      top: -82.47995184807735,
      top_from_zero: 231.52004815192277,
      width: 580.125,
      height: 397.45833333333326,
      scaleX: 0.4730059698158347,
      scaleY: 0.4730059698158349,
      originX: "left",
      originY: "top",
      opacity: 1,
    },
    {
      type: "textbox",
      text: "소풍을 즐겨보자",
      left: -501.56973355481716,
      left_from_zero: 98.43030782449318,
      top: 98.56370098526304,
      top_from_zero: 412.56370098526315,
      width: 782.9367530694317,
      height: 122.03999999999999,
      scaleX: 1,
      scaleY: 1,
      originX: "left",
      originY: "top",
      fontSize: "108",
      opacity: 1,
      fill: "#ffffff",
      fontWeight: 700,
    },
    {
      type: "textbox",
      text: "도시락 하나 더 받기",
      left: 352.1878565339714,
      left_from_zero: 952.1878979132817,
      top: 11.62790828322602,
      top_from_zero: 325.62790828322613,
      width: 201.11622967307474,
      height: 25.99,
      scaleX: 1,
      scaleY: 1,
      originX: "center",
      originY: "top",
      fontSize: 20,
      opacity: 1,
      fontWeight: 400,
    },
  ]);

  const graph = projectTemplateObjectGraph(input);
  assert.equal(graph.canvasWidth, 1200);
  assert.equal(graph.canvasHeight, 628);

  const headline = graph.objects.find((o) => o.sourceText === "소풍을 즐겨보자");
  assert.ok(headline, "artifact headline should be projected");
  assertApproxEqual(headline.bounds.x, 98.43030782449318);
  assertApproxEqual(headline.bounds.y, 412.56370098526315);
  assertApproxEqual(headline.bounds.width, 782.9367530694317);
  assertApproxEqual(headline.bounds.height, 122.03999999999999);
  assert.equal(headline.fontSize, 108);

  const image = graph.objects.find((o) => o.layerType === "image");
  assert.ok(image, "artifact image should be projected");
  assertApproxEqual(image.bounds.x, 509.56033994121015);
  assertApproxEqual(image.bounds.y, 231.52004815192277);
  assertApproxEqual(image.bounds.width, 274.4025882394111);
  assertApproxEqual(image.bounds.height, 188.0001644197187);

  const centeredText = graph.objects.find((o) => o.sourceText === "도시락 하나 더 받기");
  assert.ok(centeredText, "artifact centered text should be projected");
  assertApproxEqual(centeredText.bounds.x, 851.6297830767443);
  assertApproxEqual(centeredText.bounds.y, 325.62790828322613);
});

test("projectTemplateObjectGraph annotates local backing surfaces for centered text inside a filled shape", () => {
  const input = createInput([
    {
      type: "rect",
      left: 737.4298101146917,
      top: 109.54525808197775,
      width: 414.57018988530837,
      height: 287.36623662216624,
      opacity: 1,
      fill: "#ffffff",
    },
    {
      type: "textbox",
      text: "메뉴 확인하기",
      left: 952.1878979132817,
      top: 325.62790828322613,
      width: 201.11622967307474,
      height: 25.99,
      originX: "center",
      originY: "top",
      scaleX: 1,
      scaleY: 1,
      textAlign: "center",
      opacity: 1,
      fontSize: 20,
      fill: "#68570f",
    },
  ]);

  const graph = projectTemplateObjectGraph(input);
  const buttonText = graph.objects.find((o) => o.sourceText === "메뉴 확인하기");
  assert.ok(buttonText, "button-like text should be projected");
  assert.equal(buttonText.backingSurfaceColorHex, "#ffffff");
  assert.ok(buttonText.backingSurfaceBounds, "backing surface bounds should be present");
  // 414x287 panel is a large panel, not a button (aspect 1.44, area 15.8%) — stays null.
  assert.equal(buttonText.compositeHint, null);
});

test("projectTemplateObjectGraph promotes compact rounded CTA shape+text to compositeHint=button", () => {
  const input = createInput([
    {
      type: "rect",
      left: 450,
      top: 520,
      width: 300,
      height: 60,
      opacity: 1,
      fill: "#ff6a00",
      rx: 30,
      ry: 30,
    },
    {
      type: "textbox",
      text: "지금 예약하기",
      left: 600,
      top: 540,
      width: 200,
      height: 24,
      originX: "center",
      originY: "top",
      scaleX: 1,
      scaleY: 1,
      textAlign: "center",
      opacity: 1,
      fontSize: 20,
      fill: "#ffffff",
    },
  ]);

  const graph = projectTemplateObjectGraph(input);
  const ctaText = graph.objects.find((o) => o.sourceText === "지금 예약하기");
  assert.ok(ctaText, "CTA text should be projected");
  assert.ok(ctaText.backingSurfaceObjectId, "CTA text should have a backing surface");
  assert.equal(ctaText.compositeHint, "button");
});

test("projectTemplateObjectGraph promotes small top-zone chip+text to compositeHint=badge", () => {
  const input = createInput([
    {
      type: "rect",
      left: 60,
      top: 60,
      width: 120,
      height: 36,
      opacity: 1,
      fill: "#ffd24a",
      rx: 18,
      ry: 18,
    },
    {
      type: "textbox",
      text: "NEW",
      left: 90,
      top: 68,
      width: 60,
      height: 20,
      originX: "left",
      originY: "top",
      scaleX: 1,
      scaleY: 1,
      textAlign: "center",
      opacity: 1,
      fontSize: 16,
      fill: "#111111",
    },
  ]);

  const graph = projectTemplateObjectGraph(input);
  const badgeText = graph.objects.find((o) => o.sourceText === "NEW");
  assert.ok(badgeText, "badge text should be projected");
  assert.ok(badgeText.backingSurfaceObjectId, "badge text should have a backing surface");
  assert.equal(badgeText.compositeHint, "badge");
});

test("projectTemplateObjectGraph keeps compositeHint=null when text has no backing surface", () => {
  const input = createInput([
    {
      type: "textbox",
      text: "지금 예약하기",
      left: 450,
      top: 520,
      width: 300,
      height: 40,
      originX: "left",
      originY: "top",
      scaleX: 1,
      scaleY: 1,
      textAlign: "center",
      opacity: 1,
      fontSize: 24,
      fill: "#111111",
    },
  ]);

  const graph = projectTemplateObjectGraph(input);
  const textObj = graph.objects.find((o) => o.sourceText === "지금 예약하기");
  assert.ok(textObj, "text should be projected");
  assert.equal(textObj.backingSurfaceObjectId, null);
  assert.equal(textObj.compositeHint, null);
});

test("projectTemplateObjectGraph keeps compositeHint=null when backing surface is translucent", () => {
  const input = createInput([
    {
      type: "rect",
      left: 450,
      top: 520,
      width: 300,
      height: 60,
      opacity: 0.4,
      fill: "#ff6a00",
      rx: 30,
      ry: 30,
    },
    {
      type: "textbox",
      text: "지금 예약하기",
      left: 600,
      top: 540,
      width: 200,
      height: 24,
      originX: "center",
      originY: "top",
      scaleX: 1,
      scaleY: 1,
      textAlign: "center",
      opacity: 1,
      fontSize: 20,
      fill: "#ffffff",
    },
  ]);

  const graph = projectTemplateObjectGraph(input);
  const ctaText = graph.objects.find((o) => o.sourceText === "지금 예약하기");
  assert.ok(ctaText, "text should be projected");
  assert.equal(ctaText.compositeHint, null);
});

test("projectTemplateObjectGraph keeps compositeHint=null for text inside a tall near-square backing panel", () => {
  const input = createInput([
    {
      type: "rect",
      left: 120,
      top: 120,
      width: 400,
      height: 380,
      opacity: 1,
      fill: "#ffffff",
    },
    {
      type: "textbox",
      text: "본문 카피가 여기에 들어갑니다 아주 긴 문장",
      left: 150,
      top: 240,
      width: 340,
      height: 120,
      originX: "left",
      originY: "top",
      scaleX: 1,
      scaleY: 1,
      textAlign: "left",
      opacity: 1,
      fontSize: 20,
      fill: "#111111",
    },
  ]);

  const graph = projectTemplateObjectGraph(input);
  const text = graph.objects.find((o) => (o.sourceText ?? "").startsWith("본문 카피"));
  assert.ok(text, "text should be projected");
  assert.ok(text.backingSurfaceObjectId, "text should have a backing surface");
  // Aspect 1.05 (near square) and area ~20% → stays null under false-negative-preferred posture.
  assert.equal(text.compositeHint, null);
});

test("projectTemplateObjectGraph does not classify large inset panels as background", () => {
  const input = createInput([
    {
      type: "rect",
      left: 60,
      top: 40,
      width: 1080,
      height: 540,
      opacity: 1,
      fill: "#ffffff",
    },
  ]);

  const graph = projectTemplateObjectGraph(input);
  const panel = graph.objects[0];
  assert.ok(panel, "large inset panel should be projected");
  assert.equal(panel.visualWeight, "secondary");
  assert.equal(panel.zone, "center");
});

test("projectTemplateObjectGraph preserves sourceAngle and sourceOpacity for rotated/translucent text", () => {
  const input = createInput([
    {
      type: "textbox",
      left: 200,
      top: 100,
      width: 400,
      height: 80,
      angle: -8,
      opacity: 0.85,
      text: "회전된 헤드라인",
      fontSize: 48,
      fill: "#ffffff",
    },
    {
      type: "text",
      left: 800,
      top: 300,
      width: 200,
      height: 40,
      text: "일반 텍스트",
      fontSize: 24,
      fill: "#111111",
    },
  ]);

  const graph = projectTemplateObjectGraph(input);

  const rotatedText = graph.objects.find(
    (obj) => obj.sourceText === "회전된 헤드라인",
  );
  assert.ok(rotatedText, "rotated text should be projected");
  assert.equal(rotatedText?.sourceAngle, -8);
  assertApproxEqual(rotatedText?.sourceOpacity ?? 0, 0.85);

  const plainText = graph.objects.find(
    (obj) => obj.sourceText === "일반 텍스트",
  );
  assert.ok(plainText, "plain text should be projected");
  // non-rotated text: sourceAngle is null (no explicit angle on fixture)
  assert.equal(plainText?.sourceAngle, null);
  assert.equal(plainText?.sourceOpacity, null);
});

test("projectTemplateObjectGraph excludes children hidden by parent group opacity", () => {
  const input = createInput([
    {
      type: "group",
      left: 120,
      top: 120,
      width: 240,
      height: 80,
      opacity: 0,
      objects: [
        {
          type: "rect",
          left: -120,
          top: -40,
          width: 240,
          height: 80,
          opacity: 1,
          fill: "#111111",
        },
        {
          type: "text",
          text: "보이면 안 됨",
          left: -90,
          top: -12,
          width: 180,
          height: 24,
          opacity: 1,
          fill: "#ffffff",
          textAlign: "center",
          fontSize: 20,
        },
      ],
    },
  ]);

  const graph = projectTemplateObjectGraph(input);
  assert.equal(graph.objectCount, 0);
});
