import { createRequestId } from "@tooldi/agent-domain";
import {
  createHeuristicTemplatePlanner,
  type TemplatePlanner,
} from "@tooldi/agent-llm";

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
  const planner =
    operationFamily === "create_template"
      ? (dependencies?.templatePlanner ?? createHeuristicTemplatePlanner())
      : null;
  const plannerDraft =
    operationFamily === "create_template"
      ? await planner?.plan({
          prompt: input.request.userInput.prompt,
          canvasPreset,
          palette: input.snapshot.brandContext.palette,
        })
      : null;

  return {
    intentId: createRequestId(),
    runId: input.job.runId,
    traceId: input.job.traceId,
    plannerMode: planner?.mode ?? "heuristic",
    operationFamily,
    artifactType: "LiveDraftArtifactBundle",
    goalSummary: plannerDraft?.goalSummary ?? input.request.userInput.prompt,
    requestedOutputCount: input.request.runPolicy.requestedOutputCount,
    templateKind: plannerDraft?.templateKind ?? "promo_banner",
    domain: plannerDraft?.domain ?? "general_marketing",
    audience: plannerDraft?.audience ?? "general_consumers",
    campaignGoal: plannerDraft?.campaignGoal ?? "promotion_awareness",
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
    assetPolicy:
      plannerDraft?.assetPolicy ?? "graphic_allowed_photo_optional",
    searchKeywords: plannerDraft?.searchKeywords ?? ["봄"],
    facets: plannerDraft?.facets ?? {
      seasonality: input.request.userInput.prompt.includes("봄") ? "spring" : null,
      menuType: null,
      promotionStyle: "general_campaign",
      offerSpecificity: "multi_item",
    },
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
