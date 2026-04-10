import { createRequestId } from "@tooldi/agent-domain";
import { normalizeTemplateAssetPolicy } from "@tooldi/agent-llm";
import type { TemplateCandidateSet } from "@tooldi/tool-adapters";

import type {
  HydratedPlanningInput,
  NormalizedIntent,
} from "../types.js";

export function createLayoutCandidateSet(
  input: HydratedPlanningInput,
  intent: NormalizedIntent,
): TemplateCandidateSet {
  const wideCanvas =
    input.request.editorContext.canvasWidth >= input.request.editorContext.canvasHeight;
  const assetPolicy = normalizeTemplateAssetPolicy(intent.assetPolicy);
  const graphicPreferred =
    assetPolicy.primaryVisualPolicy === "graphic_preferred";
  const badgeIntent = intent.layoutIntent === "badge_led";

  return {
    setId: `layout_candidates_${createRequestId()}`,
    family: "layout",
    candidates: [
      {
        candidateId: "layout_left_copy_right_graphic",
        family: "layout",
        sourceFamily: "derived_policy",
        summary: "Copy cluster on the left with a richer multi-graphic field on the right",
        fitScore:
          wideCanvas && graphicPreferred
            ? 0.97
            : wideCanvas
              ? 0.9
              : 0.7,
        selectionReasons: [
          "optimized for generic promo banners that want graphic-heavy emphasis",
          "gives headline, CTA, and accent graphics clearer separation on wide canvases",
        ],
        riskFlags: [],
        fallbackIfRejected: "layout_framed_promo",
        executionAllowed: true,
        payload: {
          variantKey: "left_copy_right_graphic",
          layoutMode: "left_copy_right_graphic",
          themeTokens: ["graphic", "promo", "wide"],
        },
      },
      {
        candidateId: "layout_framed_promo",
        family: "layout",
        sourceFamily: "derived_policy",
        summary: "Framed promotional poster with graphic-led accents and centered focus",
        fitScore:
          graphicPreferred && !badgeIntent
            ? wideCanvas
              ? 0.93
              : 0.89
            : wideCanvas
              ? 0.87
              : 0.84,
        selectionReasons: [
          "works well for graphic-led promo posters without requiring a photo hero",
          "supports medium-density accent structure and stronger CTA framing",
        ],
        riskFlags: ["requires multiple graphic roles for the best result"],
        fallbackIfRejected: "layout_center_stack_promo",
        executionAllowed: true,
        payload: {
          variantKey: "framed_promo",
          layoutMode: "framed_promo",
          themeTokens: ["promo", "frame", "graphic"],
        },
      },
      {
        candidateId: "layout_center_stack_promo",
        family: "layout",
        sourceFamily: "derived_policy",
        summary: "Centered promo stack with clearer spacing for CTA and accent graphics",
        fitScore:
          !wideCanvas && graphicPreferred
            ? 0.95
            : wideCanvas
              ? 0.86
              : 0.9,
        selectionReasons: [
          "safer centered fallback for generic promo banners",
          "reserves more room for badge, CTA, and supporting decoration than the legacy center stack",
        ],
        riskFlags: [],
        fallbackIfRejected: "layout_center_stack",
        executionAllowed: true,
        payload: {
          variantKey: "center_stack_promo",
          layoutMode: "center_stack_promo",
          themeTokens: ["promo", "stacked", "graphic"],
        },
      },
      {
        candidateId: "layout_badge_promo_stack",
        family: "layout",
        sourceFamily: "derived_policy",
        summary: "Badge-forward promo stack with compact copy and promotion tokens",
        fitScore: badgeIntent ? 0.94 : 0.82,
        selectionReasons: [
          "best when the prompt or repaired intent explicitly wants badge-led promotion",
          "keeps coupon/badge/ribbon motifs visible without collapsing the CTA block",
        ],
        riskFlags: ["can feel visually busy if too many accents survive ranking"],
        fallbackIfRejected: "layout_center_stack_promo",
        executionAllowed: true,
        payload: {
          variantKey: "badge_promo_stack",
          layoutMode: "badge_promo_stack",
          themeTokens: ["badge", "promo", "graphic"],
        },
      },
      {
        candidateId: "layout_copy_left_with_right_decoration",
        family: "layout",
        sourceFamily: "derived_policy",
        summary: "Copy cluster on the left with a decorative field on the right",
        fitScore: wideCanvas ? 0.94 : 0.78,
        selectionReasons: [
          "best fit for wide banner preset",
          "supports readable copy-first hierarchy",
        ],
        riskFlags: [],
        fallbackIfRejected: "layout_center_stack",
        executionAllowed: true,
        payload: {
          variantKey: "copy_left_with_right_decoration",
          layoutMode: "copy_left_with_right_decoration",
          themeTokens: ["copy", "wide", "promo"],
        },
      },
      {
        candidateId: "layout_copy_left_with_right_photo",
        family: "layout",
        sourceFamily: "derived_policy",
        summary: "Copy cluster on the left with a dedicated photo hero field on the right",
        fitScore: wideCanvas ? 0.91 : 0.68,
        selectionReasons: [
          "dedicated wide-only layout for a single hero photo object",
          "keeps copy and photo fields explicitly separated",
        ],
        riskFlags: ["requires executable photo metadata and fail-fast execution path"],
        fallbackIfRejected: "layout_copy_left_with_right_decoration",
        executionAllowed: wideCanvas,
        payload: {
          variantKey: "copy_left_with_right_photo",
          layoutMode: "copy_left_with_right_photo",
          themeTokens: ["copy", "wide", "photo"],
        },
      },
      {
        candidateId: "layout_center_stack",
        family: "layout",
        sourceFamily: "derived_policy",
        summary: "Centered stack with balanced copy block",
        fitScore: wideCanvas ? 0.76 : 0.82,
        selectionReasons: [
          "safe fallback for non-wide canvas",
          "simple copy hierarchy",
        ],
        riskFlags: [],
        fallbackIfRejected: "layout_copy_left_with_right_decoration",
        executionAllowed: true,
        payload: {
          variantKey: "center_stack",
          layoutMode: "center_stack",
          themeTokens: ["stacked", "balanced"],
        },
      },
      {
        candidateId: "layout_badge_led",
        family: "layout",
        sourceFamily: "derived_policy",
        summary: "Badge-led promotional block with compact text cluster",
        fitScore: badgeIntent ? 0.84 : 0.7,
        selectionReasons: ["useful for promotion-focused CTA rhythm"],
        riskFlags: ["more visually busy"],
        fallbackIfRejected: "layout_badge_promo_stack",
        executionAllowed: true,
        payload: {
          variantKey: "badge_led",
          layoutMode: "badge_led",
          themeTokens: ["badge", "promo"],
        },
      },
    ],
  };
}
