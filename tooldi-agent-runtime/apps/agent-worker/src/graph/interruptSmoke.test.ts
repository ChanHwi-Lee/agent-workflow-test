import assert from "node:assert/strict";
import test from "node:test";

import {
  Annotation,
  Command,
  END,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
} from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const SpikeState = Annotation.Root({
  resumed: Annotation<string | null>({
    default: () => null,
    reducer: (_prev, next) => next,
  }),
});

function buildSpikeGraph(checkpointer: BaseCheckpointSaver) {
  const graph = new StateGraph(SpikeState)
    .addNode("ask", () => {
      const answer = interrupt<{ ping: string }, string>({ ping: "spike" });
      return { resumed: answer };
    });
  return (graph as unknown as {
    addEdge: (from: string, to: string) => typeof graph;
  })
    .addEdge(START, "ask")
    .addEdge("ask", END)
    .compile({ checkpointer });
}

interface InterruptChunk {
  readonly __interrupt__?: ReadonlyArray<{ readonly value?: unknown }>;
}

async function captureInterruptPayload(
  graph: ReturnType<typeof buildSpikeGraph>,
  threadId: string,
): Promise<unknown> {
  const config = { configurable: { thread_id: threadId } };
  let payload: unknown = undefined;
  const stream = await graph.stream({} as never, {
    ...config,
    streamMode: "updates",
  });
  for await (const raw of stream) {
    const chunk = raw as InterruptChunk;
    const arr = chunk.__interrupt__;
    if (Array.isArray(arr) && arr.length > 0) {
      const first = arr[0];
      if (first && typeof first === "object" && "value" in first) {
        payload = first.value;
      }
    }
  }
  return payload;
}

async function resumeAndAssertFinal(
  graph: ReturnType<typeof buildSpikeGraph>,
  threadId: string,
  resumeValue: string,
): Promise<void> {
  const config = { configurable: { thread_id: threadId } };
  const finalState = (await graph.invoke(
    new Command({ resume: resumeValue }) as never,
    config,
  )) as { resumed: string | null };
  assert.equal(finalState.resumed, resumeValue);
}

async function exerciseInterruptCycle(
  graph: ReturnType<typeof buildSpikeGraph>,
  threadId: string,
): Promise<void> {
  const payload = await captureInterruptPayload(graph, threadId);
  assert.deepEqual(payload, { ping: "spike" });
  await resumeAndAssertFinal(graph, threadId, "answered-ok");
}

test("interrupt + resume cycle은 MemorySaver 에서 동작한다", async () => {
  const checkpointer = new MemorySaver();
  const graph = buildSpikeGraph(checkpointer);
  await exerciseInterruptCycle(graph, "spike-mem:0");
});

function composePostgresUrl(): string | null {
  const host = process.env.AGENT_RUNTIME_POSTGRES_HOST ?? "127.0.0.1";
  const port = process.env.AGENT_RUNTIME_POSTGRES_PORT;
  const db = process.env.AGENT_RUNTIME_POSTGRES_DB;
  const user = process.env.AGENT_RUNTIME_POSTGRES_USER;
  const password = process.env.AGENT_RUNTIME_POSTGRES_PASSWORD;
  if (!port || !db || !user || !password) return null;
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(
    password,
  )}@${host}:${port}/${db}`;
}

const postgresUrl = composePostgresUrl();

test(
  "interrupt + resume cycle은 PostgresSaver 에서 동작한다",
  {
    skip:
      postgresUrl === null
        ? "AGENT_RUNTIME_POSTGRES_* env vars 가 없어 스킵 — `set -a; source .env.local; set +a` 후 재실행"
        : false,
  },
  async () => {
    if (!postgresUrl) return;
    const checkpointer = PostgresSaver.fromConnString(postgresUrl);
    await checkpointer.setup();
    try {
      const graph = buildSpikeGraph(checkpointer);
      await exerciseInterruptCycle(graph, `spike-pg:${Date.now()}`);
    } finally {
      await checkpointer.end();
    }
  },
);
