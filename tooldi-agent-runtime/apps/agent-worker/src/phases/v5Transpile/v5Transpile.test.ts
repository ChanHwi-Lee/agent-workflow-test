import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { transpileHtmlToCommands } from "./index.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

function resolveBenchFixturesDir(): string | null {
  let candidate = TEST_DIR;
  for (let depth = 0; depth < 12; depth++) {
    candidate = path.dirname(candidate);
    const trial = path.join(
      candidate,
      "tws-editor-api/agent-workflow-test/bench/method-compare-phase1/outputs-3.1-flash-lite-v2/method-b",
    );
    if (existsSync(trial)) return trial;
  }
  return null;
}

const SAMPLE_HTML = `
<div style="position:relative; width:1200px; height:628px; overflow:hidden;">
  <div style="position:absolute; left:0px; top:0px; width:1200px; height:628px; background-color:#FFF5E1;"></div>
  <img data-tooldi-role="hero" data-hint="fresh strawberry drink" data-aspect="4:5" src="placeholder://" style="position:absolute; left:720px; top:80px; width:420px; height:468px;" />
  <h1 style="position:absolute; left:80px; top:140px; width:600px; height:110px; font-family:BlackHanSans; font-size:84px; font-weight:900; color:#222222; text-align:left; line-height:1.1;">봄 신메뉴 오픈</h1>
  <p style="position:absolute; left:80px; top:270px; width:600px; height:80px; font-family:Pretendard; font-size:36px; font-weight:500; color:#555555; text-align:left; line-height:1.3;">딸기 라떼 할인 진행중</p>
  <div style="position:absolute; left:80px; top:420px; width:260px; height:72px; background-color:#E53935; border-radius:36px;"></div>
  <span style="position:absolute; left:80px; top:440px; width:260px; height:32px; font-family:Pretendard; font-size:28px; font-weight:700; color:#FFFFFF; text-align:center;">지금 주문하기</span>
</div>
`;

test("transpileHtmlToCommands produces one command per visible element (6 total)", () => {
  const { commands, warnings } = transpileHtmlToCommands(SAMPLE_HTML, {
    runId: "test-run",
  });
  assert.equal(commands.length, 6);
  assert.deepEqual(warnings, []);
  const layerTypes = commands.map((c) => c.layerBlueprint.layerType);
  assert.deepEqual(layerTypes, [
    "shape",
    "image",
    "text",
    "text",
    "shape",
    "text",
  ]);
  for (const cmd of commands) {
    assert.equal(cmd.op, "createLayer");
    assert.equal(cmd.executionSlotKey, null);
    assert.ok(cmd.layerBlueprint.bounds);
  }
});

test("transpileHtmlToCommands carries copy text + font metadata on text layers", () => {
  const { commands } = transpileHtmlToCommands(SAMPLE_HTML, {
    runId: "test-run",
  });
  const headline = commands.find(
    (c) => c.layerBlueprint.metadata.copyText === "봄 신메뉴 오픈",
  );
  assert.ok(headline);
  assert.equal(headline.layerBlueprint.metadata.customFontSize, 84);
  assert.equal(headline.layerBlueprint.metadata.customFontWeight, 900);
  assert.equal(headline.layerBlueprint.metadata.customFontFamily, "BlackHanSans");
});

test("transpileHtmlToCommands carries source triple on image layer", () => {
  const { commands } = transpileHtmlToCommands(SAMPLE_HTML, {
    runId: "test-run",
  });
  const img = commands.find((c) => c.layerBlueprint.layerType === "image");
  assert.ok(img);
  assert.equal(img.layerBlueprint.metadata.sourceOriginUrl, "placeholder://");
  assert.equal(img.layerBlueprint.metadata.sourceWidth, 400);
  assert.equal(img.layerBlueprint.metadata.sourceHeight, 500);
  assert.equal(img.layerBlueprint.metadata.role, "hero");
});

test("transpileHtmlToCommands produces stable clientLayerKey per run/seq", () => {
  const { commands } = transpileHtmlToCommands(SAMPLE_HTML, {
    runId: "test-run",
  });
  const keys = commands.map((c) => c.clientLayerKey);
  assert.ok(keys.every((k) => k.startsWith("transpile:test-run:")));
  assert.equal(new Set(keys).size, keys.length);
});

test("transpileHtmlToCommands handles missing root gracefully", () => {
  const { commands, warnings } = transpileHtmlToCommands("   ", {
    runId: "nope",
  });
  assert.deepEqual(commands, []);
  assert.equal(warnings[0]?.code, "root_not_found");
});

test("transpileHtmlToCommands skips invisible divs and empty text", () => {
  const html = `
    <div style="position:relative; width:1200px; height:628px;">
      <div style="position:absolute; left:0px; top:0px; width:100px; height:100px;"></div>
      <span style="position:absolute; left:0px; top:0px; width:100px; height:100px;"></span>
    </div>
  `;
  const { commands, warnings } = transpileHtmlToCommands(html, {
    runId: "skip-run",
  });
  assert.equal(commands.length, 0);
  assert.ok(
    warnings.some((w) => w.code === "skipped_invisible_block"),
    "expected skipped_invisible_block warning",
  );
  assert.ok(
    warnings.some((w) => w.code === "text_content_empty"),
    "expected text_content_empty warning",
  );
});

test("transpileHtmlToCommands parses gradient fills on shape layers", () => {
  const html = `
    <div style="position:relative; width:1200px; height:628px;">
      <div style="position:absolute; left:0px; top:0px; width:1200px; height:628px; background-image:linear-gradient(135deg, #FF5722, #FFC107);"></div>
    </div>
  `;
  const { commands } = transpileHtmlToCommands(html, { runId: "grad-run" });
  assert.equal(commands.length, 1);
  const shape = commands[0];
  assert.ok(shape);
  assert.equal(shape.layerBlueprint.layerType, "shape");
  assert.equal(shape.layerBlueprint.styleTokens?.fillColor, "#FF5722");
  assert.equal(shape.layerBlueprint.styleTokens?.secondaryColor, "#FFC107");
  assert.equal(shape.layerBlueprint.styleTokens?.gradientAngle, 135);
});

const benchDir = resolveBenchFixturesDir();

if (benchDir) {
  const files = readdirSync(benchDir)
    .filter((f) => f.startsWith("prompt_") && f.endsWith(".json"))
    .sort();

  for (const file of files) {
    test(`v2 bench fixture ${file}: transpiles into 3~12 bounded commands`, () => {
      const raw = readFileSync(path.join(benchDir, file), "utf8");
      const parsed = JSON.parse(raw) as { outputText?: string };
      const html = parsed.outputText ?? "";
      const { commands } = transpileHtmlToCommands(html, {
        runId: `fixture-${file}`,
      });
      assert.ok(
        commands.length >= 3,
        `expected ≥3 commands, got ${commands.length}`,
      );
      assert.ok(
        commands.length <= 12,
        `expected ≤12 commands, got ${commands.length}`,
      );
      for (const cmd of commands) {
        const blueprint = cmd.layerBlueprint;
        assert.ok(blueprint.bounds.width > 0);
        assert.ok(blueprint.bounds.height > 0);
        assert.ok(blueprint.bounds.x >= 0);
        assert.ok(blueprint.bounds.y >= 0);
      }
    });
  }
}
