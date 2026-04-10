import {
  END,
  MemorySaver,
  START,
  StateGraph,
} from "@langchain/langgraph";
import type { TooldiCatalogSourceClient } from "@tooldi/tool-adapters";
import { createPlaceholderTooldiCatalogSourceClient } from "@tooldi/tool-adapters";

import { createRunJobGraphTasks } from "./graphTasks.js";
import { registerRunJobGraphEdges } from "./runJobGraphEdges.js";
import { registerRunJobGraphNodes } from "./runJobGraphNodes.js";
import { RunJobGraphState } from "./runJobGraphState.js";
import type { RunJobGraphDependencies } from "./runJobGraphTypes.js";

export type { RunJobGraphDependencies } from "./runJobGraphTypes.js";

function resolveTooldiCatalogSourceClient(
  client: TooldiCatalogSourceClient | undefined,
): TooldiCatalogSourceClient {
  return client ?? createPlaceholderTooldiCatalogSourceClient();
}

export function buildRunJobGraph(dependencies: RunJobGraphDependencies) {
  const tooldiCatalogSourceClient = resolveTooldiCatalogSourceClient(
    dependencies.tooldiCatalogSourceClient,
  );
  const tasks = createRunJobGraphTasks(dependencies);

  const graph = registerRunJobGraphNodes(
    new StateGraph(RunJobGraphState),
    dependencies,
    tasks,
    tooldiCatalogSourceClient,
  );

  registerRunJobGraphEdges(graph as any);
  (graph as any).addEdge(START, "hydrate_input").addEdge("send_finalize", END);

  return graph.compile({
    checkpointer: dependencies.langGraphCheckpointer ?? new MemorySaver(),
  });
}
