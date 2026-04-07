import type { ToolRegistry } from "@tooldi/tool-registry";

import type {
  HydratedPlanningInput,
  NormalizedIntent,
  RetrievalStageResult,
  TemplateSelectionPolicy,
} from "../types.js";

export async function runRetrievalStage(
  _input: HydratedPlanningInput,
  _intent: NormalizedIntent,
  dependencies: {
    toolRegistry: ToolRegistry;
  },
): Promise<{
  retrievalStage: RetrievalStageResult;
  selectionPolicy: TemplateSelectionPolicy;
}> {
  const enabledToolNames = dependencies.toolRegistry
    .listEnabledTools()
    .map((tool) => tool.toolName);

  const selectionPolicy: TemplateSelectionPolicy = {
    allowedToolNames: enabledToolNames,
    allowPhotoCandidates: enabledToolNames.includes("photo-catalog"),
    allowTemplateSource: false,
    retrievalMode: "none",
  };

  return {
    retrievalStage: {
      retrievalMode: "none",
      status: "disabled",
      allowedSourceFamilies: [
        "background_source",
        "graphic_source",
        ...(selectionPolicy.allowPhotoCandidates ? ["photo_source" as const] : []),
        ...(selectionPolicy.allowTemplateSource ? ["template_source" as const] : []),
      ],
      augmentationCount: 0,
      reason: "v1 retrieval stage intentionally disabled; curated candidate catalog only",
    },
    selectionPolicy,
  };
}
