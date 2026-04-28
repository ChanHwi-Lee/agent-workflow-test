import type { HydratedPlanningInput } from "../types.js";
import {
  deriveCanvasPreset,
  deriveOperationFamily,
} from "./planningContext.js";
import {
  normalizeTemplateIntent,
  type NormalizeTemplateIntentResult,
} from "./normalizeTemplateIntent.js";

export async function buildNormalizedIntent(
  input: HydratedPlanningInput,
): Promise<NormalizeTemplateIntentResult> {
  const operationFamily = deriveOperationFamily(input);
  const canvasPreset = deriveCanvasPreset(
    input.request.editorContext.canvasWidth,
    input.request.editorContext.canvasHeight,
  );

  return normalizeTemplateIntent(
    input,
    operationFamily,
    canvasPreset,
  );
}
