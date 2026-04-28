export type TemplateCandidateFamily =
  | "background"
  | "layout"
  | "decoration"
  | "photo";

export type TemplateSourceFamily =
  | "background_source"
  | "graphic_source"
  | "photo_source"
  | "template_source"
  | "derived_policy";

export interface TemplateCandidate {
  candidateId: string;
  family: TemplateCandidateFamily;
  sourceFamily: TemplateSourceFamily;
  sourceAssetId?: string;
  sourceSerial?: string;
  sourceCategory?: string | null;
  sourceUid?: string | null;
  sourceOriginUrl?: string | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  thumbnailUrl?: string | null;
  insertMode?: string | null;
  summary: string;
  fitScore: number;
  selectionReasons: string[];
  riskFlags: string[];
  fallbackIfRejected: string;
  executionAllowed: boolean;
  payload: {
    variantKey: string;
    layoutMode?:
      | "copy_left_with_right_decoration"
      | "copy_left_with_right_photo"
      | "center_stack"
      | "badge_led"
      | "left_copy_right_graphic"
      | "center_stack_promo"
      | "badge_promo_stack"
      | "framed_promo";
    backgroundMode?:
      | "spring_pattern"
      | "pastel_gradient"
      | "spring_photo"
      | "generated_solid";
    backgroundColorHex?: string | null;
    backgroundSourceKind?: "generated_solid";
    decorationMode?:
      | "graphic_cluster"
      | "ribbon_badge"
      | "photo_support"
      | "promo_multi_graphic";
    photoBranchMode?:
      | "not_considered"
      | "graphic_preferred"
      | "photo_selected";
    photoOrientation?: "portrait" | "landscape" | "square";
    themeTokens?: string[];
  };
}

export interface TemplateCandidateSet {
  setId: string;
  family: TemplateCandidateFamily;
  candidates: TemplateCandidate[];
}
