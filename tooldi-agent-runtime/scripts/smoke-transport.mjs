import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const currentDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(currentDir, "..");
const apiEntrypoint = resolve(workspaceRoot, "apps/agent-api/dist/main.js");
const workerEntrypoint = resolve(workspaceRoot, "apps/agent-worker/dist/main.js");

const apiPort = await getAvailablePort();
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const queueName = `agent-workflow-interactive-smoke-${Date.now()}`;
const objectStoreRootDir = await mkdtemp(
  join(tmpdir(), "tooldi-agent-runtime-smoke-"),
);

const processes = [];

try {
  const api = await startProcess({
    name: "agent-api",
    entrypoint: apiEntrypoint,
    env: {
      ...process.env,
      NODE_ENV: "test",
      LOG_LEVEL: "info",
      POSTGRES_URL: "postgres://localhost:5432/tooldi_agent_runtime_test",
      REDIS_URL: "redis://localhost:6379/9",
      BULLMQ_QUEUE_NAME: queueName,
      OBJECT_STORE_MODE: "filesystem",
      OBJECT_STORE_ROOT_DIR: objectStoreRootDir,
      OBJECT_STORE_BUCKET: "tooldi-agent-runtime-smoke",
      OBJECT_STORE_PREFIX: "agent-runtime-smoke",
      LANGGRAPH_CHECKPOINTER_MODE: "memory",
      API_HOST: "127.0.0.1",
      API_PORT: String(apiPort),
      PUBLIC_BASE_URL: apiBaseUrl,
    },
    readyPattern: /Agent API listening/,
  });
  processes.push(api);

  const worker = await startProcess({
    name: "agent-worker",
    entrypoint: workerEntrypoint,
    env: {
      ...process.env,
      NODE_ENV: "test",
      LOG_LEVEL: "info",
      POSTGRES_URL: "postgres://localhost:5432/tooldi_agent_runtime_test",
      REDIS_URL: "redis://localhost:6379/9",
      BULLMQ_QUEUE_NAME: queueName,
      OBJECT_STORE_MODE: "filesystem",
      OBJECT_STORE_ROOT_DIR: objectStoreRootDir,
      OBJECT_STORE_BUCKET: "tooldi-agent-runtime-smoke",
      OBJECT_STORE_PREFIX: "agent-runtime-smoke",
      WORKER_CONCURRENCY: "1",
      WORKER_HEARTBEAT_INTERVAL_MS: "5000",
      WORKER_LEASE_TTL_MS: "30000",
      LANGGRAPH_CHECKPOINTER_MODE: "memory",
      WORKER_QUEUE_TRANSPORT_MODE: "bullmq",
      AGENT_INTERNAL_BASE_URL: apiBaseUrl,
    },
    readyPattern: /Agent worker boot completed/,
  });
  processes.push(worker);

  const accepted = await startRun(apiBaseUrl);
  console.log(
    `[smoke] accepted run ${accepted.runId} trace=${accepted.traceId}`,
  );

  await driveRunStream(accepted);

  console.log("[smoke] transport pipeline completed successfully");
} finally {
  await Promise.allSettled(processes.map((processHandle) => stopProcess(processHandle)));
  await rm(objectStoreRootDir, { recursive: true, force: true });
}

async function driveRunStream(accepted) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("Timed out while waiting for SSE completion"));
  }, 20000);

  let currentRevision = 0;

  try {
    const response = await fetch(accepted.streamUrl, {
      signal: controller.signal,
      headers: {
        Accept: "text/event-stream",
      },
    });
    if (!response.ok || !response.body) {
      throw new Error(`Failed to open SSE stream: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let delimiterIndex = buffer.indexOf("\n\n");
      while (delimiterIndex >= 0) {
        const chunk = buffer.slice(0, delimiterIndex);
        buffer = buffer.slice(delimiterIndex + 2);
        delimiterIndex = buffer.indexOf("\n\n");

        const event = parseSseChunk(chunk);
        if (!event) {
          continue;
        }

        if (event.event === "canvas.mutation") {
          const payload = JSON.parse(event.data);
          await postMutationAck(accepted, payload, currentRevision);
          currentRevision += 1;
          console.log(
            `[smoke] acked mutation ${payload.mutation.mutationId} seq=${payload.seq}`,
          );
        }

        if (event.event === "run.failed") {
          throw new Error(`Run failed during smoke: ${event.data}`);
        }

        if (event.event === "run.completed") {
          console.log("[smoke] observed run.completed SSE");
          return;
        }
      }
    }

    throw new Error("SSE stream closed before run.completed");
  } finally {
    clearTimeout(timeout);
  }
}

function parseSseChunk(chunk) {
  if (chunk.startsWith(":") || chunk.trim().length === 0) {
    return null;
  }

  const lines = chunk.split("\n");
  let event = "message";
  let data = "";

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      event = line.slice("event: ".length);
      continue;
    }
    if (line.startsWith("data: ")) {
      data += line.slice("data: ".length);
    }
  }

  return {
    event,
    data,
  };
}

async function postMutationAck(accepted, payload, currentRevision) {
  const mutation = payload.mutation;
  const response = await fetch(accepted.mutationAckUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      runId: accepted.runId,
      traceId: accepted.traceId,
      mutationId: mutation.mutationId,
      seq: payload.seq,
      status: "applied",
      targetPageId: mutation.pageId,
      baseRevision: currentRevision,
      resultingRevision: currentRevision + 1,
      resolvedLayerIds: Object.fromEntries(
        mutation.commands
          .filter((command) => command.targetRef.clientLayerKey)
          .map((command) => [
            command.targetRef.clientLayerKey,
            command.targetRef.clientLayerKey,
          ]),
      ),
      commandResults: mutation.commands.map((command) => ({
        commandId: command.commandId,
        op: command.op,
        status: "applied",
        resolvedLayerId: command.targetRef.clientLayerKey ?? "resolved-layer-1",
      })),
      clientObservedAt: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Mutation ack failed with ${response.status}: ${await response.text()}`,
    );
  }
}

async function startRun(apiBaseUrl) {
  const response = await fetch(`${apiBaseUrl}/api/agent-workflow/runs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      clientRequestId: `smoke-client-request-${Date.now()}`,
      editorSessionId: "smoke-editor-session",
      surface: "toolditor",
      userInput: {
        prompt: "봄 세일 배너를 만들어줘",
        locale: "ko-KR",
        timezone: "Asia/Seoul",
      },
      editorContext: {
        documentId: "smoke-document-1",
        pageId: "smoke-page-1",
        canvasState: "empty",
        canvasWidth: 1080,
        canvasHeight: 1080,
        sizeSerial: "1080x1080@1",
        workingTemplateCode: null,
        canvasSnapshotRef: null,
        selectedLayerIds: [],
      },
      brandContext: {
        brandName: null,
        palette: [],
        logoAssetId: null,
      },
      referenceAssets: [],
      runPolicy: {
        mode: "live_commit",
        approvalMode: "none",
        timeBudgetMs: 120000,
        milestoneTargetsMs: {
          firstVisible: 1000,
          editableMinimum: 3000,
          saveStarted: 5000,
        },
        milestoneDeadlinesMs: {
          planValidated: 1000,
          firstVisible: 2000,
          editableMinimum: 5000,
          mutationCutoff: 10000,
          hardDeadline: 120000,
        },
        requestedOutputCount: 1,
        allowInternalAiPrimitives: true,
      },
      clientInfo: {
        pagePath: "/editor",
        viewportWidth: 1440,
        viewportHeight: 900,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `POST /runs failed with ${response.status}: ${await response.text()}`,
    );
  }

  return response.json();
}

async function startProcess({ name, entrypoint, env, readyPattern }) {
  const child = spawn(process.execPath, [entrypoint], {
    cwd: workspaceRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  const ready = new Promise((resolveReady, rejectReady) => {
    const onStdout = (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(`[${name}:stdout] ${chunk}`);
      if (readyPattern.test(stdout)) {
        cleanup();
        resolveReady(undefined);
      }
    };
    const onStderr = (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(`[${name}:stderr] ${chunk}`);
    };
    const onExit = (code, signal) => {
      cleanup();
      rejectReady(
        new Error(
          `${name} exited before ready. code=${String(code)} signal=${String(signal)} stdout=${stdout} stderr=${stderr}`,
        ),
      );
    };
    const onError = (error) => {
      cleanup();
      rejectReady(error);
    };

    const cleanup = () => {
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("exit", onExit);
      child.off("error", onError);
    };

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("exit", onExit);
    child.once("error", onError);
  });

  await ready;

  return {
    name,
    child,
  };
}

async function stopProcess(processHandle) {
  if (processHandle.child.exitCode !== null || processHandle.child.signalCode !== null) {
    return;
  }

  processHandle.child.kill("SIGTERM");
  await new Promise((resolveStop) => {
    processHandle.child.once("close", () => resolveStop(undefined));
    setTimeout(() => resolveStop(undefined), 5000);
  });
}

async function getAvailablePort() {
  return await new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        rejectPort(new Error("Failed to acquire ephemeral port"));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          rejectPort(error);
          return;
        }
        resolvePort(port);
      });
    });
    server.on("error", rejectPort);
  });
}
