import assert from "node:assert/strict";
import test from "node:test";

import { createObjectStoreClient } from "@tooldi/agent-persistence";
import { createTestRun } from "@tooldi/agent-testkit";

import { createWorkerLogger } from "../lib/logger.js";
import {
  RecordingBackendCallbackClient,
  TrackingObjectStoreClient,
  assertLegacyBuildAndRefinementNodesWereBypassed,
  createDeterministicV6Overrides,
  createProcessRunJobTestEnv,
  seedRunInputArtifacts,
} from "../testFixtures/processRunJobFixtures.js";
import { processRunJob } from "./processRunJob.js";

// The full v6 happy path: object_native_v1 routes through createLayer envelope
// (≥3 v6-mapped commands) and a saveTemplate envelope, in that order, with
// matching ack waits, completed finalize, save-receipt id pattern, and the
// `[v6]` enter/done observability log lines. Also asserts no legacy build or
// refinement artifact/state field is produced.
test("object_native_v1 routes through v6 createLayer + save/finalize and bypasses legacy nodes", async () => {
  const env = createProcessRunJobTestEnv();
  const logger = createWorkerLogger(env);
  const objectStore = new TrackingObjectStoreClient(
    createObjectStoreClient({ bucket: env.objectStoreBucket }),
  );
  const callbackClient = new RecordingBackendCallbackClient();
  const testRun = createTestRun({
    workflowVariant: "object_native_v1",
  });

  await seedRunInputArtifacts(objectStore, testRun);

  const result = await processRunJob(testRun.job, {
    env,
    logger,
    objectStore,
    callbackClient,
    v6Overrides: createDeterministicV6Overrides(),
  });

  assert.equal(testRun.request.workflowVariant, "object_native_v1");
  assert.equal(result.plan?.planSchemaVersion, "v6-freeform-layout");
  assert.equal(result.plan?.actions.length, 1);
  const action = result.plan!.actions[0]!;
  assert.equal(action.operation, "v6_apply_freeform_layout");
  assert.equal(action.toolName, "v6-freeform-layout-pipeline");
  assert.equal(result.finalizeDraft.request.finalStatus, "completed");

  const mutationEvents = callbackClient.appendedEvents.filter(
    (e) => e.event.type === "mutation.proposed",
  );
  assert.equal(
    mutationEvents.length,
    2,
    "v6 baseline must emit exactly one createLayer envelope and one saveTemplate envelope",
  );

  const createLayerEnvelopes = mutationEvents.filter((e) => {
    const event = e.event as Extract<
      (typeof mutationEvents)[number]["event"],
      { type: "mutation.proposed" }
    >;
    return event.mutation.commands.some((c) => c.op === "createLayer");
  });
  assert.equal(
    createLayerEnvelopes.length,
    1,
    "expected exactly one createLayer envelope from the v6 pipeline",
  );
  const envelope = (
    createLayerEnvelopes[0]!.event as Extract<
      (typeof mutationEvents)[number]["event"],
      { type: "mutation.proposed" }
    >
  ).mutation;
  assert.equal(
    envelope.commands.every((command) => command.op === "createLayer"),
    true,
  );
  assert.ok(
    envelope.commands.length >= 3,
    `expected ≥3 v6-mapped commands (1 rect + 2 text), got ${envelope.commands.length}`,
  );
  assert.equal(envelope.seq, 1);
  assert.equal(envelope.expectedBaseRevision, 0);
  assert.equal(envelope.rollbackHint.strategy, "delete_created_layers");

  const saveEnvelopes = mutationEvents.filter((e) => {
    const event = e.event as Extract<
      (typeof mutationEvents)[number]["event"],
      { type: "mutation.proposed" }
    >;
    return event.mutation.commands.every((command) => command.op === "saveTemplate");
  });
  assert.equal(saveEnvelopes.length, 1, "expected exactly one saveTemplate envelope");
  const saveEnvelope = (
    saveEnvelopes[0]!.event as Extract<
      (typeof mutationEvents)[number]["event"],
      { type: "mutation.proposed" }
    >
  ).mutation;
  assert.equal(saveEnvelope.seq, 2);
  assert.equal(saveEnvelope.dependsOnSeq, 1);

  assert.deepEqual(
    callbackClient.ackWaits.map((wait) => wait.mutationId),
    mutationEvents.map((event) => {
      const proposed = event.event as Extract<
        (typeof mutationEvents)[number]["event"],
        { type: "mutation.proposed" }
      >;
      return proposed.mutationId;
    }),
    "worker must wait for create-layer ack and save ack in emission order",
  );
  assert.equal(callbackClient.finalizations.length, 1);
  assert.equal(callbackClient.finalizations[0]?.finalStatus, "completed");
  assert.match(
    callbackClient.finalizations[0]?.latestSaveReceipt?.saveReceiptId ?? "",
    new RegExp(`^save_receipt_${testRun.runId}_`),
  );

  assertLegacyBuildAndRefinementNodesWereBypassed(result, objectStore);

  const v6Logs = callbackClient.appendedEvents.filter(
    (e) =>
      e.event.type === "log" &&
      typeof e.event.message === "string" &&
      e.event.message.startsWith("[v6]"),
  );
  assert.ok(
    v6Logs.length >= 2,
    "expected v6 observability log entries (enter + done)",
  );
});

// Trend research + HTML compare preview happy path. With trendResearch=true and
// debugHtmlPreview=true, the run must persist three v6 artifacts
// (`v6-trend-brief.json`, `debug-v6-html.json`, `debug-unrestricted-html.json`)
// and propagate trend context into both constrained and unrestricted previews,
// without entering any legacy build/refinement node.
test("trend research and debug HTML preview persist v6 artifacts and bypass legacy", async () => {
  const env = {
    ...createProcessRunJobTestEnv(),
    trendResearchMode: "enabled" as const,
  };
  const logger = createWorkerLogger(env);
  const objectStore = new TrackingObjectStoreClient(
    createObjectStoreClient({ bucket: env.objectStoreBucket }),
  );
  const callbackClient = new RecordingBackendCallbackClient();
  const testRun = createTestRun({
    workflowVariant: "object_native_v1",
    options: {
      trendResearch: true,
      debugHtmlPreview: true,
    },
  });
  let trendCallCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "<div style=\"width:1200px;height:628px\">debug preview</div>",
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 1,
          totalTokenCount: 2,
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    )) as typeof fetch;

  await seedRunInputArtifacts(objectStore, testRun);

  try {
    const result = await processRunJob(testRun.job, {
      env,
      logger,
      objectStore,
      callbackClient,
      v6Overrides: createDeterministicV6Overrides(),
      v6TrendResearcher: {
        async research() {
          trendCallCount += 1;
          return {
            model: "trend-test-stub",
            summary: "봄 프로모션은 밝은 팔레트와 큰 타이포그래피가 어울린다.",
            palette: ["#FFF5E1", "#222222"],
            typography: {
              weight: "bold",
              scale: "large headline",
              notes: "강한 대비",
            },
            composition: "좌측 카피와 우측 여백 중심 구성",
            motifs: ["spring sale"],
            tone: "bright",
            notes: "test trend context",
            searchQueries: ["2026 spring sale banner trend"],
            citations: [
              {
                title: "test citation",
                uri: "https://example.test/trend",
              },
            ],
            contextForHtmlGen: "TREND_CONTEXT_FOR_TEST",
            latencyMs: 1,
            usage: null,
            generatedAt: new Date().toISOString(),
          };
        },
      },
    });

    assert.equal(result.finalizeDraft.request.finalStatus, "completed");
    assert.equal(trendCallCount, 1);
    assertLegacyBuildAndRefinementNodesWereBypassed(result, objectStore);

    const expectedArtifactKeys = [
      `runs/${testRun.runId}/attempts/1/v6-trend-brief.json`,
      `runs/${testRun.runId}/attempts/1/debug-v6-html.json`,
      `runs/${testRun.runId}/attempts/1/debug-unrestricted-html.json`,
    ];
    for (const key of expectedArtifactKeys) {
      assert.equal(
        objectStore.putKeys.includes(key),
        true,
        `${key} should be persisted`,
      );
    }

    const constrainedDebugArtifact = JSON.parse(
      new TextDecoder().decode(
        (
          await objectStore.getObject({
            bucket: env.objectStoreBucket,
            key: `runs/${testRun.runId}/attempts/1/debug-v6-html.json`,
          })
        ).body,
      ),
    ) as { kind: string; trendContext: string | null };
    const unrestrictedDebugArtifact = JSON.parse(
      new TextDecoder().decode(
        (
          await objectStore.getObject({
            bucket: env.objectStoreBucket,
            key: `runs/${testRun.runId}/attempts/1/debug-unrestricted-html.json`,
          })
        ).body,
      ),
    ) as { kind: string; html: string; trendContext: string | null };

    assert.equal(constrainedDebugArtifact.kind, "v6-constrained-html");
    assert.equal(constrainedDebugArtifact.trendContext, "TREND_CONTEXT_FOR_TEST");
    assert.equal(unrestrictedDebugArtifact.kind, "unrestricted-html");
    assert.match(unrestrictedDebugArtifact.html, /debug preview/);
    assert.equal(unrestrictedDebugArtifact.trendContext, "TREND_CONTEXT_FOR_TEST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// Empty-canvas invariant guard. AGENTS.md fixes the canonical scenario as an
// empty 1200×628 canvas. A `filled` canvas must short-circuit before any v6
// pipeline work — failed finalize, no plan, no mutation, error code surfaced.
test("non-empty canvas is rejected before the v6 pipeline runs", async () => {
  const env = createProcessRunJobTestEnv();
  const logger = createWorkerLogger(env);
  const objectStore = createObjectStoreClient({ bucket: env.objectStoreBucket });
  const callbackClient = new RecordingBackendCallbackClient();
  const testRun = createTestRun();
  testRun.request.editorContext = {
    ...testRun.request.editorContext,
    canvasState: "filled" as never,
  };
  testRun.snapshot.editorContext = testRun.request.editorContext;

  await seedRunInputArtifacts(objectStore, testRun);

  const result = await processRunJob(testRun.job, {
    env,
    logger,
    objectStore,
    callbackClient,
    v6Overrides: createDeterministicV6Overrides(),
  });

  assert.equal(result.intent.operationFamily, "update_layer");
  assert.equal(result.finalizeDraft.request.finalStatus, "failed");
  assert.equal(
    result.finalizeDraft.request.errorSummary?.code,
    "unsupported_v1_vertical_slice",
  );
  assert.equal(result.emittedMutationIds.length, 0);
  assert.equal(result.plan, undefined);
  assert.equal(
    callbackClient.appendedEvents.some(
      (event) => event.event.type === "mutation.proposed",
    ),
    false,
  );
});
