import type {
  CanvasMutationEnvelope,
  ExecutionSlotKey,
  ExecutablePlan,
  IntentEnvelope,
  InterviewAnswer,
  InterviewQuestion,
  RunRepairContext,
  RunFinalizeRequest,
  RunJobEnvelope,
  StartAgentWorkflowRunRequest,
  TemplatePriorSummary,
  WaitMutationAckResponse,
} from "@tooldi/agent-contracts";
import type {
  TemplateAbstractLayoutDraft,
  TemplateAssetPolicy,
  TemplateCopyPlanDraft,
  TemplateSemanticBriefContext,
  TemplateSemanticBriefDraft,
} from "@tooldi/agent-llm";
import type {
  TemplateCandidateSet,
  TooldiCatalogSourceErrorCode,
  TooldiTemplateDocument,
  TooldiCatalogSourceMode,
} from "@tooldi/tool-adapters";

export interface StoredRunSnapshot {
  editorContext: StartAgentWorkflowRunRequest["editorContext"];
  brandContext: StartAgentWorkflowRunRequest["brandContext"];
  referenceAssets: StartAgentWorkflowRunRequest["referenceAssets"];
  runPolicy: StartAgentWorkflowRunRequest["runPolicy"];
}

export interface InterviewTimings {
  questionsMs: number;
  answersMs: number;
  briefMs: number;
  totalMs: number;
}

export interface InterviewUsages {
  questions: unknown | null;
  answers: unknown | null;
  brief: unknown | null;
}

export interface InterviewState {
  questions: ReadonlyArray<InterviewQuestion>;
  answers: ReadonlyArray<InterviewAnswer>;
  derivedBrief: string;
  autoFilledIds: ReadonlyArray<string>;
  builtUserPrompt: string;
  timings: InterviewTimings;
  usages: InterviewUsages;
}

export interface HydratedPlanningInput {
  job: RunJobEnvelope;
  request: StartAgentWorkflowRunRequest;
  snapshot: StoredRunSnapshot;
  requestRef: string;
  snapshotRef: string;
  repairContext: RunRepairContext | null;
}

export type WorkflowVariant = "object_native_v1";

export type TemplateScaffoldLayoutMode =
  | "copy_left_with_right_decoration"
  | "copy_left_with_right_photo"
  | "center_stack"
  | "badge_led"
  | "left_copy_right_graphic"
  | "center_stack_promo"
  | "badge_promo_stack"
  | "framed_promo";

export interface TemplatePriorScaffold {
  scaffoldId: string;
  sourceTemplateCode: string;
  sourceTemplateSerial: string;
  title: string;
  canvasWidth: number | null;
  canvasHeight: number | null;
  backgroundMode: "image" | "color" | "pattern" | "gradient" | "unknown";
  textObjectCount: number;
  visualObjectCount: number;
  groupObjectCount: number;
  dominantObjectTypes: string[];
  copyAnchor: "left" | "center";
  visualAnchor: "right" | "center" | "background";
  layoutFamilyHint:
    | "promo_split"
    | "promo_center"
    | "promo_badge"
    | "promo_frame"
    | "subject_hero";
  layoutModeHint: TemplateScaffoldLayoutMode;
  primaryVisualFamilyHint: "graphic" | "photo";
  summary: string;
}

export type TemplateRecallSource = "legacy_keyword" | "vector_image";

export interface TemplatePriorCandidate {
  rank: number;
  score: number;
  deterministicScore: number;
  geminiScore: number | null;
  keep: boolean;
  keepReason: string;
  rejectReason: string | null;
  matchedQueryLabels: string[];
  templateAssetId: string;
  templateSerial: string;
  templateCode: string;
  title: string;
  categoryName: string | null;
  width: number | null;
  height: number | null;
  pages: number;
  keywordTokens: string[];
  thumbnailUrl: string | null;
  traceId: string | null;
  fetchedDocument: TooldiTemplateDocument | null;
  scaffold: TemplatePriorScaffold | null;
  /**
   * R1 addition. Marks which recall source surfaced this candidate.
   * Absent on pre-R1 fixtures; runtime callers should treat `undefined`
   * as `["legacy_keyword"]` (the pre-R1 default behavior). Populated
   * consistently by `buildTemplatePriorBundle`.
   */
  recallSources?: TemplateRecallSource[];
}

export interface TemplatePriorBundle {
  bundleId: string;
  runId: string;
  traceId: string;
  workflowVariant: "object_native_v1";
  query: {
    keyword: string;
    canvas: "horizontal" | "vertical" | "square" | "";
    requestedTopK: number;
  };
  queryPlan: Array<{
    label: string;
    keyword: string;
  }>;
  usedFallbackToLegacy: boolean;
  fallbackReason: string | null;
  selectedTemplateCode: string | null;
  selectedTemplateTitle: string | null;
  selectedScaffold: TemplatePriorScaffold | null;
  candidates: TemplatePriorCandidate[];
  diagnostics?: TemplatePriorDiagnostics;
  summary: string;
}

export interface TemplatePriorQueryDiagnostic {
  label: string;
  keyword: string;
  page: number;
  status: "ok" | "error";
  retrievedAssetCount: number;
  traceId: string | null;
  errorCode: TooldiCatalogSourceErrorCode | null;
  errorMessage: string | null;
  errorUrl: string | null;
  errorStatus: number | null;
  responsePreview: string | null;
}

export interface TemplatePriorDiagnostics {
  totalQueryCount: number;
  successfulQueryCount: number;
  failedQueryCount: number;
  mergedCandidateCount: number;
  keptCandidateCount: number;
  rerankedCandidateCount: number;
  queryDiagnostics: TemplatePriorQueryDiagnostic[];
  vectorRecallDiagnostics?: VectorRecallDiagnostics;
}

export type VectorRecallDiagnostics =
  | {
      status: "executed";
      topK: number;
      candidateCount: number;
      latencyMs: number;
      error: null;
    }
  | {
      status: "error";
      topK: number;
      candidateCount: 0;
      latencyMs: number;
      error: {
        code: "timeout" | "transport" | "invalid_response";
        message: string;
      };
    }
  | {
      status: "skipped";
      reason: "canvas_out_of_r1_scope";
    };

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

export interface SemanticBriefDraftArtifact {
  draftId: string;
  runId: string;
  traceId: string;
  plannerMode: "heuristic" | "langchain";
  operationFamily: IntentEnvelope["operationFamily"];
  canvasPreset: "wide_1200x628" | "square_1080" | "story_1080x1920" | string;
  prompt: string;
  palette: string[];
  draft: TemplateSemanticBriefDraft;
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

export interface CanonicalDesignBrief extends TemplateSemanticBriefContext {
  intentId: string;
  runId: string;
  traceId: string;
  plannerMode: "heuristic" | "langchain";
  operationFamily: IntentEnvelope["operationFamily"];
  artifactType: string;
  requestedOutputCount: number;
  consistencyFlags: IntentConsistencyFlag[];
  normalizationNotes: string[];
  supportedInV1: boolean;
  futureCapableOperations: IntentEnvelope["futureCapableOperations"];
}

export type NormalizedIntent = CanonicalDesignBrief;
export type NormalizedIntentDraftArtifact = SemanticBriefDraftArtifact;

export type CopyPlanSlotKey =
  | "headline"
  | "subheadline"
  | "offer_line"
  | "cta"
  | "footer_note"
  | "badge_text";

export type CopyPlanPriority =
  | "primary"
  | "secondary"
  | "supporting"
  | "utility";

export type CopyPlanToneHint = "promotional" | "informational" | "urgent";

export interface CopyPlanSlot {
  key: CopyPlanSlotKey;
  text: string;
  priority: CopyPlanPriority;
  required: boolean;
  maxLength: number;
  toneHint: CopyPlanToneHint | null;
}

export interface CopyPlan {
  planId: string;
  runId: string;
  traceId: string;
  plannerMode: NormalizedIntent["plannerMode"];
  source: "heuristic" | "langchain";
  slots: CopyPlanSlot[];
  primaryMessage: string;
  summary: string;
}

export interface CopyPlanNormalizationReport {
  reportId: string;
  runId: string;
  traceId: string;
  source: "heuristic" | "langchain";
  draftAvailable: boolean;
  repairCount: number;
  normalizationNotes: string[];
}

export type AbstractLayoutFamily =
  | "promo_split"
  | "promo_center"
  | "promo_badge"
  | "promo_frame"
  | "subject_hero";

export type AbstractLayoutCopyAnchor = "left" | "center";
export type AbstractLayoutVisualAnchor = "right" | "center" | "background";
export type AbstractLayoutCtaAnchor =
  | "below_copy"
  | "inline_offer"
  | "bottom_center";
export type AbstractLayoutDensity = "airy" | "balanced" | "dense";
export type AbstractLayoutSlotTopology =
  | "headline_supporting_offer_cta_footer"
  | "headline_supporting_cta_footer"
  | "badge_headline_offer_cta_footer"
  | "hero_headline_supporting_cta_footer";

export interface AbstractLayoutPlan {
  planId: string;
  runId: string;
  traceId: string;
  plannerMode: NormalizedIntent["plannerMode"];
  source: "heuristic" | "langchain";
  layoutFamily: AbstractLayoutFamily;
  copyAnchor: AbstractLayoutCopyAnchor;
  visualAnchor: AbstractLayoutVisualAnchor;
  ctaAnchor: AbstractLayoutCtaAnchor;
  density: AbstractLayoutDensity;
  slotTopology: AbstractLayoutSlotTopology;
  summary: string;
}

export interface AbstractLayoutPlanNormalizationReport {
  reportId: string;
  runId: string;
  traceId: string;
  source: "heuristic" | "langchain";
  draftAvailable: boolean;
  repairCount: number;
  normalizationNotes: string[];
}

export type SceneRoleKey =
  | "background"
  | "primaryMessage"
  | "supportingMessage"
  | "offerEmphasis"
  | "cta"
  | "heroVisual"
  | "accentVisual"
  | "legalNote"
  | "badge";

export type SceneRoleZone =
  | "background"
  | "copy_cluster"
  | "visual_cluster"
  | "footer"
  | "badge";

export interface SceneRolePlanEntry {
  key: SceneRoleKey;
  required: boolean;
  preferredZone: SceneRoleZone;
  mappedExecutionSlotKey: CopyPlanSlotKey | "background" | "hero_image" | null;
  priority: CopyPlanPriority;
  maxLength: number | null;
  toneHint: CopyPlanToneHint | null;
  source: "intent" | "scaffold" | "hybrid";
  summary: string;
}

export interface SceneRolePlan {
  planId: string;
  runId: string;
  traceId: string;
  workflowVariant: "object_native_v1";
  selectedTemplateCode: string;
  selectedTemplateTitle: string;
  roles: SceneRolePlanEntry[];
  summary: string;
}

export interface SceneLayoutPlan {
  planId: string;
  runId: string;
  traceId: string;
  workflowVariant: "object_native_v1";
  selectedTemplateCode: string;
  selectedTemplateTitle: string;
  layoutFamily: AbstractLayoutFamily;
  layoutMode: SelectionDecision["layoutMode"];
  copyAnchor: AbstractLayoutCopyAnchor;
  visualAnchor: AbstractLayoutVisualAnchor;
  ctaAnchor: AbstractLayoutCtaAnchor;
  density: AbstractLayoutDensity;
  slotTopology: AbstractLayoutSlotTopology;
  primaryVisualFamily: "graphic" | "photo";
  resolution: "scaffold" | "intent_override";
  summary: string;
}

export type SceneTypographyCategoryHint = "고딕" | "명조" | "손글씨";
export type SceneTypographyTone = "rounded" | "neutral" | "formal" | "playful";
export type SceneMotifTag =
  | "floral"
  | "leaf"
  | "coupon"
  | "ribbon"
  | "spark"
  | "abstract"
  | "geometric";
export type SceneCtaShapeLanguage =
  | "pill"
  | "band"
  | "soft_rect"
  | "transparent_band";

export interface ScenePalettePolicy {
  backgroundColorHex: string;
  secondaryBackgroundColorHex: string | null;
  primaryTextColorHex: string | null;
  secondaryTextColorHex: string | null;
  accentColorHex: string | null;
  ctaSurfaceColorHex: string | null;
  ctaTextColorHex: string | null;
}

export interface SceneTypographyPolicy {
  templateFontFamily: string | null;
  categoryHints: SceneTypographyCategoryHint[];
  tone: SceneTypographyTone;
  displayWeightTarget: number;
  bodyWeightTarget: number;
  summary: string;
}

export interface SceneStylePlan {
  planId: string;
  runId: string;
  traceId: string;
  workflowVariant: "object_native_v1";
  selectedTemplateCode: string;
  selectedTemplateTitle: string;
  backgroundKind: TemplatePriorScaffold["backgroundMode"];
  palettePolicy: ScenePalettePolicy;
  typographyPolicy: SceneTypographyPolicy;
  motifTags: SceneMotifTag[];
  ctaShapeLanguage: SceneCtaShapeLanguage;
  badgeLikeTreatment: boolean;
  promoSurfaceColorHex?: string | null;
  promoTextColorHex?: string | null;
  summary: string;
}

export interface SceneBindingPlan {
  planId: string;
  runId: string;
  traceId: string;
  workflowVariant: "object_native_v1";
  selectedTemplateCode: string;
  selectedTemplateTitle: string;
  backgroundMode:
    | "spring_pattern"
    | "pastel_gradient"
    | "spring_photo"
    | "generated_solid";
  backgroundColorHex: string;
  secondaryBackgroundColorHex: string | null;
  primaryTextColorHex: string | null;
  secondaryTextColorHex: string | null;
  accentTextColorHex: string | null;
  inverseTextColorHex: string | null;
  promoSurfaceColorHex?: string | null;
  promoTextColorHex?: string | null;
  promoTextColorSource?: "reference" | "contrast_fallback" | null;
  ctaSurfaceColorHex: string | null;
  ctaTextColorHex: string | null;
  ctaShapeLanguage: SceneCtaShapeLanguage;
  preferredDecorationMode:
    | "graphic_cluster"
    | "ribbon_badge"
    | "photo_support"
    | "promo_multi_graphic";
  preferredAccentDensity: "minimal" | "medium";
  preferredBadgeProminence: "none" | "supporting" | "dominant";
  preferredCtaTreatment: "standard" | "badge_forward" | "photo_support" | "framed";
  motifTags: SceneMotifTag[];
  includeRibbon: boolean;
  includeFrame: boolean;
  summary: string;
}

export interface LayoutBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ConcreteLayoutAnchorZone =
  | "left_copy_column"
  | "center_copy_stack"
  | "bottom_center"
  | "framed_copy_column"
  | "right_graphic_cluster"
  | "center_hero_panel"
  | "top_badge_band"
  | "footer_strip";

export type ConcreteLayoutClusterZone =
  | "hero_panel"
  | "right_cluster"
  | "center_cluster"
  | "top_corner"
  | "bottom_strip"
  | "frame";

export interface ConcreteLayoutPlan {
  planId: string;
  runId: string;
  traceId: string;
  plannerMode: NormalizedIntent["plannerMode"];
  abstractLayoutFamily: AbstractLayoutFamily;
  resolvedSlotTopology: AbstractLayoutSlotTopology;
  primaryVisualFamily: "graphic" | "photo";
  resolvedLayoutMode: SelectionDecision["layoutMode"];
  slotAnchors: Partial<Record<CopyPlanSlotKey, ConcreteLayoutAnchorZone>>;
  resolvedSlotBounds: Partial<Record<ExecutionSlotKey, LayoutBounds>>;
  headlineEstimatedHeight: number;
  clusterZones: ConcreteLayoutClusterZone[];
  ctaContainerExpected: boolean;
  graphicRolePlacementHints: Array<{
    role: GraphicCompositionRole;
    zone: ConcreteLayoutClusterZone;
  }>;
  spacingIntent: AbstractLayoutDensity;
  summary: string;
}

export interface FreeformRenderableBlock {
  blockId: string;
  stage: "copy" | "polish";
  layerType: "shape" | "text" | "group" | "image";
  executionSlotKey: ExecutionSlotKey | null;
  role: string;
  variantKey: string;
  candidateId: string;
  bounds: LayoutBounds;
  textContent: string | null;
  fontRole?: "display" | "body" | null;
  fontSize?: number | null;
  textAlign?: "left" | "center" | "right" | null;
  sourceAssetId?: string | null;
  sourceSerial?: string | null;
  sourceCategory?: string | null;
  sourceUid?: string | null;
  sourceOriginUrl?: string | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  photoOrientation?: "portrait" | "landscape" | "square" | null;
  fitMode?: "cover";
  cropMode?: "centered_cover";
  renderPrimitive?: string | null;
  styleTokens?: Record<string, string | number | boolean | null>;
  clusterZone?: ConcreteLayoutClusterZone | null;
}

export interface FreeformLayoutPlan {
  planId: string;
  runId: string;
  traceId: string;
  workflowVariant: "object_native_v1";
  selectedTemplateCode: string;
  selectedTemplateTitle: string;
  compositionStatus: "stable" | "style_only";
  copyBlocks: FreeformRenderableBlock[];
  polishBlocks: FreeformRenderableBlock[];
  summary: string;
}

export interface StyleDowngradeVerdict {
  verdictId: string;
  runId: string;
  traceId: string;
  workflowVariant: "object_native_v1";
  applied: boolean;
  reason: string | null;
  summary: string;
}

export type ReferenceBlockKind =
  | "background"
  | "display_text"
  | "support_text"
  | "detail_text"
  | "promo_surface"
  | "action_surface"
  | "decor_cluster";

export interface ReferenceBlock {
  blockId: string;
  kind: ReferenceBlockKind;
  layerType: "text" | "shape" | "group" | "image";
  bounds: LayoutBounds;
  sourceObjectType: string;
  sourceObjectId: string | null;
  sourceText: string | null;
  fillColorHex: string | null;
  fontSize: number | null;
  prominence: number;
  clusterZone: ConcreteLayoutClusterZone | null;
  textAlign: "left" | "center" | "right" | null;
  sourceOriginUrl: string | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
}

export interface ReferenceBlockGraph {
  planId: string;
  runId: string;
  traceId: string;
  workflowVariant: "object_native_v1";
  selectedTemplateCode: string;
  selectedTemplateTitle: string;
  sourceCanvasWidth: number;
  sourceCanvasHeight: number;
  blocks: ReferenceBlock[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Projected Template Graph (SSOT: template-aware adaptive composition)
// ---------------------------------------------------------------------------

export type VisualWeight =
  | "dominant"
  | "secondary"
  | "tertiary"
  | "decorative"
  | "background";

export type SpatialZone =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "full";

export interface ProjectedObject {
  objectId: string;
  layerType: "text" | "shape" | "group" | "image";
  bounds: LayoutBounds;
  sourceText: string | null;
  fontSize: number | null;
  fillColorHex: string | null;
  secondaryFillColorHex?: string | null;
  fontFamily: string | null;
  fontWeight: number | null;
  textAlign: "left" | "center" | "right" | null;
  sourceOriginUrl: string | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  sourceCropX?: number | null;
  sourceCropY?: number | null;
  sourceObjectScaleX?: number | null;
  sourceObjectScaleY?: number | null;
  sourceImageScaleX?: number | null;
  sourceImageScaleY?: number | null;
  sourceAngle?: number | null;
  sourceOpacity?: number | null;
  sourceFlipX?: boolean | null;
  sourceFlipY?: boolean | null;
  sourceCornerRadius?: number | null;
  visualWeight: VisualWeight;
  zone: SpatialZone;
  prominence: number;
  backingSurfaceObjectId: string | null;
  backingSurfaceColorHex: string | null;
  backingSurfaceBounds: LayoutBounds | null;
  compositeHint: "button" | "badge" | null;
}

export interface ProjectedObjectGraph {
  graphId: string;
  runId: string;
  traceId: string;
  templateCode: string;
  templateTitle: string;
  canvasWidth: number;
  canvasHeight: number;
  objects: ProjectedObject[];
  objectCount: number;
  summary: string;
}

// ---------------------------------------------------------------------------
// Adaptive Composition Decision (SSOT: Layer 3 — LLM Decision)
// ---------------------------------------------------------------------------

export interface ElementDecision {
  objectId: string;
  operation: "retain" | "modify" | "remove";
  newText: string | null;
  carriesAtomIds: string[];
  reason: string;
}

export interface AddDecision {
  vocabularyId: string;
  text: string | null;
  placementZone: SpatialZone;
  carriesAtomIds: string[];
  reason: string;
}

export interface AdaptiveCompositionDecision {
  decisionId: string;
  runId: string;
  traceId: string;
  templateCode: string;
  projectedGraphId: string;
  elementDecisions: ElementDecision[];
  addDecisions: AddDecision[];
  compositionSummary: string;
}

// ---------------------------------------------------------------------------

export type MessageAtomKind =
  | "primary"
  | "support"
  | "offer"
  | "cta"
  | "detail"
  | "meta";

export interface MessageAtom {
  atomId: string;
  kind: MessageAtomKind;
  text: string;
  optional: boolean;
}

export interface MessageAtomPlan {
  planId: string;
  runId: string;
  traceId: string;
  workflowVariant: "object_native_v1";
  atoms: MessageAtom[];
  summary: string;
}

export interface BlockBindingAssignment {
  blockId: string;
  atomId: string | null;
  text: string | null;
  executionSlotKey: ExecutionSlotKey | null;
  role: string;
}

export interface BlockBindingPlan {
  planId: string;
  runId: string;
  traceId: string;
  workflowVariant: "object_native_v1";
  assignments: BlockBindingAssignment[];
  droppedAtomIds: string[];
  summary: string;
}

export interface EditableBlockPlan {
  planId: string;
  runId: string;
  traceId: string;
  workflowVariant: "object_native_v1";
  selectedTemplateCode: string;
  selectedTemplateTitle: string;
  compositionStatus: "stable" | "style_only";
  blocks: FreeformRenderableBlock[];
  summary: string;
}

export interface QualityEvalSummary {
  summaryId: string;
  runId: string;
  traceId: string;
  workflowVariant: "object_native_v1";
  selectedTemplateCode: string;
  selectedTemplateTitle: string;
  warnings: string[];
  retainedReferenceBlockCount: number;
  emittedBlockCount: number;
  summary: string;
}

export type ObjectNativeClusterFamily = "big_text" | "promo_band" | "cta";

export type ObjectNativeSemanticGateReason =
  | "none"
  | "missing_cluster_family"
  | "detection_miss"
  | "insufficient_content_bearing_clusters";

export interface ObjectNativeBindingCoverage {
  requiredAtomCount: number;
  boundRequiredAtomCount: number;
  optionalAtomCount: number;
  boundOptionalAtomCount: number;
  missingRequiredAtomKinds: Array<"primary" | "offer" | "cta">;
}

export interface ObjectNativeRenderabilityMetrics {
  evaluated: boolean;
  copyBlockCount: number;
  polishBlockCount: number;
  contentBoundsCount: number;
  offCanvasBlockCount: number;
  overlappingClusterPairCount: number;
  decorOcclusionCount: number;
  warnings: string[];
}

export interface ObjectNativeReadinessDiagnostics {
  missingClusterFamilies: ObjectNativeClusterFamily[];
  textBearingClusterCount: number;
  contentClusterCount: number;
  bindingCoverage: ObjectNativeBindingCoverage;
  renderabilityMetrics: ObjectNativeRenderabilityMetrics;
  semanticGateReason: ObjectNativeSemanticGateReason;
}

export type ObjectNativeFailureStage =
  | "none"
  | "precondition_failure"
  | "semantic_gate_failure"
  | "binding_failure"
  | "renderability_guard_failure";

export interface ObjectNativeAuditEntry {
  templateCode: string;
  templateTitle: string;
  rank: number;
  originalSelected: boolean;
  readiness: "stable_capable" | "fallback_only" | "unusable";
  failureStage: ObjectNativeFailureStage;
  compositionStatus: "stable" | "style_only" | "none";
  score: number;
  retainedReferenceBlockCount: number;
  emittedBlockCount: number;
  diagnostics: ObjectNativeReadinessDiagnostics;
  reason: string;
  warnings: string[];
}

export interface ObjectNativeReferenceAudit {
  auditId: string;
  runId: string;
  traceId: string;
  workflowVariant: "object_native_v1";
  previousSelectedTemplateCode: string | null;
  previousSelectedTemplateTitle: string | null;
  nextSelectedTemplateCode: string | null;
  nextSelectedTemplateTitle: string | null;
  entries: ObjectNativeAuditEntry[];
  summary: string;
}

export interface ObjectNativeCandidateSelection {
  selectionId: string;
  runId: string;
  traceId: string;
  workflowVariant: "object_native_v1";
  previousSelectedTemplateCode: string | null;
  previousSelectedTemplateTitle: string | null;
  nextSelectedTemplateCode: string | null;
  nextSelectedTemplateTitle: string | null;
  reselectionApplied: boolean;
  selectedReadiness: "stable_capable" | "fallback_only" | "unusable" | null;
  selectedFailureStage: ObjectNativeFailureStage;
  selectedDiagnostics: ObjectNativeReadinessDiagnostics | null;
  reason: string;
  summary: string;
}

export interface ObjectNativeRenderabilityReport {
  reportId: string;
  runId: string;
  traceId: string;
  workflowVariant: "object_native_v1";
  selectedTemplateCode: string | null;
  selectedTemplateTitle: string | null;
  passed: boolean;
  failureStage: ObjectNativeFailureStage;
  compositionStatus: "stable" | "style_only" | "none";
  selectedDiagnostics: ObjectNativeReadinessDiagnostics | null;
  reason: string;
  warnings: string[];
  summary: string;
}

export interface AssetExecutionEligibility {
  canRender: boolean;
  degraded: boolean;
  reasons: string[];
}

export interface AssetBackgroundBinding {
  candidateId: string;
  sourceKind: "generated_solid" | "catalog_background";
  sourceAssetId: string | null;
  sourceSerial: string | null;
  sourceCategory: string | null;
  colorHex: string;
  backgroundMode: SelectionDecision["backgroundMode"];
}

export type RepresentativeReadinessStatus =
  | "target_met"
  | "degraded"
  | "failed"
  | "not_applicable";

export interface RepresentativeReadinessSummary {
  path: "generic_promo_phase6";
  overallStatus: RepresentativeReadinessStatus;
  background: {
    status: "not_applicable";
    mode: "generated_solid";
    colorHex: string;
    reasonCodes: string[];
  };
  graphic: {
    status: "target_met" | "degraded" | "failed";
    targetRequired: 2;
    minimumRequired: 1;
    materializedRealCount: number;
    reasonCodes: string[];
  };
  font: {
    status: "target_met" | "degraded" | "failed";
    targetRequired: "display_and_body";
    minimumRequired: 1;
    displayRealSelected: boolean;
    bodyRealSelected: boolean;
    realSelectionCount: number;
    reasonCodes: string[];
  };
}

export interface GraphicRoleBinding {
  role: GraphicCompositionRole;
  candidateId: string;
  sourceAssetId: string | null;
  sourceSerial: string | null;
  sourceCategory: string | null;
  variantKey: string;
  decorationMode: GraphicCompositionEntry["decorationMode"];
  required: boolean;
  zonePreference: ConcreteLayoutClusterZone;
}

export interface PhotoBinding {
  candidateId: string;
  sourceAssetId: string | null;
  sourceSerial: string | null;
  sourceCategory: string | null;
  sourceUid: string | null;
  sourceOriginUrl: string | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  orientation: SelectionDecision["topPhotoOrientation"];
  fitMode: "cover";
  cropMode: "centered_cover";
  required: boolean;
}

export interface AssetPlan {
  planId: string;
  runId: string;
  traceId: string;
  plannerMode: NormalizedIntent["plannerMode"];
  primaryVisualFamily: "graphic" | "photo";
  backgroundBinding: AssetBackgroundBinding;
  graphicRoleBindings: GraphicRoleBinding[];
  photoBinding: PhotoBinding | null;
  fallbackPolicy: {
    missingOptionalGraphicRoles: "drop";
    missingCtaContainer: "fallback_cta_pill";
    unavailablePhotoPrimary: "demote_to_graphic_primary";
  };
  executionEligibility: AssetExecutionEligibility;
  summary: string;
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
  representativeReadiness: RepresentativeReadinessSummary;
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
  matchedTemplateFontFamily: string | null;
  appliedTone: SceneTypographyTone | null;
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

export interface CompositionBrief {
  briefId: string;
  runId: string;
  traceId: string;
  canvasPreset: NormalizedIntent["canvasPreset"];
  currentCanvasWidth: number;
  currentCanvasHeight: number;
  requestedVariantCount: 3;
  subjectBinding: NormalizedIntent["subjectBinding"];
  offerIntent: NormalizedIntent["offerIntent"];
  layoutIntent: NormalizedIntent["layoutIntent"];
  primaryVisualPolicy: NormalizedIntent["primaryVisualPolicy"];
  preferredLayoutModes: SelectionDecision["layoutMode"][];
  summary: string;
}

export type CompositionVariantCopyDensity = "sparse" | "balanced" | "dense";
export type CompositionVariantHeadlineEmphasis = "restrained" | "dominant";
export type CompositionVariantCtaWeight = "subtle" | "standard" | "strong";
export type CompositionVariantCopyVisualRatio =
  | "copy_heavy"
  | "balanced"
  | "visual_heavy";
export type CompositionVariantNegativeSpaceBias =
  | "tight"
  | "balanced"
  | "airy";
export type CompositionVariantBadgeProminence =
  | "none"
  | "supporting"
  | "dominant";
export type CompositionVariantCopyExpressionProfile =
  | "headline_first"
  | "offer_first"
  | "cta_first";

export interface CompositionVariant {
  variantId: string;
  familyKey: SelectionDecision["layoutMode"];
  layoutMode: SelectionDecision["layoutMode"];
  variantSignature: string;
  layoutCandidateId: string;
  backgroundCandidateId: string;
  decorationCandidateId: string | null;
  photoCandidateId: string | null;
  familyRank: number;
  familyVariantRank: number;
  layoutFitScore: number;
  spacingIntent: AbstractLayoutDensity;
  accentDensity: GraphicCompositionSet["density"];
  ctaTreatment: "standard" | "badge_forward" | "photo_support" | "framed";
  copyDensity: CompositionVariantCopyDensity;
  headlineEmphasis: CompositionVariantHeadlineEmphasis;
  ctaWeight: CompositionVariantCtaWeight;
  copyVisualRatio: CompositionVariantCopyVisualRatio;
  negativeSpaceBias: CompositionVariantNegativeSpaceBias;
  badgeProminence: CompositionVariantBadgeProminence;
  copyExpressionProfile: CompositionVariantCopyExpressionProfile;
  photoMode: SelectionDecision["photoBranchMode"];
  executionStrategy: SelectionDecision["executionStrategy"];
  validation: {
    status: "valid" | "invalid";
    reasons: string[];
  };
  summary: string;
}

export interface CompositionVariantSet {
  setId: string;
  runId: string;
  traceId: string;
  briefId: string;
  variants: CompositionVariant[];
  summary: string;
}

export interface CompositionVariantScore {
  variantId: string;
  familyKey: SelectionDecision["layoutMode"];
  variantSignature: string;
  totalScore: number;
  briefAlignmentScore: number;
  canvasFitScore: number;
  executionSafetyScore: number;
  visualBalanceScore: number;
  copyRhythmFitScore: number;
  intraFamilyNoveltyScore: number;
  summary: string;
}

export interface CompositionRanking {
  rankingId: string;
  runId: string;
  traceId: string;
  winnerVariantId: string;
  winnerFamilyKey: SelectionDecision["layoutMode"];
  scores: CompositionVariantScore[];
  rankingCriteria: Array<
    | "brief_alignment"
    | "canvas_fit"
    | "execution_safety"
    | "visual_balance"
    | "copy_rhythm_fit"
    | "intra_family_novelty"
  >;
  summary: string;
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
    sourceMode: "generated_solid";
    colorHex: string;
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
  selectedBackgroundColorHex: string;
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
  backgroundMode:
    | "spring_pattern"
    | "pastel_gradient"
    | "spring_photo"
    | "generated_solid";
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
  | "graphic_role_imbalance"
  | "copy_slot_missing"
  | "copy_subject_leakage"
  | "copy_cta_subject_mismatch"
  | "copy_summary_intent_mismatch"
  | "headline_overflow_risk"
  | "cta_missing_or_weak"
  | "copy_hierarchy_weak"
  | "abstract_layout_intent_mismatch"
  | "abstract_layout_subject_leakage"
  | "concrete_layout_slot_conflict";

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
  | "composition_balance"
  | "copy_quality"
  | "layout_structure";

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
  | "execution_safety"
  | "copy_quality"
  | "layout_structure";
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

export interface StageAckRecordCommand {
  op: "createLayer" | "updateLayer" | "deleteLayer" | "saveTemplate";
  executionSlotKey: ExecutionSlotKey | null;
  clientLayerKey: string | null;
  role: string | null;
  saveEvidence?: {
    code: string;
    serial: number;
    modified: string;
    version: string;
  } | null;
  saveReceipt?: {
    saveReceiptId: string;
    outputTemplateCode: string;
    savedRevision: number;
    savedAt: string;
    reason: string;
  } | null;
  targetLayerId: string | null;
  proposedBounds: LayoutBounds | null;
}

export interface StageAckRecord {
  stageLabel: string;
  mutationId: string;
  seq: number | null;
  status: WaitMutationAckResponse["status"];
  resultingRevision: number | null;
  resolvedLayerIds: Record<string, string> | null;
  commands: StageAckRecordCommand[];
}

export interface ExecutionSceneCopyLayerBinding {
  executionSlotKey: CopyPlanSlotKey;
  identityObserved: boolean;
  layerId: string | null;
  text: string | null;
  anchor: ConcreteLayoutAnchorZone | null;
  plannedBounds: LayoutBounds | null;
  resolvedBounds: LayoutBounds | null;
}

export interface ExecutionSceneGraphicLayerBinding {
  role: GraphicCompositionRole;
  layerId: string | null;
  zone: ConcreteLayoutClusterZone | null;
  sourceAssetId: string | null;
  sourceSerial: string | null;
}

export interface ExecutionScenePhotoLayerBinding {
  executionSlotKey: "hero_image";
  layerId: string | null;
  sourceAssetId: string | null;
  sourceSerial: string | null;
  plannedBounds: LayoutBounds | null;
  resolvedBounds: LayoutBounds | null;
}

export interface ExecutionSceneSummary {
  summaryId: string;
  runId: string;
  traceId: string;
  attemptSeq: number;
  finalRevision: number | null;
  stageResults: StageAckRecord[];
  copyLayerBindings: ExecutionSceneCopyLayerBinding[];
  graphicLayerBindings: ExecutionSceneGraphicLayerBinding[];
  photoLayerBinding: ExecutionScenePhotoLayerBinding | null;
  ctaContainerResolved: boolean;
  summary: string;
}

export type JudgePlanRecommendation = "keep" | "refine" | "warn_only";
export type JudgePatchScope =
  | "copy_text"
  | "slot_anchor"
  | "cluster_zone"
  | "spacing"
  | "cta_container";

export type JudgePlanIssueCode =
  | "copy_stack_spacing_weak"
  | "cta_container_missing_after_execution"
  | "execution_slot_identity_missing"
  | "graphic_role_zone_mismatch"
  | "slot_materialization_missing"
  | "topology_bounds_conflict"
  | "footer_zone_mismatch"
  | "badge_zone_mismatch"
  | "preflight_copy_cta_subject_mismatch"
  | "preflight_cta_missing_or_weak"
  | "preflight_headline_overflow_risk"
  | "preflight_concrete_layout_slot_conflict"
  | "preflight_cta_copy_overlap_risk"
  | "preflight_excessive_empty_space";

export interface JudgePlanIssue {
  code: JudgePlanIssueCode;
  severity: "warn" | "error";
  message: string;
  patchable: boolean;
  suggestedPatchScopes: JudgePatchScope[];
}

export interface JudgePlan {
  judgePlanId: string;
  runId: string;
  traceId: string;
  refineAttempt: 0 | 1;
  recommendation: JudgePlanRecommendation;
  patchable: boolean;
  issues: JudgePlanIssue[];
  allowedPatchScopes: JudgePatchScope[];
  summary: string;
}

export type RefinementPatchOperation =
  | {
      kind: "rewrite_copy_slot_text";
      executionSlotKey: CopyPlanSlotKey;
      text: string;
    }
  | {
      kind: "move_copy_slot_anchor";
      executionSlotKey: CopyPlanSlotKey;
      anchor: ConcreteLayoutAnchorZone;
    }
  | {
      kind: "set_spacing_intent";
      spacingIntent: AbstractLayoutDensity;
    };

export interface RefinementPatchPlan {
  patchPlanId: string;
  runId: string;
  traceId: string;
  operations: RefinementPatchOperation[];
  summary: string;
}

export interface RefineDecision {
  decisionId: string;
  runId: string;
  traceId: string;
  decision: "skip" | "patch";
  reason: string;
  refineAttempt: 0 | 1;
  targetRevision: number | null;
  patchPlan: RefinementPatchPlan | null;
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
  proposal: MutationProposalDraft | null;
  refinedPlan: ExecutablePlan;
  refinedPlanRef: string | null;
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
  intent: CanonicalDesignBrief;
  semanticBriefDraft?: SemanticBriefDraftArtifact;
  intentNormalizationReport?: IntentNormalizationReport;
  templatePriorBundle?: TemplatePriorBundle;
  sceneRolePlan?: SceneRolePlan;
  sceneLayoutPlan?: SceneLayoutPlan;
  sceneStylePlan?: SceneStylePlan;
  sceneBindingPlan?: SceneBindingPlan;
  compositionBrief?: CompositionBrief;
  compositionVariantSet?: CompositionVariantSet;
  compositionRanking?: CompositionRanking;
  copyPlan?: CopyPlan;
  copyPlanNormalizationReport?: CopyPlanNormalizationReport;
  abstractLayoutPlan?: AbstractLayoutPlan;
  abstractLayoutPlanNormalizationReport?: AbstractLayoutPlanNormalizationReport;
  assetPlan?: AssetPlan;
  concreteLayoutPlan?: ConcreteLayoutPlan;
  templatePriorSummary?: TemplatePriorSummary;
  searchProfile?: SearchProfileArtifact;
  candidateSets?: TemplateCandidateBundle;
  sourceSearchSummary?: SourceSearchSummary;
  retrievalStage?: RetrievalStageResult;
  selectionDecision?: SelectionDecision;
  typographyDecision?: TypographyDecision;
  ruleJudgeVerdict?: RuleJudgeVerdict;
  executionSceneSummary?: ExecutionSceneSummary;
  judgePlan?: JudgePlan;
  refineDecision?: RefineDecision;
  plan?: ExecutablePlan;
  emittedMutationIds: string[];
  finalizeDraft: FinalizeRunDraft;
  artifactRefs: {
    canonicalDesignBriefRef: string;
    semanticBriefDraftRef?: string;
    briefCompilationReportRef?: string;
    compositionBriefRef?: string;
    compositionVariantSetRef?: string;
    compositionRankingRef?: string;
    copyPlanRef?: string;
    copyPlanNormalizationReportRef?: string;
    abstractLayoutPlanRef?: string;
    abstractLayoutPlanNormalizationReportRef?: string;
    assetPlanRef?: string;
    concreteLayoutPlanRef?: string;
    templatePriorSummaryRef?: string;
    templatePriorBundleRef?: string;
    sceneRolePlanRef?: string;
    sceneLayoutPlanRef?: string;
    sceneStylePlanRef?: string;
    sceneBindingPlanRef?: string;
    searchProfileRef?: string;
    executablePlanRef?: string;
    candidateSetRef?: string;
    sourceSearchSummaryRef?: string;
    retrievalStageRef?: string;
    selectionDecisionRef?: string;
    typographyDecisionRef?: string;
    ruleJudgeVerdictRef?: string;
    executionSceneSummaryRef?: string;
    judgePlanRef?: string;
    refineDecisionRef?: string;
  };
}

export interface CopyAndAbstractLayoutPlanningDraft {
  copyPlanDraft: TemplateCopyPlanDraft;
  abstractLayoutDraft: TemplateAbstractLayoutDraft;
}
