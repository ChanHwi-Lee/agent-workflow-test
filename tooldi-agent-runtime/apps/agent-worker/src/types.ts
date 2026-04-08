import type {
  CanvasMutationEnvelope,
  ExecutablePlan,
  IntentEnvelope,
  RunRepairContext,
  RunFinalizeRequest,
  RunJobEnvelope,
  StartAgentWorkflowRunRequest,
  WaitMutationAckResponse,
} from "@tooldi/agent-contracts";
import type {
  TemplateCandidateSet,
  TooldiCatalogSourceMode,
} from "@tooldi/tool-adapters";

export interface StoredRunSnapshot {
  editorContext: StartAgentWorkflowRunRequest["editorContext"];
  brandContext: StartAgentWorkflowRunRequest["brandContext"];
  referenceAssets: StartAgentWorkflowRunRequest["referenceAssets"];
  runPolicy: StartAgentWorkflowRunRequest["runPolicy"];
}

export interface HydratedPlanningInput {
  job: RunJobEnvelope;
  request: StartAgentWorkflowRunRequest;
  snapshot: StoredRunSnapshot;
  requestRef: string;
  snapshotRef: string;
  repairContext: RunRepairContext | null;
}

export interface NormalizedIntent {
  intentId: string;
  runId: string;
  traceId: string;
  plannerMode: "heuristic" | "langchain";
  operationFamily: IntentEnvelope["operationFamily"];
  artifactType: string;
  goalSummary: string;
  requestedOutputCount: number;
  templateKind: "promo_banner" | "seasonal_sale_banner";
  domain:
    | "restaurant"
    | "cafe"
    | "fashion_retail"
    | "general_marketing";
  audience:
    | "walk_in_customers"
    | "local_visitors"
    | "sale_shoppers"
    | "general_consumers";
  campaignGoal:
    | "menu_discovery"
    | "product_trial"
    | "sale_conversion"
    | "promotion_awareness";
  canvasPreset: "wide_1200x628" | "square_1080" | "story_1080x1920" | string;
  layoutIntent: "copy_focused" | "hero_focused" | "badge_led";
  tone: "bright_playful";
  requiredSlots: Array<
    "background" | "headline" | "supporting_copy" | "cta" | "decoration"
  >;
  assetPolicy:
    | "graphic_allowed_photo_optional"
    | "photo_preferred_graphic_allowed";
  searchKeywords: string[];
  facets: {
    seasonality: "spring" | null;
    menuType: "food_menu" | "drink_menu" | null;
    promotionStyle:
      | "seasonal_menu_launch"
      | "new_product_promo"
      | "sale_campaign"
      | "general_campaign";
    offerSpecificity: "single_product" | "multi_item" | "broad_offer";
  };
  brandConstraints: {
    palette: string[];
    typographyHint: string | null;
    forbiddenStyles: string[];
  };
  supportedInV1: boolean;
  futureCapableOperations: IntentEnvelope["futureCapableOperations"];
}

export interface TemplateCandidateBundle {
  background: TemplateCandidateSet;
  layout: TemplateCandidateSet;
  decoration: TemplateCandidateSet;
  photo: TemplateCandidateSet;
}

export interface SourceSearchQueryAttempt {
  label: string;
  query: Record<string, string | number | boolean | null>;
  returnedCount: number;
}

export interface SourceSearchFamilySummary {
  family: "background" | "graphic" | "photo" | "font";
  queryAttempts: SourceSearchQueryAttempt[];
  returnedCount: number;
  filteredCount: number;
  fallbackUsed: boolean;
  selectedAssetId: string | null;
  selectedSerial: string | null;
  selectedCategory: string | null;
}

export interface SourceSearchSummary {
  summaryId: string;
  runId: string;
  traceId: string;
  sourceMode: TooldiCatalogSourceMode;
  background: SourceSearchFamilySummary;
  graphic: SourceSearchFamilySummary;
  photo: SourceSearchFamilySummary;
  font: SourceSearchFamilySummary;
}

export interface TypographyChoice {
  fontAssetId: string;
  fontSerial: string;
  fontName: string;
  fontCategory: string;
  fontFace: string;
  fontToken: string;
  fontWeight: number;
}

export interface TypographyDecision {
  decisionId: string;
  runId: string;
  traceId: string;
  sourceMode: TooldiCatalogSourceMode;
  inventoryCount: number;
  fallbackUsed: boolean;
  display: TypographyChoice | null;
  body: TypographyChoice | null;
  summary: string;
}

export interface RetrievalStageResult {
  retrievalMode: "none";
  status: "disabled";
  allowedSourceFamilies: Array<
    "background_source" | "graphic_source" | "photo_source" | "template_source"
  >;
  augmentationCount: number;
  reason: string;
}

export interface TemplateSelectionPolicy {
  allowedToolNames: string[];
  allowPhotoCandidates: boolean;
  allowTemplateSource: boolean;
  retrievalMode: RetrievalStageResult["retrievalMode"];
}

export interface SearchProfileArtifact {
  profileId: string;
  runId: string;
  traceId: string;
  plannerMode: NormalizedIntent["plannerMode"];
  templateKind: NormalizedIntent["templateKind"];
  domain: NormalizedIntent["domain"];
  audience: NormalizedIntent["audience"];
  campaignGoal: NormalizedIntent["campaignGoal"];
  canvasPreset: NormalizedIntent["canvasPreset"];
  layoutIntent: NormalizedIntent["layoutIntent"];
  tone: NormalizedIntent["tone"];
  assetPolicy: NormalizedIntent["assetPolicy"];
  searchKeywords: string[];
  facets: NormalizedIntent["facets"];
  summary: string;
  background: {
    objective: string;
    rationale: string;
    queries: Array<{
      label: string;
      type: "pattern" | "image";
      keyword: string | null;
      source: "initial_load" | "search";
    }>;
  };
  graphic: {
    objective: string;
    rationale: string;
    queries: Array<{
      label: string;
      keyword: string | null;
      categoryName: string | null;
      shapeType:
        | "total"
        | "graphics"
        | "bitmap"
        | "calligraphy"
        | "figure"
        | "rect"
        | "line"
        | "frames"
        | "chart"
        | "font_text"
        | "mix_text"
        | "wordart"
        | null;
      price: "free" | "paid" | null;
      format: "bitmap" | "vector" | null;
    }>;
  };
  photo: {
    enabled: boolean;
    objective: string;
    rationale: string;
    orientationHint: "portrait" | "landscape" | "square" | null;
    queries: Array<{
      label: string;
      keyword: string | null;
      orientation: "portrait" | "landscape" | "square" | null;
      backgroundRemoval: boolean | null;
      source: "initial_load" | "search";
    }>;
  };
  font: {
    objective: string;
    rationale: string;
    supportedLanguage: "KOR";
    preferredCategories: string[];
    typographyHint: string | null;
  };
}

export interface SelectionDecision {
  decisionId: string;
  runId: string;
  traceId: string;
  retrievalMode: "none";
  compareCriteria: Array<
    | "seasonalFit"
    | "readabilitySupport"
    | "ctaVisibilitySupport"
    | "layoutCompatibility"
    | "executionSimplicity"
    | "fallbackSafety"
    | "focalSafety"
    | "cropSafety"
    | "copySeparationSupport"
  >;
  selectedBackgroundCandidateId: string;
  selectedLayoutCandidateId: string;
  selectedDecorationCandidateId: string;
  topPhotoCandidateId: string | null;
  selectedBackgroundAssetId: string | null;
  selectedBackgroundSerial: string | null;
  selectedBackgroundCategory: string | null;
  selectedDecorationAssetId: string | null;
  selectedDecorationSerial: string | null;
  selectedDecorationCategory: string | null;
  topPhotoAssetId: string | null;
  topPhotoSerial: string | null;
  topPhotoCategory: string | null;
  topPhotoUid: string | null;
  topPhotoUrl: string | null;
  topPhotoWidth: number | null;
  topPhotoHeight: number | null;
  topPhotoOrientation: "portrait" | "landscape" | "square" | null;
  backgroundMode: "spring_pattern" | "pastel_gradient" | "spring_photo";
  layoutMode:
    | "copy_left_with_right_decoration"
    | "copy_left_with_right_photo"
    | "center_stack"
    | "badge_led";
  decorationMode: "graphic_cluster" | "ribbon_badge" | "photo_support";
  photoBranchMode:
    | "not_considered"
    | "graphic_preferred"
    | "photo_selected";
  photoBranchReason: string;
  executionStrategy:
    | "graphic_first_shape_text_group"
    | "photo_hero_shape_text_group";
  summary: string;
  fallbackSummary: string;
}

export interface RuleJudgeIssue {
  code:
    | "typography_fallback"
    | "layout_intent_mismatch"
    | "photo_preference_unmet"
    | "photo_candidate_weak"
    | "brand_context_missing"
    | "execution_contract_invalid"
    | "plan_action_missing";
  category:
    | "readability"
    | "hierarchy"
    | "cta_prominence"
    | "copy_visual_separation"
    | "domain_tone_consistency"
    | "execution_safety";
  severity: "info" | "warn" | "error";
  message: string;
  suggestedAction: string | null;
}

export interface RuleJudgeVerdict {
  verdictId: string;
  runId: string;
  traceId: string;
  recommendation: "keep" | "refine" | "refuse";
  confidence: "high" | "medium" | "low";
  issues: RuleJudgeIssue[];
  summary: string;
}

export interface MutationProposalDraft {
  mutationId: string;
  rollbackGroupId: string;
  stageLabel: string;
  stageDescription: string;
  mutation: CanvasMutationEnvelope;
}

export interface SkeletonMutationBatch {
  commitGroup: string;
  proposals: MutationProposalDraft[];
}

export interface RefinementMutationBatch {
  proposedMutationIds: string[];
  lastMutationAck: WaitMutationAckResponse | null;
}

export interface FinalizeRunDraft {
  request: RunFinalizeRequest;
  summary: {
    proposedMutationIds: string[];
    finalStatus: RunFinalizeRequest["finalStatus"];
    lastAckedSeq: number;
  };
}

export interface ProcessRunJobResult {
  intent: NormalizedIntent;
  searchProfile?: SearchProfileArtifact;
  candidateSets?: TemplateCandidateBundle;
  sourceSearchSummary?: SourceSearchSummary;
  retrievalStage?: RetrievalStageResult;
  selectionDecision?: SelectionDecision;
  typographyDecision?: TypographyDecision;
  ruleJudgeVerdict?: RuleJudgeVerdict;
  plan?: ExecutablePlan;
  emittedMutationIds: string[];
  finalizeDraft: FinalizeRunDraft;
  artifactRefs: {
    normalizedIntentRef: string;
    searchProfileRef?: string;
    executablePlanRef?: string;
    candidateSetRef?: string;
    sourceSearchSummaryRef?: string;
    retrievalStageRef?: string;
    selectionDecisionRef?: string;
    typographyDecisionRef?: string;
    ruleJudgeVerdictRef?: string;
  };
}
