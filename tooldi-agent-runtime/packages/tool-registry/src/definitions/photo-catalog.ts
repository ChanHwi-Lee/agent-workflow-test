import type { ToolDefinition } from "../registry.js";

export const photoCatalogToolDefinition: ToolDefinition = {
  toolName: "photo-catalog",
  toolVersion: "v1-curated",
  kind: "analysis",
  description: "List and score photo candidates separately from graphic element candidates",
};
