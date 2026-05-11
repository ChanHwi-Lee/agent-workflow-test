import assert from "node:assert/strict";
import test from "node:test";

import { Client, overrideFetchImplementation } from "langsmith";
import { RunTree } from "langsmith/run_trees";

// LANGSMITH 클라이언트는 모듈 스코프 싱글톤으로 캐싱되므로, 테스트 전 import
// 시점에 필요한 환경변수가 모두 세팅되어 있어야 한다. 이 파일은 trace_id /
// __body / output_token_details 검증만 목적이고 실제 LangSmith API 로 데이터를
// 보내지 않는다 (오버라이드된 fetch 가 모든 요청을 가로챈다).
process.env.LANGSMITH_TRACING = "true";
process.env.LANGSMITH_API_KEY = "test-key";
process.env.LANGSMITH_ENDPOINT = "http://langsmith.test.invalid";

const {
  traceImageGenCall,
  traceLlmCall,
  buildUsageMetadata,
  withRunJobTrace,
} = await import("./langsmithTrace.js");

interface CapturedRequest {
  readonly url: string;
  readonly method: string;
  readonly bodyText: string | null;
}

async function flushAllPendingTraces(): Promise<void> {
  // RunTree 와 traceable 은 RunTree.getSharedClient() 를, withRunJobTrace 는
  // langsmithTrace.ts 의 cachedClient 를 각각 사용한다. 둘 다 flush 해야 한다.
  const sharedClient = (
    RunTree as unknown as { getSharedClient(): Client }
  ).getSharedClient();
  await sharedClient.awaitPendingTraceBatches();
}

async function readBodyAsText(body: unknown): Promise<string | null> {
  if (body === undefined || body === null) return null;
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(body));
  }
  // ReadableStream<Uint8Array> (multipart ingest path) — drain into a single Buffer.
  const maybeStream = body as { getReader?: () => ReadableStreamDefaultReader<Uint8Array> };
  if (typeof maybeStream.getReader === "function") {
    const reader = maybeStream.getReader();
    const chunks: Uint8Array[] = [];
    try {
      let done = false;
      while (!done) {
        const result = await reader.read();
        if (result.done) {
          done = true;
        } else if (result.value) {
          chunks.push(result.value);
        }
      }
    } finally {
      reader.releaseLock();
    }
    let total = 0;
    for (const c of chunks) total += c.length;
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    return new TextDecoder().decode(merged);
  }
  try {
    return String(body);
  } catch {
    return null;
  }
}

function installFetchInterceptor(): {
  readonly captures: CapturedRequest[];
  restore: () => void;
} {
  const captures: CapturedRequest[] = [];
  const fakeFetch = async (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const bodyText = await readBodyAsText(init?.body);
    captures.push({
      url: typeof url === "string" ? url : url.toString(),
      method: init?.method ?? "GET",
      bodyText,
    });
    // /info endpoint 등이 호출돼도 정상 응답으로 통과시키기 위해 200 OK 반환.
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  overrideFetchImplementation(fakeFetch as never);
  return {
    captures,
    restore: () => {
      // 테스트 간 fetch 누수 방지. 실제 코드에는 영향 없음.
      overrideFetchImplementation(
        (async () => new Response("{}")) as never,
      );
    },
  };
}

test("traceImageGenCall — 출력 trace 에 raw bytes / __body 가 새지 않는다", async () => {
  const { captures, restore } = installFetchInterceptor();
  try {
    const fakeBody = {
      bytes: Buffer.from([1, 2, 3, 4]),
      mimeType: "image/png",
    };
    const returned = await traceImageGenCall(
      {
        name: "test.image_gen",
        model: "gemini-test-image",
        prompt: "a banner",
        imageCount: 1,
        unitCostUsd: 0.01,
      },
      async () => ({
        body: fakeBody,
        outputSummary: { foo: 1 },
      }),
    );
    // 호출자에게는 body 가 그대로 반환되어야 한다 (closure 패턴).
    assert.equal(returned, fakeBody);
    assert.ok(returned.bytes instanceof Buffer);

    // 배치 ingest 가 비동기이므로 명시적으로 flush.
    await flushAllPendingTraces();

    // 가로챈 LangSmith 페이로드들 안에 __body / bytes 가 들어가면 안 된다.
    assert.ok(captures.length > 0, "expected at least one langsmith POST");
    for (const cap of captures) {
      if (!cap.bodyText) continue;
      assert.equal(
        cap.bodyText.includes("__body"),
        false,
        `langsmith request body must not contain __body (url=${cap.url})`,
      );
      assert.equal(
        /"bytes"\s*:/.test(cap.bodyText),
        false,
        `langsmith request body must not contain a bytes field (url=${cap.url})`,
      );
    }
  } finally {
    restore();
  }
});

test("traceLlmCall — 출력 trace 에 __body 가 새지 않는다", async () => {
  const { captures, restore } = installFetchInterceptor();
  try {
    const fakeBody = { candidates: [{ content: { parts: [{ text: "hi" }] } }] };
    const returned = await traceLlmCall(
      {
        name: "test.llm",
        model: "gemini-test-llm",
      },
      async () => ({
        body: fakeBody,
        outputText: "hi",
        geminiUsage: {
          promptTokenCount: 5,
          candidatesTokenCount: 7,
          totalTokenCount: 12,
        },
      }),
    );
    assert.equal(returned, fakeBody);

    await flushAllPendingTraces();

    assert.ok(captures.length > 0, "expected at least one langsmith POST");
    for (const cap of captures) {
      if (!cap.bodyText) continue;
      assert.equal(
        cap.bodyText.includes("__body"),
        false,
        `langsmith request body must not contain __body (url=${cap.url})`,
      );
    }
  } finally {
    restore();
  }
});

test("buildUsageMetadata — Gemini thoughtsTokenCount 는 output_token_details.reasoning 으로 분리된다", () => {
  const usage = buildUsageMetadata({
    body: undefined,
    geminiUsage: {
      promptTokenCount: 100,
      candidatesTokenCount: 50,
      thoughtsTokenCount: 25,
      totalTokenCount: 175,
    },
  });
  assert.ok(usage);
  // candidates 만 output_tokens 으로 가야 한다 (thoughts 는 합산 금지).
  assert.equal(usage.input_tokens, 100);
  assert.equal(usage.output_tokens, 50);
  // totalTokenCount 가 이미 thoughts 포함이므로 그대로 전달.
  assert.equal(usage.total_tokens, 175);
  assert.deepEqual(usage.output_token_details, { reasoning: 25 });
});

test("buildUsageMetadata — thoughtsTokenCount 가 없으면 output_token_details 도 비어있다", () => {
  const usage = buildUsageMetadata({
    body: undefined,
    geminiUsage: {
      promptTokenCount: 10,
      candidatesTokenCount: 20,
      totalTokenCount: 30,
    },
  });
  assert.ok(usage);
  assert.equal(usage.input_tokens, 10);
  assert.equal(usage.output_tokens, 20);
  assert.equal(usage.total_tokens, 30);
  assert.equal(usage.output_token_details, undefined);
  assert.equal(usage.input_token_details, undefined);
});

test("buildUsageMetadata — cachedContentTokenCount 는 input_token_details.cache_read 로 매핑된다", () => {
  const usage = buildUsageMetadata({
    body: undefined,
    geminiUsage: {
      promptTokenCount: 200,
      candidatesTokenCount: 30,
      cachedContentTokenCount: 80,
      totalTokenCount: 230,
    },
  });
  assert.ok(usage);
  assert.equal(usage.input_tokens, 200);
  assert.equal(usage.output_tokens, 30);
  assert.deepEqual(usage.input_token_details, { cache_read: 80 });
  assert.equal(usage.output_token_details, undefined);
});

test("withRunJobTrace — 컨텍스트의 traceId 가 그대로 LangSmith metadata.tooldi_trace_id 로 반영된다 (FIX 1: resume 잡 회귀 가드)", async () => {
  const { captures, restore } = installFetchInterceptor();
  try {
    const distinctRunId = "run_FIX1_RUN";
    const distinctTraceId = "trace_FIX1_TRACE";
    const result = await withRunJobTrace(
      {
        runId: distinctRunId,
        traceId: distinctTraceId,
        attemptSeq: 2,
        queueJobId: "queue_FIX1",
      },
      async () => "ok",
      { name: "tooldi.resumeRunJob", extraTags: ["resume"] },
    );
    assert.equal(result, "ok");

    await flushAllPendingTraces();

    // LangSmith POST 본문에서 trace_id 메타가 traceId 와 같고 runId 와 다른지 확인.
    const postBodies = captures
      .filter((c) => c.method === "POST" && c.bodyText !== null)
      .map((c) => c.bodyText as string);
    assert.ok(
      postBodies.length > 0,
      "expected at least one POST while tracing was enabled",
    );
    const concatenated = postBodies.join("\n");
    assert.ok(
      concatenated.includes(distinctTraceId),
      "langsmith metadata must carry the resume payload traceId",
    );
    assert.ok(
      !concatenated.includes(`"tooldi_trace_id":"${distinctRunId}"`),
      "traceId metadata must not be coerced to runId (resume regression)",
    );
  } finally {
    restore();
  }
});

test("buildUsageMetadata — totalTokenCount 미제공 시 input + output + thoughts 로 계산", () => {
  const usage = buildUsageMetadata({
    body: undefined,
    geminiUsage: {
      promptTokenCount: 10,
      candidatesTokenCount: 20,
      thoughtsTokenCount: 5,
    },
  });
  assert.ok(usage);
  assert.equal(usage.input_tokens, 10);
  assert.equal(usage.output_tokens, 20);
  // thoughts 가 reasoning 으로 분리되더라도 total_tokens 에는 포함시킨다.
  assert.equal(usage.total_tokens, 35);
  assert.deepEqual(usage.output_token_details, { reasoning: 5 });
});
