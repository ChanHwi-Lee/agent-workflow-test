import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

test("worker main entrypoint boots and exits cleanly", async () => {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  const entrypoint = resolve(currentDir, "main.js");

  const result = await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
  }>((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, [entrypoint], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        LOG_LEVEL: "info",
        POSTGRES_URL: "postgres://localhost:5432/tooldi_agent_runtime_test",
        REDIS_URL: "redis://localhost:6379/9",
        BULLMQ_QUEUE_NAME: "agent-workflow-interactive-test",
        OBJECT_STORE_BUCKET: "tooldi-agent-runtime-test",
        OBJECT_STORE_PREFIX: "agent-runtime-test",
        WORKER_CONCURRENCY: "1",
        WORKER_HEARTBEAT_INTERVAL_MS: "5000",
        WORKER_LEASE_TTL_MS: "30000",
        WORKER_QUEUE_TRANSPORT_MODE: "disabled",
        AGENT_INTERNAL_BASE_URL: "http://127.0.0.1:3000",
        TEMPLATE_PLANNER_MODE: "heuristic",
        LANGGRAPH_CHECKPOINTER_MODE: "memory",
        TOOLDI_CATALOG_SOURCE_MODE: "placeholder",
        WORKER_EXIT_AFTER_BOOT: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectChild);
    child.on("close", (code, signal) => {
      resolveChild({
        code,
        signal,
        stdout,
        stderr,
      });
    });
  });

  assert.equal(result.code, 0);
  assert.equal(result.signal, null);
  assert.match(result.stdout, /Agent worker boot completed/);
  assert.match(result.stdout, /Agent worker exiting after boot smoke/);
  assert.match(result.stderr, /Worker queue transport is disabled/);
});
