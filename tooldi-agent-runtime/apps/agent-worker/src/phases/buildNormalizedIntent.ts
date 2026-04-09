import {
  type TemplateIntentDraft,
  type TemplatePlanner,
} from "@tooldi/agent-llm";

import type { HydratedPlanningInput } from "../types.js";
import {
  deriveCanvasPreset,
  deriveOperationFamily,
} from "./planningContext.js";
import {
  normalizeTemplateIntent,
  type NormalizeTemplateIntentResult,
} from "./normalizeTemplateIntent.js";
import { resolvePlannerDraft } from "./resolvePlannerDraft.js";

export async function buildNormalizedIntent(
  input: HydratedPlanningInput,
  dependencies?: {
    templatePlanner?: TemplatePlanner;
    plannerDraft?: TemplateIntentDraft | null;
    plannerMode?: TemplatePlanner["mode"];
  },
): Promise<NormalizeTemplateIntentResult> {
  const operationFamily = deriveOperationFamily(input);
  const canvasPreset = deriveCanvasPreset(
    input.request.editorContext.canvasWidth,
    input.request.editorContext.canvasHeight,
  );
  const plannerResolution = hasPlannerDraftOverride(dependencies)
    ? {
        plannerDraft: dependencies.plannerDraft ?? null,
        plannerMode:
          dependencies.plannerMode ??
          dependencies.templatePlanner?.mode ??
          "heuristic",
        fallbackReason: null,
      }
    : await resolvePlannerDraft(input, dependencies);

  return normalizeTemplateIntent(
    input,
    plannerResolution.plannerMode,
    operationFamily,
    canvasPreset,
    plannerResolution.plannerDraft,
  );
}

function hasPlannerDraftOverride(
  dependencies:
    | {
        templatePlanner?: TemplatePlanner;
        plannerDraft?: TemplateIntentDraft | null;
        plannerMode?: TemplatePlanner["mode"];
      }
    | undefined,
): dependencies is {
  templatePlanner?: TemplatePlanner;
  plannerDraft?: TemplateIntentDraft | null;
  plannerMode?: TemplatePlanner["mode"];
} {
  return dependencies !== undefined && "plannerDraft" in dependencies;
}
