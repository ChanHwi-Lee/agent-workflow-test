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
    googleApiKey: null,
    htmlGenProvider: "gemini",
    htmlGenThinkingLevel: "low",
    claudeCodeModel: "sonnet",
    claudeCodeEffort: "low",
    claudeCodeTimeoutMs: 180000,
    trendResearchMode: "off",
    trendResearchModel: "gemini-3-flash-preview",
    trendCacheTtlSeconds: 604800,
    v6AssetRagMode: "off",
    v6AssetEmbeddingEndpoint: "http://127.0.0.1:7070/embed/text",
    v6AssetQdrantUrl: "http://127.0.0.1:6333",
    v6AssetPhotoCollection: "tooldi_photos_v1",
    v6AssetGraphicCollection: "tooldi_graphics_v1",
    v6AssetPublicBaseUrl: "https://dev-file.tooldi.com",
    v6AssetTopK: 40,
    v6AssetRerankCandidateCount: 6,
    v6AssetTimeoutMs: 8000,
    v6AssetVisionRerankMode: "off",
    v6AssetVisionModel: "gemini-3.1-flash-lite-preview",
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
  assert.equal(env.tooldiContentApiTimeoutMs, null);
  assert.equal(env.langGraphCheckpointerMode, "postgres");
  assert.equal(env.templatePlannerMode, "heuristic");
  assert.equal(env.htmlGenProvider, "gemini");
  assert.equal(env.htmlGenThinkingLevel, "low");
  assert.equal(env.claudeCodeModel, "sonnet");
  assert.equal(env.claudeCodeEffort, "low");
  assert.equal(env.claudeCodeTimeoutMs, 180000);
  assert.equal(env.trendResearchMode, "off");
  assert.equal(env.trendResearchModel, "gemini-3-flash-preview");
  assert.equal(env.trendCacheTtlSeconds, 604800);
});

test("loadAgentWorkerEnv reads Claude Code v6 HTML generator env", () => {
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
    HTML_GEN_PROVIDER: "claude_code",
    CLAUDE_CODE_MODEL: "sonnet",
    CLAUDE_CODE_EFFORT: "low",
    CLAUDE_CODE_TIMEOUT_MS: "90000",
  });

  assert.equal(env.htmlGenProvider, "claude_code");
  assert.equal(env.claudeCodeModel, "sonnet");
  assert.equal(env.claudeCodeEffort, "low");
  assert.equal(env.claudeCodeTimeoutMs, 90000);
});

test("loadAgentWorkerEnv는 Gemini HTML 생성 thinking level 값을 읽는다", () => {
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
    HTML_GEN_THINKING_LEVEL: "medium",
  });

  assert.equal(env.htmlGenThinkingLevel, "medium");
});

test("loadAgentWorkerEnv reads optional trend research env", () => {
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
    TREND_RESEARCH_MODE: "enabled",
    TREND_RESEARCH_MODEL: "gemini-3-flash-preview",
    TREND_CACHE_TTL_SECONDS: "3600",
  });

  assert.equal(env.trendResearchMode, "enabled");
  assert.equal(env.trendResearchModel, "gemini-3-flash-preview");
  assert.equal(env.trendCacheTtlSeconds, 3600);
});

test("loadAgentWorkerEnv requires Tooldi content API base URL in real Tooldi API mode", () => {
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
        TOOLDI_CATALOG_SOURCE_MODE: "tooldi_api_direct",
      }),
    /TOOLDI_CONTENT_API_BASE_URL/,
  );
});

test("loadAgentWorkerEnv는 google planner provider와 모델 값을 읽는다", () => {
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
    TEMPLATE_PLANNER_MODE: "langchain",
    TEMPLATE_PLANNER_PROVIDER: "google",
    TEMPLATE_PLANNER_MODEL: "gemini-2.5-flash",
  });

  assert.equal(env.templatePlannerMode, "langchain");
  assert.equal(env.templatePlannerProvider, "google");
  assert.equal(env.templatePlannerModel, "gemini-2.5-flash");
});

test("loadAgentWorkerEnv는 지원하지 않는 planner provider를 거부한다", () => {
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
        TEMPLATE_PLANNER_MODE: "langchain",
        TEMPLATE_PLANNER_PROVIDER: "not-supported",
        TEMPLATE_PLANNER_MODEL: "google/gemma-4-31b-it:free",
      }),
    /TEMPLATE_PLANNER_PROVIDER/,
  );
});

test("tooldi_api_direct catalog source mode creates an HTTP-backed source client", async () => {
  const client = createTooldiCatalogSourceClientForMode("tooldi_api_direct", {
    tooldiContentApiBaseUrl: "http://localhost:8080",
    tooldiContentApiTimeoutMs: null,
    tooldiContentApiCookie: null,
  });

  assert.equal(typeof client.searchBackgroundAssets, "function");
  assert.equal(typeof client.searchGraphicAssets, "function");
  assert.equal(typeof client.searchPhotoAssets, "function");
  assert.equal(typeof client.listFontAssets, "function");
});

test("real Tooldi API catalog source mode rejects non-localhost base URLs", () => {
  assert.throws(
    () =>
      createTooldiCatalogSourceClientForMode("tooldi_api_direct", {
        tooldiContentApiBaseUrl: "http://127.0.0.1:8080",
        tooldiContentApiTimeoutMs: 5000,
        tooldiContentApiCookie: null,
      }),
    /localhost/,
  );
});
