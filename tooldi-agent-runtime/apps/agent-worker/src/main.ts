import { loadAgentWorkerEnv } from "./lib/config.js";
import { buildWorkerRuntime } from "./worker.js";

const env = loadAgentWorkerEnv();

let runtime: Awaited<ReturnType<typeof buildWorkerRuntime>> | null = null;

try {
  runtime = await buildWorkerRuntime({ env });
  runtime.logger.info("Agent worker boot completed", {
    concurrency: env.workerConcurrency,
    heartbeatIntervalMs: env.heartbeatIntervalMs,
    queueTransportMode: env.queueTransportMode,
    queueName: env.bullmqQueueName,
    agentInternalBaseUrl: env.agentInternalBaseUrl,
  });

  if (env.exitAfterBoot) {
    runtime.logger.info("Agent worker exiting after boot smoke", {
      queueTransportMode: env.queueTransportMode,
    });
  } else {
    await waitForShutdownSignal(runtime.logger);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (runtime) {
    await runtime.close();
  }
}

function waitForShutdownSignal(
  logger: { info(message: string, fields?: Record<string, unknown>): void },
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (signal: NodeJS.Signals) => {
      if (settled) {
        return;
      }
      settled = true;
      logger.info("Agent worker shutdown requested", {
        signal,
      });
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
      resolve();
    };

    const onSigint = () => finish("SIGINT");
    const onSigterm = () => finish("SIGTERM");

    process.on("SIGINT", onSigint);
    process.on("SIGTERM", onSigterm);
  });
}
