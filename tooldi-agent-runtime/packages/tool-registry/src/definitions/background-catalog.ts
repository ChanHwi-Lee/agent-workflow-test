import type { ToolDefinition } from "../registry.js";

export const backgroundCatalogToolDefinition: ToolDefinition = {
  toolName: "background-catalog",
  toolVersion: "v1-curated",
  kind: "analysis",
  description: "List and score background candidates for template creation",
};
