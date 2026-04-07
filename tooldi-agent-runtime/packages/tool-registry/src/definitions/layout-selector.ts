import type { ToolDefinition } from "../registry.js";

export const layoutSelectorToolDefinition: ToolDefinition = {
  toolName: "layout-selector",
  toolVersion: "v1-curated",
  kind: "analysis",
  description: "Choose a layout path for create_template based on structured intent and candidate sets",
};
