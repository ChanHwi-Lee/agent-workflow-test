import assert from "node:assert/strict";
import test from "node:test";

import type { AgentWorkerEnv } from "@tooldi/agent-config";

import { buildWorkerRuntime } from "./worker.js";

function createEnv(): AgentWorkerEnv {
  return {
    nodeEnv: "test",
    logLevel: "debug",
    postgresUrl: "postgres://localhost:5432/tooldi_agent_runtime_test",
    redisUrl: "redis://localhost:6379/9",
    objectStoreBucket: "tooldi-agent-runtime-test",
    objectStorePrefix: "agent-runtime-test",
    objectStoreEndpoint: null,
    workerConcurrency: 2,
    heartbeatIntervalMs: 5000,
    leaseTtlMs: 30000,
  };
}

test("buildWorkerRuntime boots a separate execution-plane runtime", async () => {
  const runtime = await buildWorkerRuntime({
    env: createEnv(),
  });

  assert.equal(runtime.env.workerConcurrency, 2);
  assert.equal(runtime.toolRegistry.listEnabledTools().length > 0, true);
  await runtime.close();
});
