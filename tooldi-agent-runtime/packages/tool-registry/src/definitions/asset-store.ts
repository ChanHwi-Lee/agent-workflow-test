import type { ToolDefinition } from "../registry.js";

export const assetStoreToolDefinition: ToolDefinition = {
  toolName: "asset-store",
  toolVersion: "v1-stub",
  kind: "document_commit",
  description: "Persist generated intermediate assets for later mutation steps",
};
