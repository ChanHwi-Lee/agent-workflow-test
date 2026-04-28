import { createRequestId } from "@tooldi/agent-domain";
import { normalizeTemplateAssetPolicy } from "@tooldi/agent-llm";

import type {
  CanonicalDesignBrief,
  HydratedPlanningInput,
  IntentNormalizationReport,
  SemanticBriefDraftArtifact,
} from "../types.js";
import { createIntentNormalizationReport } from "./intentNormalizationReport.js";
import {
  buildNormalizedKeywords,
  createDeterministicAssetPolicy,
  deriveAudience,
  deriveBackgroundColorHex,
  deriveCampaignGoal,
  deriveExplicitDomain,
  deriveExpectedMenuType,
  deriveExpectedPromotionStyle,
  deriveLayoutIntent,
  deriveOfferIntent,
  deriveOfferSpecificity,
  deriveSubjectBinding,
  extractPromptSignals,
  shouldPreferGraphicPromoStructure,
} from "./intentInference.js";

export interface NormalizeTemplateIntentResult {
  intent: CanonicalDesignBrief;
  semanticBriefDraft: SemanticBriefDraftArtifact | null;
  intentNormalizationReport: IntentNormalizationReport;
}

export async function normalizeTemplateIntent(
  input: HydratedPlanningInput,
  operationFamily: CanonicalDesignBrief["operationFamily"],
  canvasPreset: CanonicalDesignBrief["canvasPreset"],
): Promise<NormalizeTemplateIntentResult> {
  const prompt = input.request.userInput.prompt.trim();
  const palette = [...input.snapshot.brandContext.palette];
  const promptSignals = extractPromptSignals(prompt);
  const domain = deriveExplicitDomain(promptSignals) ?? "general_marketing";
  const menuType = deriveExpectedMenuType(promptSignals, domain);
  const fallbackPromotionStyle =
    promptSignals.sale
      ? "sale_campaign"
      : promptSignals.newness || promptSignals.launch
        ? menuType === null
          ? "new_product_promo"
          : "seasonal_menu_launch"
        : "general_campaign";
  const promotionStyle = deriveExpectedPromotionStyle(
    promptSignals,
    domain,
    menuType,
    fallbackPromotionStyle,
  );
  const offerIntent = deriveOfferIntent(promotionStyle);
  const preferGraphicPromoStructure = shouldPreferGraphicPromoStructure(
    promptSignals,
    domain,
    menuType,
    offerIntent,
  );
  const subjectBinding = deriveSubjectBinding(
    prompt,
    domain,
    menuType,
    preferGraphicPromoStructure,
  );
  const assetPolicy = createDeterministicAssetPolicy(
    domain,
    menuType,
    preferGraphicPromoStructure,
  );
  const normalizationNotes = [
    "Canonical design brief was compiled deterministically from prompt and canvas context.",
  ];

  if (preferGraphicPromoStructure) {
    normalizationNotes.push(
      "Generic promo wording selected a graphic-first structure before asset retrieval.",
    );
  }
  if (operationFamily !== "create_template") {
    normalizationNotes.push(
      "Only empty-canvas create_template runs are supported in the current v1 slice.",
    );
  }

  const intent: CanonicalDesignBrief = {
    intentId: createRequestId(),
    runId: input.job.runId,
    traceId: input.job.traceId,
    operationFamily,
    artifactType: "LiveDraftArtifactBundle",
    goalSummary: prompt,
    requestedOutputCount: input.request.runPolicy.requestedOutputCount,
    templateKind:
      promotionStyle === "sale_campaign"
        ? "seasonal_sale_banner"
        : "promo_banner",
    domain,
    audience: deriveAudience(domain),
    campaignGoal: deriveCampaignGoal(promotionStyle),
    subjectBinding,
    offerIntent,
    canvasPreset,
    layoutIntent: deriveLayoutIntent(
      promptSignals,
      domain,
      promotionStyle,
      menuType,
    ),
    tone: "bright_playful",
    backgroundColorHex: deriveBackgroundColorHex(prompt),
    assetPolicy,
    searchKeywords: buildNormalizedKeywords(
      prompt,
      domain,
      menuType,
      subjectBinding === "subjectless",
      offerIntent,
    ),
    primaryVisualPolicy: assetPolicy.primaryVisualPolicy,
    facets: {
      seasonality: promptSignals.spring ? "spring" : null,
      menuType,
      promotionStyle,
      offerSpecificity: deriveOfferSpecificity(promotionStyle, menuType),
    },
    brandConstraints: {
      palette,
      typographyHint:
        domain === "fashion_retail"
          ? "세련된 고딕 계열로 명확한 가격/혜택 강조"
          : domain === "cafe"
            ? "가독성이 높은 둥근 고딕 계열"
            : null,
      forbiddenStyles: [],
    },
    consistencyFlags: [],
    normalizationNotes,
    supportedInV1: operationFamily === "create_template",
    futureCapableOperations: [
      "create_template",
      "update_layer",
      "delete_layer",
    ],
  };

  return {
    intent,
    semanticBriefDraft: null,
    intentNormalizationReport: createIntentNormalizationReport({
      input,
      prompt,
      draftAvailable: false,
      repairs: [],
      intent,
    }),
  };
}
