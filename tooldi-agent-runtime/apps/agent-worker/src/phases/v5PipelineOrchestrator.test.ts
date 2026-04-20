import assert from "node:assert/strict";
import test from "node:test";

import { MethodBGenerationError } from "./v5MethodBHtmlGen.js";
import type { MethodBHtmlGenResult } from "./v5MethodBHtmlGen.js";
import type { HtmlValidationResult } from "./v5HtmlValidator.js";
import type {
  AgentCreateLayerCommand,
  TranspileResult,
} from "./v5Transpile/index.js";
import {
  runV5Pipeline,
  V5HtmlValidationError,
  V5TranspileEmptyError,
  type V5PipelineDependencies,
} from "./v5PipelineOrchestrator.js";

const VALID_HTML = "<div></div>";

function makeDeps(overrides: Partial<V5PipelineDependencies> = {}): V5PipelineDependencies {
  const defaultMethodB = async (): Promise<MethodBHtmlGenResult> => ({
    model: "gemini-3.1-flash-lite-preview",
    html: VALID_HTML,
    latencyMs: 1234,
    finishReason: "STOP",
    usage: {
      promptTokenCount: 10,
      candidatesTokenCount: 50,
      totalTokenCount: 60,
      thoughtsTokenCount: null,
      cachedContentTokenCount: null,
    },
    finishedAt: new Date().toISOString(),
  });
  const defaultValidate = (): HtmlValidationResult => ({
    ok: true,
    issues: [],
    childCount: 4,
    rootFound: true,
  });
  const defaultTranspile = (): TranspileResult => {
    const command: AgentCreateLayerCommand = {
      commandId: "cmd:test:001",
      op: "createLayer",
      executionSlotKey: null,
      clientLayerKey: "transpile:test:001:shape",
      targetRef: { layerId: null, clientLayerKey: "transpile:test:001:shape" },
      targetLayerVersion: null,
      parentRef: { position: "append" },
      expectedLayerType: null,
      allowNoop: false,
      metadataTags: {},
      layerBlueprint: {
        layerType: "shape",
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        metadata: {},
      },
      editable: true,
    };
    return { commands: [command], warnings: [] };
  };

  return {
    runMethodB: overrides.runMethodB ?? defaultMethodB,
    validateHtml: overrides.validateHtml ?? defaultValidate,
    transpile: overrides.transpile ?? defaultTranspile,
  };
}

test("runV5Pipeline happy path returns commands + pass-through html/usage", async () => {
  const deps = makeDeps();
  const result = await runV5Pipeline(
    {
      runId: "run_test",
      traceId: "trace_test",
      userPrompt: "봄 세일 배너",
      apiKey: "fake",
    },
    deps,
  );
  assert.equal(result.commands.length, 1);
  assert.equal(result.commands[0]?.op, "createLayer");
  assert.equal(result.html, VALID_HTML);
  assert.equal(result.model, "gemini-3.1-flash-lite-preview");
  assert.equal(result.usage?.totalTokenCount, 60);
  assert.equal(result.latencyMs, 1234);
});

test("runV5Pipeline throws V5HtmlValidationError when validator returns ok=false", async () => {
  const deps = makeDeps({
    validateHtml: () => ({
      ok: false,
      childCount: 2,
      rootFound: true,
      issues: [
        {
          code: "forbidden_tag",
          severity: "error",
          message: "forbidden tag <br>",
        },
      ],
    }),
  });

  await assert.rejects(
    () =>
      runV5Pipeline(
        {
          runId: "r",
          traceId: "t",
          userPrompt: "p",
          apiKey: "k",
        },
        deps,
      ),
    (err: unknown) => {
      assert.ok(err instanceof V5HtmlValidationError);
      assert.equal(err.issues.length, 1);
      assert.match(err.message, /forbidden_tag/);
      return true;
    },
  );
});

test("runV5Pipeline throws V5TranspileEmptyError when transpile yields no commands", async () => {
  const deps = makeDeps({
    transpile: () => ({ commands: [], warnings: [] }),
  });

  await assert.rejects(
    () =>
      runV5Pipeline(
        {
          runId: "r",
          traceId: "t",
          userPrompt: "p",
          apiKey: "k",
        },
        deps,
      ),
    (err: unknown) => {
      assert.ok(err instanceof V5TranspileEmptyError);
      return true;
    },
  );
});

test("runV5Pipeline propagates MethodBGenerationError from the LLM dependency", async () => {
  const deps = makeDeps({
    runMethodB: async () => {
      throw new MethodBGenerationError("upstream failure", 500, null);
    },
  });

  await assert.rejects(
    () =>
      runV5Pipeline(
        {
          runId: "r",
          traceId: "t",
          userPrompt: "p",
          apiKey: "k",
        },
        deps,
      ),
    (err: unknown) => {
      assert.ok(err instanceof MethodBGenerationError);
      return true;
    },
  );
});
