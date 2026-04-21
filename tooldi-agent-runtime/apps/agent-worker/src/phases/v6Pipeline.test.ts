import assert from "node:assert/strict";
import test from "node:test";

import {
  V6EmptyCommandsError,
  V6HtmlValidationError,
  runV6Pipeline,
} from "./v6Pipeline.js";
import type {
  V6PipelineDependencies,
  V6PipelineInput,
} from "./v6Pipeline.js";
import type {
  V6Canvas,
  V6ExtractionResult,
  V6MappingResult,
  V6PrimitiveCommand,
  V6RectCommand,
} from "./v6Types.js";
import type {
  V6HtmlValidationIssue,
  V6HtmlValidationResult,
} from "./v6HtmlValidator.js";
import type { V6HtmlGenResult } from "./v6HtmlGen.js";

function makeInput(
  overrides: Partial<V6PipelineInput> = {},
): V6PipelineInput {
  return {
    runId: "run-1",
    canvasWidth: 1200,
    canvasHeight: 628,
    userPrompt: "봄 세일 이벤트 배너",
    apiKey: "fake",
    ...overrides,
  };
}

const FAKE_HTML = '<div style="width:1200px;height:628px;background:#FFF"></div>';

const FAKE_GEN_RESULT: V6HtmlGenResult = {
  model: "gemini-3.1-flash-lite-preview",
  html: FAKE_HTML,
  rawHtml: FAKE_HTML,
  latencyMs: 123,
  finishReason: "STOP",
  usage: {
    promptTokenCount: 10,
    candidatesTokenCount: 20,
    totalTokenCount: 30,
    thoughtsTokenCount: null,
    cachedContentTokenCount: null,
  },
  finishedAt: new Date(0).toISOString(),
};

const FAKE_EXTRACTION: V6ExtractionResult = {
  canvas: { width: 1200, height: 628 },
  elements: [],
};

const FAKE_COMMAND: V6RectCommand = {
  type: "create",
  primitive: "rect",
  source: { serial: 0, path: "0", tag: "div" },
  bounds: { left: 0, top: 0, width: 1200, height: 628 },
  opacity: 1,
  fill: "#FFFFFF",
  borderRadius: 0,
  stroke: null,
  shadow: null,
};

function makeDeps(overrides: Partial<V6PipelineDependencies> = {}): V6PipelineDependencies {
  return {
    generateHtml: async () => FAKE_GEN_RESULT,
    validateHtml: (): V6HtmlValidationResult => ({ ok: true, issues: [] }),
    renderAndExtract: async (_html: string, _canvas: V6Canvas) => FAKE_EXTRACTION,
    mapElements: (): V6MappingResult => ({
      canvas: { width: 1200, height: 628 },
      commands: [FAKE_COMMAND],
    }),
    ...overrides,
  };
}

test("runV6Pipeline — runs Stage 1→2→3 in order and returns commands", async () => {
  const calls: string[] = [];
  const deps = makeDeps({
    generateHtml: async (args) => {
      calls.push("generate");
      assert.equal(args.canvasWidth, 1200);
      assert.equal(args.canvasHeight, 628);
      assert.equal(args.userPrompt, "봄 세일 이벤트 배너");
      return FAKE_GEN_RESULT;
    },
    validateHtml: (html) => {
      calls.push("validate");
      assert.equal(html, FAKE_HTML);
      return { ok: true, issues: [] };
    },
    renderAndExtract: async (html, canvas) => {
      calls.push("render");
      assert.equal(html, FAKE_HTML);
      assert.deepEqual(canvas, { width: 1200, height: 628 });
      return FAKE_EXTRACTION;
    },
    mapElements: (extraction) => {
      calls.push("map");
      assert.equal(extraction, FAKE_EXTRACTION);
      return { canvas: FAKE_EXTRACTION.canvas, commands: [FAKE_COMMAND] };
    },
  });

  const result = await runV6Pipeline(makeInput(), deps);

  assert.deepEqual(calls, ["generate", "validate", "render", "map"]);
  assert.equal(result.commands.length, 1);
  assert.equal(result.html, FAKE_HTML);
  assert.equal(result.usage?.totalTokenCount, 30);
  assert.equal(result.model, "gemini-3.1-flash-lite-preview");
  assert.equal(result.latency.htmlGenMs, 123);
  assert.ok(result.latency.renderMs >= 0);
  assert.ok(result.latency.totalMs >= 0);
});

test("runV6Pipeline — passes optional trend context only to HTML generation", async () => {
  let observedTrendContext: string | null | undefined;
  const deps = makeDeps({
    generateHtml: async (args) => {
      observedTrendContext = args.trendContext;
      return FAKE_GEN_RESULT;
    },
  });

  await runV6Pipeline(
    makeInput({
      userPrompt: "카페 신메뉴 배너",
      trendContext: "Palette inspiration: #FF7F50, #E6F7FF",
    }),
    deps,
  );

  assert.equal(
    observedTrendContext,
    "Palette inspiration: #FF7F50, #E6F7FF",
  );
});

test("runV6Pipeline — throws V6HtmlValidationError when validation fails; skips render and map", async () => {
  let renderCalled = false;
  let mapCalled = false;
  const validationIssues: V6HtmlValidationIssue[] = [
    {
      code: "forbidden_tag",
      severity: "error",
      message: "forbidden tag <script>",
      path: "0.0",
    },
  ];
  const deps = makeDeps({
    validateHtml: () => ({ ok: false, issues: validationIssues }),
    renderAndExtract: async () => {
      renderCalled = true;
      return FAKE_EXTRACTION;
    },
    mapElements: () => {
      mapCalled = true;
      return { canvas: FAKE_EXTRACTION.canvas, commands: [] };
    },
  });

  await assert.rejects(
    () => runV6Pipeline(makeInput(), deps),
    (err: unknown) => {
      assert.ok(err instanceof V6HtmlValidationError);
      assert.equal(err.issues.length, 1);
      assert.equal(err.html, FAKE_HTML);
      return true;
    },
  );
  assert.equal(renderCalled, false, "render should not run when validation fails");
  assert.equal(mapCalled, false, "map should not run when validation fails");
});

test("runV6Pipeline — throws V6EmptyCommandsError when mapper returns 0 commands", async () => {
  const deps = makeDeps({
    mapElements: () => ({ canvas: FAKE_EXTRACTION.canvas, commands: [] }),
  });

  await assert.rejects(
    () => runV6Pipeline(makeInput(), deps),
    (err: unknown) => {
      assert.ok(err instanceof V6EmptyCommandsError);
      assert.equal(err.html, FAKE_HTML);
      return true;
    },
  );
});

test("runV6Pipeline — propagates generator errors (e.g. API failure)", async () => {
  const deps = makeDeps({
    generateHtml: async () => {
      throw new Error("upstream 500");
    },
  });

  await assert.rejects(
    () => runV6Pipeline(makeInput(), deps),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /upstream 500/);
      return true;
    },
  );
});

test("runV6Pipeline — latency.renderMs reflects only the render step", async () => {
  const deps = makeDeps({
    generateHtml: async () => {
      await new Promise((r) => setTimeout(r, 20));
      return FAKE_GEN_RESULT;
    },
    renderAndExtract: async () => {
      await new Promise((r) => setTimeout(r, 40));
      return FAKE_EXTRACTION;
    },
  });

  const result = await runV6Pipeline(makeInput(), deps);

  assert.ok(result.latency.renderMs >= 35, `renderMs too low: ${result.latency.renderMs}`);
  assert.ok(result.latency.totalMs >= 55, `totalMs too low: ${result.latency.totalMs}`);
  // htmlGenMs is supplied by the generator (fake = 123), not measured here.
  assert.equal(result.latency.htmlGenMs, 123);
});

test("runV6Pipeline — commands list is read-only type (compile-time) and flows through intact", async () => {
  const cmd2: V6PrimitiveCommand = {
    ...FAKE_COMMAND,
    source: { serial: 1, path: "0.1", tag: "div" },
  };
  const deps = makeDeps({
    mapElements: () => ({
      canvas: FAKE_EXTRACTION.canvas,
      commands: [FAKE_COMMAND, cmd2],
    }),
  });

  const result = await runV6Pipeline(makeInput(), deps);
  assert.equal(result.commands.length, 2);
  assert.equal(result.commands[0]?.source.path, "0");
  assert.equal(result.commands[1]?.source.path, "0.1");
});
