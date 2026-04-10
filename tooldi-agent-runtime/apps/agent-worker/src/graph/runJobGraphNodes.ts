import type { StateGraph } from "@langchain/langgraph";
import type { TooldiCatalogSourceClient } from "@tooldi/tool-adapters";

import { registerBuildNodes } from "./buildNodes.js";
import { registerExecutionNodes } from "./executionNodes.js";
import { registerFinalizeNodes } from "./finalizeNodes.js";
import { registerPlanningNodes } from "./planningNodes.js";
import { registerRefinementNodes } from "./refinementNodes.js";
import { RunJobGraphState } from "./runJobGraphState.js";
import type { RunJobGraphDependencies } from "./runJobGraphTypes.js";
import type { createRunJobGraphTasks } from "./graphTasks.js";

export function registerRunJobGraphNodes(
  graph: StateGraph<typeof RunJobGraphState>,
  dependencies: RunJobGraphDependencies,
  tasks: ReturnType<typeof createRunJobGraphTasks>,
  tooldiCatalogSourceClient: TooldiCatalogSourceClient,
) {
  registerPlanningNodes(graph, dependencies, tasks);
  registerBuildNodes(graph, dependencies, tasks, tooldiCatalogSourceClient);
  registerExecutionNodes(graph, dependencies, tasks);
  registerRefinementNodes(graph, dependencies, tasks);
  registerFinalizeNodes(graph, dependencies, tasks);
  return graph;
}
