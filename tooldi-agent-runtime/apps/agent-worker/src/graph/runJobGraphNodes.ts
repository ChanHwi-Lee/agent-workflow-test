import type { StateGraph } from "@langchain/langgraph";
import type { TooldiCatalogSourceClient } from "@tooldi/tool-adapters";

import { registerExecutionNodes } from "./executionNodes.js";
import { registerFinalizeNodes } from "./finalizeNodes.js";
import { registerInterviewUserNode } from "./interviewNode.js";
import { registerPlanningNodes } from "./planningNodes.js";
import { registerV6PipelineNode } from "./v6PipelineNode.js";
import { registerV6TrendResearchNode } from "./v6TrendResearchNode.js";
import { RunJobGraphState } from "./runJobGraphState.js";
import type { RunJobGraphDependencies } from "./runJobGraphTypes.js";
import type { createRunJobGraphTasks } from "./graphTasks.js";

export function registerRunJobGraphNodes(
  graph: StateGraph<typeof RunJobGraphState>,
  dependencies: RunJobGraphDependencies,
  tasks: ReturnType<typeof createRunJobGraphTasks>,
  tooldiCatalogSourceClient: TooldiCatalogSourceClient,
) {
  void tooldiCatalogSourceClient;
  registerPlanningNodes(graph, dependencies, tasks);
  registerInterviewUserNode(graph, dependencies, tasks);
  registerV6TrendResearchNode(graph, dependencies, tasks);
  registerV6PipelineNode(graph, dependencies, tasks, dependencies.v6Overrides);
  registerExecutionNodes(graph, dependencies, tasks);
  registerFinalizeNodes(graph, dependencies, tasks);
  return graph;
}
