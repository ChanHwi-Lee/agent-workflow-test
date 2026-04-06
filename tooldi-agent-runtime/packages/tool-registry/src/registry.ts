import type { PlannerEnabledTool } from "@tooldi/agent-contracts";

import { assetStoreToolDefinition } from "./definitions/asset-store.js";
import { imageEditToolDefinition } from "./definitions/image-edit.js";
import { imageGenerateToolDefinition } from "./definitions/image-generate.js";
import { textLayoutToolDefinition } from "./definitions/text-layout.js";

export interface ToolDefinition extends PlannerEnabledTool {
  description: string;
}

export interface ToolRegistry {
  listEnabledTools(): readonly ToolDefinition[];
  getTool(toolName: string): ToolDefinition | null;
}

export interface CreateToolRegistryOptions {
  enabledTools?: readonly ToolDefinition[];
}

export const defaultToolDefinitions = [
  imageGenerateToolDefinition,
  imageEditToolDefinition,
  assetStoreToolDefinition,
  textLayoutToolDefinition,
] as const satisfies readonly ToolDefinition[];

class InMemoryToolRegistry implements ToolRegistry {
  constructor(private readonly enabledTools: readonly ToolDefinition[]) {}

  listEnabledTools(): readonly ToolDefinition[] {
    return this.enabledTools;
  }

  getTool(toolName: string): ToolDefinition | null {
    return this.enabledTools.find((tool) => tool.toolName === toolName) ?? null;
  }
}

export function createToolRegistry(
  options: CreateToolRegistryOptions = {},
): ToolRegistry {
  return new InMemoryToolRegistry(options.enabledTools ?? defaultToolDefinitions);
}
