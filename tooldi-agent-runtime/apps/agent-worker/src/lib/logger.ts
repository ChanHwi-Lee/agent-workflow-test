import type { AgentWorkerEnv } from "@tooldi/agent-config";
import { createLogger } from "@tooldi/agent-observability";

export function createWorkerLogger(env: AgentWorkerEnv) {
  return createLogger({
    level: env.logLevel,
    bindings: {
      service: "agent-worker",
      runtime: "execution-plane",
    },
  });
}
