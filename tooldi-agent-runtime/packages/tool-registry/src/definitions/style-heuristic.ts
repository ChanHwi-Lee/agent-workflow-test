import type { ToolDefinition } from "../registry.js";

export const styleHeuristicToolDefinition: ToolDefinition = {
  toolName: "style-heuristic",
  toolVersion: "v1-curated",
  kind: "analysis",
  description: "Apply deterministic template style heuristics for v1 create_template composition",
};
