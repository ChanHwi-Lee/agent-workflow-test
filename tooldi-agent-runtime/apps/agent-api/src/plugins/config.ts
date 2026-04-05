import type { FastifyPluginAsync } from "fastify";

import {
  loadAgentApiEnv,
  type AgentApiEnv,
} from "@tooldi/agent-config";

export interface ConfigPluginOptions {
  env?: AgentApiEnv;
}

export const configPlugin: FastifyPluginAsync<ConfigPluginOptions> = async (
  app,
  options,
) => {
  app.decorate("config", options.env ?? loadAgentApiEnv());
};
