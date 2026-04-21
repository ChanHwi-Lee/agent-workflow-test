import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFontFaceCSS,
  buildFontFaceStyleBlock,
  injectFontFaceStyle,
  loadV6FontRegistry,
  parseFirstFontFamily,
  type V6FontRegistry,
} from "./v6FontRegistry.js";

test("loadV6FontRegistry — reads agent-workflow-test/fonts/registry.json SSOT", () => {
  const registry = loadV6FontRegistry();
  assert.equal(registry.schemaVersion, 1);
  assert.ok(registry.cdnBase.length > 0);
  assert.ok(registry.fonts.length > 0);
  assert.equal(registry.default.toolditorId.length > 0, true);
});

test("buildFontFaceCSS — emits one @font-face per entry using Toolditor IDs", () => {
  const fakeRegistry: V6FontRegistry = {
    schemaVersion: 1,
    cdnBase: "https://cdn.example.com/font/",
    fonts: [
      {
        toolditorId: "701_400",
        weight: 400,
        style: "normal",
        fontName: "Nanum",
        fontFace: "NanumBarunGothic",
        category: "Gothic",
        languages: ["KOR"],
        savedFilename: "701_400.woff",
        format: "woff",
      },
      {
        toolditorId: "701_700",
        weight: 700,
        style: "normal",
        fontName: "Nanum Bold",
        fontFace: "NanumBarunGothic",
        category: "Gothic",
        languages: ["KOR"],
        savedFilename: "701_700.woff",
        format: "woff",
      },
    ],
    default: { toolditorId: "701_400" },
  };
  const css = buildFontFaceCSS(fakeRegistry);
  assert.match(css, /@font-face/);
  assert.match(css, /font-family: "701_400"/);
  assert.match(css, /font-family: "701_700"/);
  // cdnBase trailing slash must be normalized, producing clean URLs
  assert.match(css, /url\("https:\/\/cdn\.example\.com\/font\/701_400\.woff"\)/);
  // weight + style + font-display are present
  assert.match(css, /font-weight: 400/);
  assert.match(css, /font-weight: 700/);
  assert.match(css, /font-display: block/);
});

test("buildFontFaceStyleBlock — wraps CSS in <style>", () => {
  const block = buildFontFaceStyleBlock({
    schemaVersion: 1,
    cdnBase: "https://x/",
    fonts: [
      {
        toolditorId: "1_400",
        weight: 400,
        style: "normal",
        fontName: "x",
        fontFace: "x",
        category: "g",
        languages: ["KOR"],
        savedFilename: "1_400.woff",
        format: "woff",
      },
    ],
    default: { toolditorId: "1_400" },
  });
  assert.ok(block.startsWith("<style>"));
  assert.ok(block.endsWith("</style>"));
  assert.match(block, /@font-face/);
});

test("injectFontFaceStyle — inserts before </head> when present", () => {
  const html =
    '<!DOCTYPE html><html><head><title>t</title></head><body><div></div></body></html>';
  const out = injectFontFaceStyle(html, "<style>X</style>");
  assert.match(out, /<style>X<\/style>\n<\/head>/);
});

test("injectFontFaceStyle — inserts before <body when no </head>", () => {
  const html = '<html><body style="margin:0"><div></div></body></html>';
  const out = injectFontFaceStyle(html, "<style>Y</style>");
  assert.match(out, /<style>Y<\/style>\n<body style="margin:0">/);
});

test("injectFontFaceStyle — prepends when no </head> and no <body", () => {
  const html = "<div></div>";
  const out = injectFontFaceStyle(html, "<style>Z</style>");
  assert.equal(out, "<style>Z</style>\n<div></div>");
});

test("parseFirstFontFamily — strips quotes and trailing fallbacks", () => {
  assert.equal(parseFirstFontFamily('"701_400", sans-serif'), "701_400");
  assert.equal(parseFirstFontFamily("'701_700'"), "701_700");
  assert.equal(parseFirstFontFamily("Inter, Arial, sans-serif"), "Inter");
  assert.equal(parseFirstFontFamily("system-ui"), "system-ui");
});
