import type { AgentWorkerEnv } from "@tooldi/agent-config";
import type { Logger } from "@tooldi/agent-observability";

import { createHeuristicTemplatePlanner } from "./heuristicTemplatePlanner.js";
import { createLangChainTemplatePlanner } from "./langchainTemplatePlanner.js";
import type { TemplatePlanner } from "./templatePlannerSchemas.js";

export * from "./templatePlannerSchemas.js";
export * from "./templatePlannerAssetPolicy.js";
export * from "./heuristicTemplatePlanner.js";
export * from "./langchainTemplatePlanner.js";

export function createTemplatePlanner(
  env: Pick<
    AgentWorkerEnv,
    | "templatePlannerMode"
    | "templatePlannerProvider"
    | "templatePlannerModel"
    | "templatePlannerTemperature"
  >,
  logger: Logger,
): TemplatePlanner {
  if (env.templatePlannerMode === "heuristic") {
    return createHeuristicTemplatePlanner();
  }

  const provider = env.templatePlannerProvider;
  const modelName = env.templatePlannerModel;
  if (!provider || !modelName) {
    throw new Error(
      "TEMPLATE_PLANNER_MODE=langchain requires TEMPLATE_PLANNER_PROVIDER and TEMPLATE_PLANNER_MODEL",
    );
  }

  logger.info("LangChain template planner configured", {
    provider,
    model: modelName,
    temperature: env.templatePlannerTemperature,
  });

  return createLangChainTemplatePlanner({
    provider,
    modelName,
    temperature: env.templatePlannerTemperature,
  });
}
