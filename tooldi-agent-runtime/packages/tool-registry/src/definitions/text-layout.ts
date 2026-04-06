import type { ToolDefinition } from "../registry.js";

export const textLayoutToolDefinition: ToolDefinition = {
  toolName: "text-layout",
  toolVersion: "v1-stub",
  kind: "analysis",
  description: "Estimate text layout before emitting canvas mutations",
};
