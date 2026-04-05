import type { FastifyPluginAsync } from "fastify";

import { createLogger } from "@tooldi/agent-observability";

export const loggerPlugin: FastifyPluginAsync = async (app) => {
  const logger = createLogger({
    level: app.config.logLevel,
    bindings: {
      service: "agent-api",
      runtime: "control-plane",
    },
  });

  app.decorate("appLogger", logger);
};
