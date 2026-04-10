import type { ToolDefinition } from "../registry.js";

export const templateSaveToolDefinition: ToolDefinition = {
  toolName: "template-save",
  toolVersion: "v1-curated",
  kind: "document_commit",
  description:
    "Persist the current editable draft through the existing editor save path",
};
