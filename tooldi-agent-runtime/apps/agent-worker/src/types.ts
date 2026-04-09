import type {
  CanvasMutationEnvelope,
  ExecutablePlan,
  IntentEnvelope,
  RunRepairContext,
  RunFinalizeRequest,
  RunJobEnvelope,
  StartAgentWorkflowRunRequest,
  TemplatePriorSummary,
  WaitMutationAckResponse,
} from "@tooldi/agent-contracts";
import type {
  TemplateAssetPolicy,
  TemplateIntentDraft,
} from "@tooldi/agent-llm";
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

export interface IntentConsistencyFlag {
  code: string;
  severity: "info" | "warning";
  message: string;
  fields: string[];
}

export interface IntentNormalizationRepair {
  field: string;
  reasonCode: string;
  before: unknown;
  after: unknown;
  note: string;
}

export interface NormalizedIntentDraftArtifact {
  draftId: string;
  runId: string;
  traceId: string;
  plannerMode: "heuristic" | "langchain";
  operationFamily: IntentEnvelope["operationFamily"];
  canvasPreset: "wide_1200x628" | "square_1080" | "story_1080x1920" | string;
  prompt: string;
  palette: string[];
  draft: TemplateIntentDraft;
}

export interface IntentNormalizationReport {
  reportId: string;
  runId: string;
  traceId: string;
  plannerMode: "heuristic" | "langchain";
  prompt: string;
  draftAvailable: boolean;
  repairCount: number;
  appliedRepairs: IntentNormalizationRepair[];
  consistencyFlags: IntentConsistencyFlag[];
  normalizationNotes: string[];
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
  assetPolicy: TemplateAssetPolicy;
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
  consistencyFlags: IntentConsistencyFlag[];
  normalizationNotes: string[];
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
      theme: string | null;
      type: "vector" | "bitmap" | null;
      method: "ai" | "creator" | null;
      price: "free" | "paid" | null;
      ownerBias: "follow" | null;
      categoryName: string | null;
      transportApplied: {
        keyword: boolean;
        theme: boolean;
        type: boolean;
        method: boolean;
        price: boolean;
        owner: boolean;
        categoryName: boolean;
      };
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
      theme: string | null;
      type: "pic" | "rmbg" | null;
      format: "square" | "horizontal" | "vertical" | null;
      price: "free" | "paid" | null;
      ownerBias: "follow" | null;
      source: "initial_load" | "search";
      transportApplied: {
        keyword: boolean;
        theme: boolean;
        type: boolean;
        format: boolean;
        price: boolean;
        owner: boolean;
        source: boolean;
      };
    }>;
  };
  font: {
    objective: string;
    rationale: string;
    sourceSurface: "Editor::loadFont";
    typographyHint: string | null;
    language: {
      value: "KOR";
      rationale: string;
    };
    category: {
      attempts: Array<"고딕" | "명조" | "손글씨">;
      rationale: string;
    };
    weight: {
      displayTarget: number;
      bodyTarget: number | null;
      rationale: string;
    };
  };
}

export type GraphicCompositionRole =
  | "primary_accent"
  | "cta_container"
  | "secondary_accent"
  | "corner_accent"
  | "badge_or_ribbon"
  | "frame";

export interface GraphicCompositionEntry {
  role: GraphicCompositionRole;
  candidateId: string;
  sourceAssetId: string | null;
  sourceSerial: string | null;
  sourceCategory: string | null;
  variantKey: string;
  decorationMode:
    | "graphic_cluster"
    | "ribbon_badge"
    | "photo_support"
    | "promo_multi_graphic";
}

export interface GraphicCompositionSet {
  density: "minimal" | "medium";
  roles: GraphicCompositionEntry[];
  summary: string;
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
    | "badge_led"
    | "left_copy_right_graphic"
    | "center_stack_promo"
    | "badge_promo_stack"
    | "framed_promo";
  decorationMode:
    | "graphic_cluster"
    | "ribbon_badge"
    | "photo_support"
    | "promo_multi_graphic";
  photoBranchMode:
    | "not_considered"
    | "graphic_preferred"
    | "photo_selected";
  photoBranchReason: string;
  executionStrategy:
    | "graphic_first_shape_text_group"
    | "photo_hero_shape_text_group";
  graphicCompositionSet: GraphicCompositionSet | null;
  summary: string;
  fallbackSummary: string;
}

export type RuleJudgeIssueCode =
  | "typography_fallback"
  | "layout_intent_mismatch"
  | "photo_preference_unmet"
  | "photo_candidate_weak"
  | "brand_context_missing"
  | "execution_contract_invalid"
  | "plan_action_missing"
  | "domain_subject_mismatch"
  | "theme_domain_mismatch"
  | "search_profile_intent_mismatch"
  | "asset_policy_conflict"
  | "template_prior_conflict"
  | "primary_visual_drift"
  | "photo_subject_drift"
  | "insufficient_graphic_density"
  | "promo_structure_incomplete"
  | "cta_copy_overlap_risk"
  | "excessive_empty_space"
  | "graphic_role_imbalance";

export type RuleJudgeIssueCategory =
  | "readability"
  | "hierarchy"
  | "cta_prominence"
  | "copy_visual_separation"
  | "domain_tone_consistency"
  | "execution_safety"
  | "semantic_domain_alignment"
  | "retrieval_intent_alignment"
  | "policy_alignment"
  | "prior_alignment"
  | "visual_consistency"
  | "graphic_density"
  | "spatial_composition"
  | "composition_balance";

export type RuleJudgeIssueSeverity = "info" | "warn" | "error";

export type RuleJudgeRecommendation = "keep" | "refine" | "refuse";

export type RuleJudgeConfidence = "high" | "medium" | "low";

export interface RuleJudgeIssueMetadata {
  ruleScope:
    | "readability"
    | "layout"
    | "photo_preference"
    | "graphic_density"
    | "spatial_composition"
    | "composition_balance"
    | "semantic_domain_alignment"
    | "retrieval_intent_alignment"
    | "policy_alignment"
    | "prior_alignment"
    | "visual_consistency"
    | "execution_safety";
  recommendationImpact: RuleJudgeRecommendation;
  repairAttempted?: boolean;
  repairOutcome?: "not_attempted" | "repaired" | "warning_only" | "irrecoverable";
  evidenceRefs?: string[];
  contextRefs?: string[];
  legacyAliases?: string[];
}

export interface RuleJudgeIssue {
  code: RuleJudgeIssueCode;
  category: RuleJudgeIssueCategory;
  severity: RuleJudgeIssueSeverity;
  message: string;
  suggestedAction: string | null;
  metadata?: RuleJudgeIssueMetadata;
}

export interface RuleJudgeVerdict {
  verdictId: string;
  runId: string;
  traceId: string;
  recommendation: RuleJudgeRecommendation;
  confidence: RuleJudgeConfidence;
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
  normalizedIntentDraft?: NormalizedIntentDraftArtifact;
  intentNormalizationReport?: IntentNormalizationReport;
  templatePriorSummary?: TemplatePriorSummary;
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
    normalizedIntentDraftRef?: string;
    intentNormalizationReportRef?: string;
    templatePriorSummaryRef?: string;
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
