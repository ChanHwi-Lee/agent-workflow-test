import assert from "node:assert/strict";
import test from "node:test";

import {
  MethodBGenerationError,
  runMethodBHtmlGen,
} from "./v5MethodBHtmlGen.js";

function makeMockFetch(
  body: unknown,
  init: { status?: number } = {},
): typeof fetch {
  const mock = async (_url: string | URL | Request, _init?: RequestInit) => {
    return new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return mock as typeof fetch;
}

test("runMethodBHtmlGen returns concatenated HTML text from Gemini response parts", async () => {
  const mockFetch = makeMockFetch({
    candidates: [
      {
        content: {
          parts: [{ text: "<div style=\"position:relative; width:1200px;" }, { text: " height:628px;\"></div>" }],
        },
        finishReason: "STOP",
      },
    ],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 50,
      totalTokenCount: 60,
    },
  });

  const result = await runMethodBHtmlGen({
    prompt: "봄 세일 배너",
    apiKey: "fake-key",
    fetchImpl: mockFetch,
  });

  assert.equal(
    result.html,
    "<div style=\"position:relative; width:1200px; height:628px;\"></div>",
  );
  assert.equal(result.finishReason, "STOP");
  assert.equal(result.usage?.promptTokenCount, 10);
  assert.equal(result.usage?.candidatesTokenCount, 50);
  assert.equal(result.usage?.totalTokenCount, 60);
  assert.ok(result.latencyMs >= 0);
  assert.equal(result.model, "gemini-3.1-flash-lite-preview");
});

test("runMethodBHtmlGen throws MethodBGenerationError on API error body", async () => {
  const mockFetch = makeMockFetch(
    {
      error: {
        status: "INVALID_ARGUMENT",
        message: "bad prompt",
      },
    },
    { status: 400 },
  );

  await assert.rejects(
    () =>
      runMethodBHtmlGen({
        prompt: "bad",
        apiKey: "fake",
        fetchImpl: mockFetch,
      }),
    (err: unknown) => {
      assert.ok(err instanceof MethodBGenerationError);
      assert.equal(err.status, 400);
      return true;
    },
  );
});

test("runMethodBHtmlGen throws MethodBGenerationError on non-JSON response", async () => {
  const nonJsonFetch: typeof fetch = async () =>
    new Response("not json at all", {
      status: 502,
      headers: { "content-type": "text/plain" },
    });

  await assert.rejects(
    () =>
      runMethodBHtmlGen({
        prompt: "anything",
        apiKey: "fake",
        fetchImpl: nonJsonFetch,
      }),
    (err: unknown) => {
      assert.ok(err instanceof MethodBGenerationError);
      assert.equal(err.status, 502);
      return true;
    },
  );
});

test("runMethodBHtmlGen uses model override when provided", async () => {
  let capturedUrl = "";
  const spyFetch: typeof fetch = async (url, init) => {
    capturedUrl = typeof url === "string" ? url : url.toString();
    assert.equal(init?.method, "POST");
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: "<div></div>" }] } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const result = await runMethodBHtmlGen({
    prompt: "prompt",
    apiKey: "key",
    model: "gemini-3-pro-preview",
    fetchImpl: spyFetch,
  });

  assert.equal(result.model, "gemini-3-pro-preview");
  assert.ok(capturedUrl.includes("gemini-3-pro-preview"));
});
