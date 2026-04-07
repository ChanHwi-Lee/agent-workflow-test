import type { CreateToolRegistryOptions, ToolRegistry } from "@tooldi/tool-registry";
import { createToolRegistry, defaultToolDefinitions } from "@tooldi/tool-registry";

export function createWorkerToolRegistry(
  options?: CreateToolRegistryOptions & {
    disabledToolNames?: string[];
  },
): ToolRegistry {
  if (options?.disabledToolNames && options.disabledToolNames.length > 0) {
    return createToolRegistry({
      enabledTools: defaultToolDefinitions.filter(
        (tool) => !options.disabledToolNames?.includes(tool.toolName),
      ),
    });
  }

  return createToolRegistry(options);
}
