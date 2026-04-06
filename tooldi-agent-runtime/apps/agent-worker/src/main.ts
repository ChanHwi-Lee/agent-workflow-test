import { loadAgentWorkerEnv } from "./lib/config.js";
import { buildWorkerRuntime } from "./worker.js";

const env = loadAgentWorkerEnv();
const runtime = await buildWorkerRuntime({ env });

try {
  runtime.logger.info("Agent worker boot completed", {
    concurrency: env.workerConcurrency,
    heartbeatIntervalMs: env.heartbeatIntervalMs,
    mode: "skeleton_no_queue_consumer",
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await runtime.close();
}
