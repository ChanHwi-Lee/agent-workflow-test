import assert from "node:assert/strict";
import test from "node:test";

import {
  V6HtmlGenerationError,
  runV6HtmlGen,
  stripMarkdownFences,
} from "./v6HtmlGen.js";
import { V6_SYSTEM_PROMPT, buildV6UserMessage } from "./v6SystemPrompt.js";

function makeMockFetch(
  body: unknown,
  init: { status?: number } = {},
): { fetch: typeof fetch; lastRequest: { url?: string; body?: unknown } } {
  const state: { url?: string; body?: unknown } = {};
  const mock = async (url: string | URL | Request, req?: RequestInit) => {
    state.url = typeof url === "string" ? url : url.toString();
    if (typeof req?.body === "string") {
      try {
        state.body = JSON.parse(req.body);
      } catch {
        state.body = req.body;
      }
    }
    return new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch: mock as typeof fetch, lastRequest: state };
}

test("runV6HtmlGen returns HTML concatenated from Gemini parts", async () => {
  const { fetch, lastRequest } = makeMockFetch({
    candidates: [
      {
        content: {
          parts: [
            { text: '<div style="width:1200px;height:628px;">' },
            { text: "<h1>Hello</h1></div>" },
          ],
        },
        finishReason: "STOP",
      },
    ],
    usageMetadata: {
      promptTokenCount: 100,
      candidatesTokenCount: 200,
      totalTokenCount: 300,
    },
  });

  const result = await runV6HtmlGen({
    canvasWidth: 1200,
    canvasHeight: 628,
    userPrompt: "봄 세일 이벤트 배너",
    apiKey: "fake",
    fetchImpl: fetch,
  });

  assert.equal(
    result.html,
    '<div style="width:1200px;height:628px;"><h1>Hello</h1></div>',
  );
  assert.equal(result.finishReason, "STOP");
  assert.equal(result.usage?.totalTokenCount, 300);
  assert.equal(result.model, "gemini-3.1-flash-lite-preview");
  assert.ok(result.latencyMs >= 0);

  // Canvas size and user prompt flowed through the user message.
  const reqBody = lastRequest.body as {
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  };
  const userText = reqBody.contents[0]?.parts[0]?.text ?? "";
  assert.match(userText, /1200/);
  assert.match(userText, /628/);
  assert.match(userText, /봄 세일/);
});

test("runV6HtmlGen은 기본 temperature를 0.35로 사용한다", async () => {
  const { fetch, lastRequest } = makeMockFetch({
    candidates: [
      {
        content: {
          parts: [{ text: '<div style="width:1200px;height:628px;"></div>' }],
        },
        finishReason: "STOP",
      },
    ],
  });

  await runV6HtmlGen({
    canvasWidth: 1200,
    canvasHeight: 628,
    userPrompt: "봄 세일 이벤트 배너",
    apiKey: "fake",
    fetchImpl: fetch,
  });

  const reqBody = lastRequest.body as {
    generationConfig: {
      temperature?: number;
      thinkingConfig?: { thinkingLevel?: string };
    };
  };
  assert.equal(reqBody.generationConfig.temperature, 0.35);
  assert.deepEqual(reqBody.generationConfig.thinkingConfig, {
    thinkingLevel: "low",
  });
});

test("runV6HtmlGen은 thinking level을 낮은 토큰 예산 값으로 조절할 수 있다", async () => {
  const { fetch, lastRequest } = makeMockFetch({
    candidates: [
      {
        content: {
          parts: [{ text: '<div style="width:1200px;height:628px;"></div>' }],
        },
        finishReason: "STOP",
      },
    ],
  });

  await runV6HtmlGen({
    canvasWidth: 1200,
    canvasHeight: 628,
    userPrompt: "봄 세일 이벤트 배너",
    apiKey: "fake",
    thinkingLevel: "minimal",
    fetchImpl: fetch,
  });

  const reqBody = lastRequest.body as {
    generationConfig: { thinkingConfig?: { thinkingLevel?: string } };
  };
  assert.deepEqual(reqBody.generationConfig.thinkingConfig, {
    thinkingLevel: "minimal",
  });
});

test("V6_SYSTEM_PROMPT는 placeholder 이미지 영역을 실제 asset 영역으로 취급하도록 지시한다", () => {
  assert.match(V6_SYSTEM_PROMPT, /Placeholder images are replaced later/);
  assert.match(V6_SYSTEM_PROMPT, /visually occupied/);
  assert.match(V6_SYSTEM_PROMPT, /solid\/semi-opaque backing shape/);
  assert.match(V6_SYSTEM_PROMPT, /Do not rely on blank placeholder space/);
});

test("runV6HtmlGen strips markdown fences if the model emits them", async () => {
  const { fetch } = makeMockFetch({
    candidates: [
      {
        content: {
          parts: [
            {
              text: '```html\n<div style="width:800px;height:400px;"></div>\n```',
            },
          ],
        },
        finishReason: "STOP",
      },
    ],
  });

  const result = await runV6HtmlGen({
    canvasWidth: 800,
    canvasHeight: 400,
    userPrompt: "test",
    apiKey: "fake",
    fetchImpl: fetch,
  });

  assert.equal(result.html, '<div style="width:800px;height:400px;"></div>');
  assert.match(result.rawHtml, /```html/);
});

test("runV6HtmlGen throws V6HtmlGenerationError on API error body", async () => {
  const { fetch } = makeMockFetch(
    { error: { status: "INVALID_ARGUMENT", message: "bad prompt" } },
    { status: 400 },
  );

  await assert.rejects(
    () =>
      runV6HtmlGen({
        canvasWidth: 1200,
        canvasHeight: 628,
        userPrompt: "x",
        apiKey: "fake",
        fetchImpl: fetch,
      }),
    (err: unknown) => {
      assert.ok(err instanceof V6HtmlGenerationError);
      assert.equal(err.status, 400);
      return true;
    },
  );
});

test("runV6HtmlGen throws V6HtmlGenerationError on non-JSON response", async () => {
  const mock: typeof fetch = async () =>
    new Response("not json", {
      status: 500,
      headers: { "content-type": "text/plain" },
    });

  await assert.rejects(
    () =>
      runV6HtmlGen({
        canvasWidth: 1200,
        canvasHeight: 628,
        userPrompt: "x",
        apiKey: "fake",
        fetchImpl: mock,
      }),
    (err: unknown) => {
      assert.ok(err instanceof V6HtmlGenerationError);
      assert.equal(err.status, 500);
      return true;
    },
  );
});

test("stripMarkdownFences — handles ```html, ```, and no-fence inputs", () => {
  assert.equal(stripMarkdownFences("<div></div>"), "<div></div>");
  assert.equal(stripMarkdownFences("```html\n<div></div>\n```"), "<div></div>");
  assert.equal(stripMarkdownFences("```\n<div></div>\n```"), "<div></div>");
  assert.equal(stripMarkdownFences("   <div></div>   "), "<div></div>");
  // Un-closed fence — keep content trimmed.
  assert.equal(stripMarkdownFences("```html\n<div></div>"), "<div></div>");
});

test("buildV6UserMessage — includes canvas dimensions and trimmed user prompt", () => {
  const msg = buildV6UserMessage({
    canvasWidth: 1200,
    canvasHeight: 628,
    userPrompt: "  봄 세일 이벤트 배너 만들어줘  ",
  });
  assert.match(msg, /1200px × 628px/);
  assert.match(msg, /봄 세일 이벤트 배너 만들어줘/);
  // No leading/trailing whitespace on the user section.
  assert.ok(!msg.endsWith(" "));
});

test("buildV6UserMessage는 레이아웃 예산용 copy load 요약을 포함한다", () => {
  const msg = buildV6UserMessage({
    canvasWidth: 1200,
    canvasHeight: 628,
    userPrompt: "명낭상점 강아지 여름 쿨매트 1+1 특가. 4월 30일까지 한정 할인.",
  });

  assert.match(msg, /Copy load for layout budgeting/);
  assert.match(msg, /Korean chars:/);
  assert.match(msg, /Latin\/digit chars:/);
  assert.match(msg, /copy load class:/);
  assert.match(msg, /layout hint:/);
  assert.match(msg, /Do not render these metrics as visible copy/i);
});

test("buildV6UserMessage는 재시도용 렌더 품질 피드백을 보이지 않는 지시로 포함한다", () => {
  const msg = buildV6UserMessage({
    canvasWidth: 1200,
    canvasHeight: 628,
    userPrompt: "강아지 쿨매트 배너",
    renderQualityFeedback:
      "1. root_bounds_mismatch at path=0 tag=div; width=1360, canvasWidth=1200",
  });

  assert.match(msg, /Previous render-quality failure to fix/);
  assert.match(msg, /root_bounds_mismatch/);
  assert.match(msg, /geometry only/);
  assert.match(msg, /Do not add semantic roles/);
});

test("buildV6UserMessage — appends optional trend context as execution-oriented visual input", () => {
  const msg = buildV6UserMessage({
    canvasWidth: 1080,
    canvasHeight: 1080,
    userPrompt: "카페 신메뉴 배너",
    trendContext: "Palette inspiration: #FF7F50, #E6F7FF",
  });

  assert.match(msg, /Optional current visual trend context/);
  assert.match(msg, /Palette inspiration/);
  assert.match(msg, /design execution brief/);
  assert.match(msg, /product\/hero imagery/);
});
