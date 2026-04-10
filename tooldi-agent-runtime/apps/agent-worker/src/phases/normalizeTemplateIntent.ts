import { createRequestId } from "@tooldi/agent-domain";
import {
  createHeuristicTemplatePlanner,
  normalizeTemplateAssetPolicy,
  type TemplateIntentDraft,
} from "@tooldi/agent-llm";

import type {
  HydratedPlanningInput,
  IntentNormalizationReport,
  NormalizedIntent,
  NormalizedIntentDraftArtifact,
} from "../types.js";
import { createIntentNormalizationReport } from "./intentNormalizationReport.js";
import { repairTemplateIntentDraft } from "./intentRepairPipeline.js";

export interface NormalizeTemplateIntentResult {
  intent: NormalizedIntent;
  normalizedIntentDraft: NormalizedIntentDraftArtifact | null;
  intentNormalizationReport: IntentNormalizationReport;
}

export async function normalizeTemplateIntent(
  input: HydratedPlanningInput,
  plannerMode: NormalizedIntent["plannerMode"],
  operationFamily: NormalizedIntent["operationFamily"],
  canvasPreset: NormalizedIntent["canvasPreset"],
  plannerDraft: TemplateIntentDraft | null,
): Promise<NormalizeTemplateIntentResult> {
  const prompt = input.request.userInput.prompt.trim();
  const palette = [...input.snapshot.brandContext.palette];
  const normalizedIntentDraft =
    operationFamily === "create_template" && plannerDraft
      ? {
          draftId: createRequestId(),
          runId: input.job.runId,
          traceId: input.job.traceId,
          plannerMode,
          operationFamily,
          canvasPreset,
          prompt,
          palette,
          draft: plannerDraft,
        }
      : null;

  if (operationFamily !== "create_template" || !plannerDraft) {
    const normalizationNotes = [
      "No planner draft was available; normalized intent fell back to request defaults.",
    ];
    const intent: NormalizedIntent = {
      intentId: createRequestId(),
      runId: input.job.runId,
      traceId: input.job.traceId,
      plannerMode,
      operationFamily,
      artifactType: "LiveDraftArtifactBundle",
      goalSummary: prompt,
      requestedOutputCount: input.request.runPolicy.requestedOutputCount,
      templateKind: "promo_banner",
      domain: "general_marketing",
      audience: "general_consumers",
      campaignGoal: "promotion_awareness",
      canvasPreset,
      layoutIntent: "copy_focused",
      tone: "bright_playful",
      requiredSlots: [
        "background",
        "headline",
        "supporting_copy",
        "cta",
        "decoration",
      ],
      assetPolicy: normalizeTemplateAssetPolicy(
        "graphic_allowed_photo_optional",
      ),
      searchKeywords: ["봄"],
      facets: {
        seasonality: prompt.includes("봄") ? "spring" : null,
        menuType: null,
        promotionStyle: "general_campaign",
        offerSpecificity: "multi_item",
      },
      brandConstraints: {
        palette,
        typographyHint: null,
        forbiddenStyles: [],
      },
      consistencyFlags: [],
      normalizationNotes: [...normalizationNotes],
      supportedInV1: false,
      futureCapableOperations: [
        "create_template",
        "update_layer",
        "delete_layer",
      ],
    };

    return {
      intent,
      normalizedIntentDraft,
      intentNormalizationReport: createIntentNormalizationReport({
        input,
        plannerMode,
        prompt,
        draftAvailable: false,
        repairs: [],
        intent,
      }),
    };
  }

  const heuristicDraft = await createHeuristicTemplatePlanner().plan({
    prompt,
    canvasPreset,
    palette,
  });
  const repaired = repairTemplateIntentDraft({
    input,
    plannerMode,
    operationFamily,
    canvasPreset,
    plannerDraft,
    heuristicDraft,
    prompt,
    palette,
  });

  return {
    intent: repaired.intent,
    normalizedIntentDraft,
    intentNormalizationReport: createIntentNormalizationReport({
      input,
      plannerMode,
      prompt,
      draftAvailable: true,
      repairs: repaired.repairs,
      intent: repaired.intent,
    }),
  };
}
