import assert from "node:assert/strict";
import test from "node:test";

import type { AgentWorkerEnv } from "@tooldi/agent-config";

import { loadAgentWorkerEnv } from "./lib/config.js";
import { createTooldiCatalogSourceClientForMode } from "./tools/adapters/tooldiCatalogSourceAdapter.js";
import { buildWorkerRuntime } from "./worker.js";

function createEnv(): AgentWorkerEnv {
  return {
    nodeEnv: "test",
    logLevel: "debug",
    postgresUrl: "postgres://localhost:5432/tooldi_agent_runtime_test",
    redisUrl: "redis://localhost:6379/9",
    bullmqQueueName: "agent-workflow-interactive-test",
    objectStoreMode: "memory",
    objectStoreRootDir: "/tmp/tooldi-agent-runtime-object-store-test",
    objectStoreBucket: "tooldi-agent-runtime-test",
    objectStorePrefix: "agent-runtime-test",
    objectStoreEndpoint: null,
    workerConcurrency: 2,
    heartbeatIntervalMs: 5000,
    leaseTtlMs: 30000,
    queueTransportMode: "disabled",
    agentInternalBaseUrl: "http://127.0.0.1:3000",
    templatePlannerMode: "heuristic",
    templatePlannerProvider: null,
    templatePlannerModel: null,
    templatePlannerTemperature: 0,
    langGraphCheckpointerMode: "memory",
    langGraphCheckpointerPostgresUrl: null,
    langGraphCheckpointerSchema: "agent_langgraph_test",
    tooldiCatalogSourceMode: "placeholder",
    tooldiContentApiBaseUrl: null,
    tooldiContentApiTimeoutMs: 5000,
    tooldiContentApiCookie: null,
    exitAfterBoot: false,
  };
}

test("buildWorkerRuntime boots a separate execution-plane runtime", async () => {
  const runtime = await buildWorkerRuntime({
    env: createEnv(),
  });

  assert.equal(runtime.env.workerConcurrency, 2);
  assert.equal(runtime.toolRegistry.listEnabledTools().length > 0, true);
  assert.equal(runtime.tooldiCatalogSourceClient !== undefined, true);
  await runtime.close();
});

test("loadAgentWorkerEnv defaults Tooldi catalog source to placeholder mode", () => {
  const env = loadAgentWorkerEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "info",
    POSTGRES_URL: "postgres://localhost:5432/tooldi_agent_runtime_test",
    REDIS_URL: "redis://localhost:6379/9",
    BULLMQ_QUEUE_NAME: "agent-workflow-interactive-test",
    OBJECT_STORE_MODE: "memory",
    OBJECT_STORE_ROOT_DIR: "/tmp/tooldi-agent-runtime-object-store-test",
    OBJECT_STORE_BUCKET: "tooldi-agent-runtime-test",
    OBJECT_STORE_PREFIX: "agent-runtime-test",
    WORKER_QUEUE_TRANSPORT_MODE: "disabled",
    AGENT_INTERNAL_BASE_URL: "http://127.0.0.1:3000",
  });

  assert.equal(env.tooldiCatalogSourceMode, "placeholder");
  assert.equal(env.tooldiContentApiBaseUrl, null);
  assert.equal(env.langGraphCheckpointerMode, "postgres");
  assert.equal(env.templatePlannerMode, "heuristic");
});

test("loadAgentWorkerEnv requires Tooldi content API base URL in tooldi_api mode", () => {
  assert.throws(
    () =>
      loadAgentWorkerEnv({
        NODE_ENV: "test",
        LOG_LEVEL: "info",
        POSTGRES_URL: "postgres://localhost:5432/tooldi_agent_runtime_test",
        REDIS_URL: "redis://localhost:6379/9",
        BULLMQ_QUEUE_NAME: "agent-workflow-interactive-test",
        OBJECT_STORE_MODE: "memory",
        OBJECT_STORE_ROOT_DIR: "/tmp/tooldi-agent-runtime-object-store-test",
        OBJECT_STORE_BUCKET: "tooldi-agent-runtime-test",
        OBJECT_STORE_PREFIX: "agent-runtime-test",
        WORKER_QUEUE_TRANSPORT_MODE: "disabled",
        AGENT_INTERNAL_BASE_URL: "http://127.0.0.1:3000",
        TOOLDI_CATALOG_SOURCE_MODE: "tooldi_api",
      }),
    /TOOLDI_CONTENT_API_BASE_URL/,
  );
});

test("tooldi_api catalog source mode creates an HTTP-backed source client", async () => {
  const client = createTooldiCatalogSourceClientForMode("tooldi_api", {
    tooldiContentApiBaseUrl: "http://localhost:8080",
    tooldiContentApiTimeoutMs: 5000,
    tooldiContentApiCookie: null,
  });

  assert.equal(typeof client.searchBackgroundAssets, "function");
  assert.equal(typeof client.searchGraphicAssets, "function");
  assert.equal(typeof client.searchPhotoAssets, "function");
  assert.equal(typeof client.listFontAssets, "function");
});

test("tooldi_api catalog source mode rejects non-localhost base URLs", () => {
  assert.throws(
    () =>
      createTooldiCatalogSourceClientForMode("tooldi_api", {
        tooldiContentApiBaseUrl: "http://127.0.0.1:8080",
        tooldiContentApiTimeoutMs: 5000,
        tooldiContentApiCookie: null,
      }),
    /localhost/,
  );
});
