import type { ToolRegistry } from "@tooldi/tool-registry";
import { createToolRegistry } from "@tooldi/tool-registry";

export function createWorkerToolRegistry(): ToolRegistry {
  return createToolRegistry();
}
