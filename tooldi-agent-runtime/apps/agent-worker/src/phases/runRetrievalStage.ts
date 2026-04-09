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
      reason:
        "Semantic retrieval augmentation is disabled in v1; direct Tooldi source search stays active through grounded background/graphic/photo queries.",
    },
    selectionPolicy,
  };
}
