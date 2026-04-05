import { loadAgentApiEnv } from "@tooldi/agent-config";

import { buildApp } from "./app.js";

const env = loadAgentApiEnv();
const app = await buildApp({ env });

try {
  await app.listen({
    host: env.host,
    port: env.port,
  });

  app.appLogger.info("Agent API listening", {
    host: env.host,
    port: env.port,
    publicBaseUrl: env.publicBaseUrl,
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
