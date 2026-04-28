import {
  END,
  START,
  StateGraph,
} from "@langchain/langgraph";

import { createRunJobGraphTasks } from "./graphTasks.js";
import { registerRunJobGraphEdges } from "./runJobGraphEdges.js";
import { registerRunJobGraphNodes } from "./runJobGraphNodes.js";
import { RunJobGraphState } from "./runJobGraphState.js";
import type { RunJobGraphDependencies } from "./runJobGraphTypes.js";

export type { RunJobGraphDependencies } from "./runJobGraphTypes.js";

export function buildRunJobGraph(dependencies: RunJobGraphDependencies) {
  const tasks = createRunJobGraphTasks(dependencies);

  const graph = registerRunJobGraphNodes(
    new StateGraph(RunJobGraphState),
    dependencies,
    tasks,
  );

  registerRunJobGraphEdges(graph as any);
  (graph as any).addEdge(START, "hydrate_input").addEdge("send_finalize", END);

  return graph.compile({
    checkpointer: dependencies.langGraphCheckpointer,
  });
}
