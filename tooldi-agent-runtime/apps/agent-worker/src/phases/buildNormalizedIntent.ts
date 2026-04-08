import { createRequestId } from "@tooldi/agent-domain";
import type { TemplatePlanner } from "@tooldi/agent-llm";

import type { HydratedPlanningInput, NormalizedIntent } from "../types.js";

export async function buildNormalizedIntent(
  input: HydratedPlanningInput,
  dependencies?: {
    templatePlanner?: TemplatePlanner;
  },
): Promise<NormalizedIntent> {
  const operationFamily =
    input.request.editorContext.canvasState === "empty"
      ? "create_template"
      : "update_layer";

  const canvasPreset = deriveCanvasPreset(
    input.request.editorContext.canvasWidth,
    input.request.editorContext.canvasHeight,
  );
  const plannerDraft =
    operationFamily === "create_template"
      ? await dependencies?.templatePlanner?.plan({
          prompt: input.request.userInput.prompt,
          canvasPreset,
          palette: input.snapshot.brandContext.palette,
        })
      : null;

  return {
    intentId: createRequestId(),
    runId: input.job.runId,
    traceId: input.job.traceId,
    plannerMode: dependencies?.templatePlanner?.mode ?? "heuristic",
    operationFamily,
    artifactType: "LiveDraftArtifactBundle",
    goalSummary: plannerDraft?.goalSummary ?? input.request.userInput.prompt,
    requestedOutputCount: input.request.runPolicy.requestedOutputCount,
    templateKind: "seasonal_sale_banner",
    canvasPreset,
    layoutIntent: plannerDraft?.layoutIntent ?? "copy_focused",
    tone: plannerDraft?.tone ?? "bright_playful",
    requiredSlots: [
      "background",
      "headline",
      "supporting_copy",
      "cta",
      "decoration",
    ],
    assetPolicy: "graphic_allowed_photo_optional",
    searchKeywords: plannerDraft?.searchKeywords ?? ["봄"],
    brandConstraints: {
      palette: input.snapshot.brandContext.palette,
      typographyHint: plannerDraft?.typographyHint ?? null,
      forbiddenStyles: [],
    },
    supportedInV1: operationFamily === "create_template",
    futureCapableOperations: [
      "create_template",
      "update_layer",
      "delete_layer",
    ],
  };
}

function deriveCanvasPreset(width: number, height: number): NormalizedIntent["canvasPreset"] {
  if (width === 1200 && height === 628) {
    return "wide_1200x628";
  }

  if (width === 1080 && height === 1080) {
    return "square_1080";
  }

  if (width === 1080 && height === 1920) {
    return "story_1080x1920";
  }

  return `custom_${width}x${height}`;
}
