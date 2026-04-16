import { createRequestId } from "@tooldi/agent-domain";

type TopologyCompletionContract = {
  topologyId: string;
  requiredCapabilityIds: string[];
  minimumEditableTextCapabilityCount: number;
  requiresActionCapability: boolean;
  requiresMediaCapability: boolean;
};

import type {
  CopyPlan,
  EditableBlockPlan,
  FreeformLayoutPlan,
  FreeformRenderableBlock,
  HydratedPlanningInput,
  LayoutBounds,
  MessageAtom,
  MessageAtomPlan,
  ObjectNativeFailureStage,
  QualityEvalSummary,
  ReferenceBlock,
  ReferenceBlockGraph,
  SceneBindingPlan,
  SceneStylePlan,
  StyleDowngradeVerdict,
  TemplatePriorBundle,
  TemplatePriorCandidate,
  TopologyBindingAssignment,
  TopologyBindingPlan,
  TopologyCapabilityId,
  TopologyCompletionReport,
  TopologyDefinition,
  TopologyExecutionPlan,
  TopologyId,
  TopologyMatchEntry,
  TopologyMatchReport,
  TopologyMatchScore,
  TopologySelection,
} from "../types.js";
import { deriveWorkflowVariant } from "./planningContext.js";
import {
  buildMessageAtomPlan,
  buildReferenceResetPath,
  buildTextBlock,
  extractReferenceBlockGraph,
  fitBandBounds,
  fitPromoBandContent,
  isExecutionSafeScaledBounds,
  overlapRatio,
  readFirstParsedPage,
  scaleBounds,
} from "./buildReferenceResetPath.js";

const TOPOLOGY_REGISTRY: TopologyDefinition[] = [
  {
    topologyId: "band_overlay_promo",
    summary:
      "Promo band-led composition with a dominant focal message and optional action/fineprint clusters.",
    requiredCapabilityIds: ["focal_text", "accent_band"],
    minimumEditableTextCapabilityCount: 1,
    requiresActionCapability: false,
    requiresMediaCapability: false,
  },
  {
    topologyId: "centered_message_stack",
    summary:
      "Centered copy stack with a focal message and one supporting message; CTA is optional.",
    requiredCapabilityIds: ["focal_text", "supporting_text"],
    minimumEditableTextCapabilityCount: 2,
    requiresActionCapability: false,
    requiresMediaCapability: false,
  },
];

interface BuildTopologyPathResult {
  topologyMatchReport: TopologyMatchReport;
  topologySelection: TopologySelection;
  topologyBindingPlan: TopologyBindingPlan | null;
  topologyExecutionPlan: TopologyExecutionPlan | null;
  topologyCompletionReport: TopologyCompletionReport;
  selectedTopologyId: TopologyId | null;
  topologyCompletionContract: TopologyCompletionContract | null;
  referenceBlockGraph: ReferenceBlockGraph | null;
  messageAtomPlan: MessageAtomPlan | null;
  editableBlockPlan: EditableBlockPlan | null;
  freeformLayoutPlan: FreeformLayoutPlan | null;
  qualityEvalSummary: QualityEvalSummary | null;
  styleDowngradeVerdict: StyleDowngradeVerdict | null;
}

interface CandidateEvaluation {
  candidate: TemplatePriorCandidate;
  matchEntry: TopologyMatchEntry;
  selectedEvaluation: TopologyEvaluation | null;
  result: Omit<
    BuildTopologyPathResult,
    | "topologyMatchReport"
    | "topologySelection"
    | "topologyBindingPlan"
    | "topologyExecutionPlan"
    | "topologyCompletionReport"
    | "selectedTopologyId"
    | "topologyCompletionContract"
  > & {
    topologyBindingPlan: TopologyBindingPlan | null;
    topologyExecutionPlan: TopologyExecutionPlan | null;
    topologyCompletionReport: TopologyCompletionReport;
    selectedTopologyId: TopologyId | null;
    topologyCompletionContract: TopologyCompletionContract | null;
  };
}

interface TopologyEvaluation {
  topologyId: TopologyId;
  definition: TopologyDefinition;
  selectedReadiness: "stable_capable" | "fallback_only" | "unusable";
  failureStage: ObjectNativeFailureStage;
  requiredCapabilityCoverage: number;
  textBearingCapabilityCount: number;
  matchedCapabilityIds: TopologyCapabilityId[];
  missingRequiredCapabilityIds: TopologyCapabilityId[];
  renderabilityPrecheckPassed: boolean;
  score: number;
  reason: string;
  referenceBlockGraph: ReferenceBlockGraph | null;
  messageAtomPlan: MessageAtomPlan | null;
  topologyBindingPlan: TopologyBindingPlan | null;
  topologyExecutionPlan: TopologyExecutionPlan | null;
  topologyCompletionReport: TopologyCompletionReport;
  editableBlockPlan: EditableBlockPlan | null;
  freeformLayoutPlan: FreeformLayoutPlan | null;
  qualityEvalSummary: QualityEvalSummary | null;
  styleDowngradeVerdict: StyleDowngradeVerdict | null;
  warnings: string[];
}

export function buildTopologyPath(
  input: HydratedPlanningInput,
  templatePriorBundle: TemplatePriorBundle | null,
  copyPlan: CopyPlan | null,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
): BuildTopologyPathResult {
  if (deriveWorkflowVariant(input) !== "topology_v1") {
    return buildEmptyTopologyResult(input);
  }

  const evaluations = templatePriorBundle
    ? templatePriorBundle.candidates.map((candidate) =>
        evaluateCandidate(
          input,
          templatePriorBundle,
          candidate,
          copyPlan,
          sceneStylePlan,
          sceneBindingPlan,
        ),
      )
    : [];
  const winningEvaluation = selectWinningEvaluation(
    evaluations,
    templatePriorBundle?.selectedTemplateCode ?? null,
  );
  const transformedExecution = winningEvaluation?.result ?? {
    selectedTopologyId: null,
    topologyCompletionContract: null,
    topologyBindingPlan: null,
    topologyExecutionPlan: null,
    topologyCompletionReport: buildEmptyTopologyCompletionReport(input),
    referenceBlockGraph: null,
    messageAtomPlan: null,
    editableBlockPlan: null,
    freeformLayoutPlan: null,
    qualityEvalSummary: null,
    styleDowngradeVerdict: null,
  };

  return {
    topologyMatchReport: buildTopologyMatchReport(
      input,
      templatePriorBundle,
      winningEvaluation,
      evaluations,
    ),
    topologySelection: buildTopologySelection(
      input,
      templatePriorBundle,
      winningEvaluation,
    ),
    ...transformedExecution,
  };
}

function buildEmptyTopologyResult(
  input: HydratedPlanningInput,
): BuildTopologyPathResult {
  return {
    topologyMatchReport: {
      reportId: createRequestId(),
      runId: input.job.runId,
      traceId: input.job.traceId,
      workflowVariant: "topology_v1",
      previousSelectedTemplateCode: null,
      previousSelectedTemplateTitle: null,
      nextSelectedTemplateCode: null,
      nextSelectedTemplateTitle: null,
      selectedTopologyId: null,
      entries: [],
      summary: "Topology path was not activated because the workflow variant did not match.",
    },
    topologySelection: {
      selectionId: createRequestId(),
      runId: input.job.runId,
      traceId: input.job.traceId,
      workflowVariant: "topology_v1",
      previousSelectedTemplateCode: null,
      previousSelectedTemplateTitle: null,
      nextSelectedTemplateCode: null,
      nextSelectedTemplateTitle: null,
      selectedTopologyId: null,
      reselectionApplied: false,
      selectedReadiness: null,
      failureStage: "precondition_failure",
      reason: "workflow_variant_mismatch",
      summary: "Topology selection was skipped.",
    },
    topologyBindingPlan: null,
    topologyExecutionPlan: null,
    topologyCompletionReport: buildEmptyTopologyCompletionReport(input),
    selectedTopologyId: null,
    topologyCompletionContract: null,
    referenceBlockGraph: null,
    messageAtomPlan: null,
    editableBlockPlan: null,
    freeformLayoutPlan: null,
    qualityEvalSummary: null,
    styleDowngradeVerdict: null,
  };
}

function evaluateCandidate(
  input: HydratedPlanningInput,
  templatePriorBundle: TemplatePriorBundle,
  candidate: TemplatePriorCandidate,
  copyPlan: CopyPlan | null,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
): CandidateEvaluation {
  const messageAtomPlan = buildTopologyMessageAtomPlan(
    input.request.userInput.prompt,
    copyPlan,
    input.job.runId,
    input.job.traceId,
  );
  const page = readFirstParsedPage(candidate.fetchedDocument ?? null);

  if (!messageAtomPlan || !page) {
    const emptyMatches = TOPOLOGY_REGISTRY.map((definition) =>
      buildTopologyMatchScore(definition, 0, false, 0, [], definition.requiredCapabilityIds, 0, "Reference payload or message atoms were incomplete."),
    );
    const completionReport = buildEmptyTopologyCompletionReport(
      input,
      TOPOLOGY_REGISTRY[0]?.topologyId ?? null,
    );
    return {
      candidate,
      matchEntry: {
        templateCode: candidate.templateCode,
        templateTitle: candidate.title,
        rank: candidate.rank,
        originalSelected:
          templatePriorBundle.selectedTemplateCode === candidate.templateCode,
        topologyMatches: emptyMatches,
      },
      selectedEvaluation: null,
      result: {
        selectedTopologyId: null,
        topologyCompletionContract: null,
        topologyBindingPlan: null,
        topologyExecutionPlan: null,
        topologyCompletionReport: completionReport,
        referenceBlockGraph: null,
        messageAtomPlan,
        editableBlockPlan: null,
        freeformLayoutPlan: null,
        qualityEvalSummary: null,
        styleDowngradeVerdict: null,
      },
    };
  }

  const extractionAnalysis = extractReferenceBlockGraph(
    input.job.runId,
    input.job.traceId,
    candidate.templateCode,
    candidate.title,
    page,
  );
  const referenceBlockGraph = transformReferenceBlockGraphWorkflowVariant(
    extractionAnalysis.referenceBlockGraph,
  );
  const topologyEvaluations = TOPOLOGY_REGISTRY.map((definition) =>
    evaluateTopology(
      input,
      candidate,
      referenceBlockGraph,
      messageAtomPlan,
      definition,
      sceneStylePlan,
      sceneBindingPlan,
      extractionAnalysis.warnings,
    ),
  );
  const selectedEvaluation = chooseBestTopologyEvaluation(topologyEvaluations);
  const transformedExecution =
    selectedEvaluation?.selectedReadiness === "stable_capable"
      ? selectedEvaluation
      : buildTopologyFallbackExecution(
          input,
          templatePriorBundle,
          candidate,
          copyPlan,
          sceneStylePlan,
          sceneBindingPlan,
          selectedEvaluation,
        );

  return {
    candidate,
    matchEntry: {
      templateCode: candidate.templateCode,
      templateTitle: candidate.title,
      rank: candidate.rank,
      originalSelected:
        templatePriorBundle.selectedTemplateCode === candidate.templateCode,
      topologyMatches: topologyEvaluations.map((evaluation) =>
        buildTopologyMatchScore(
          evaluation.definition,
          evaluation.requiredCapabilityCoverage,
          evaluation.renderabilityPrecheckPassed,
          evaluation.textBearingCapabilityCount,
          evaluation.matchedCapabilityIds,
          evaluation.missingRequiredCapabilityIds,
          evaluation.score,
          evaluation.reason,
        ),
      ),
    },
    selectedEvaluation,
    result: {
      selectedTopologyId: selectedEvaluation?.topologyId ?? null,
      topologyCompletionContract: selectedEvaluation
        ? toTopologyCompletionContract(selectedEvaluation.definition)
        : null,
      topologyBindingPlan: selectedEvaluation?.topologyBindingPlan ?? null,
      topologyExecutionPlan: selectedEvaluation?.topologyExecutionPlan ?? null,
      topologyCompletionReport:
        selectedEvaluation?.topologyCompletionReport ??
        buildEmptyTopologyCompletionReport(input),
      referenceBlockGraph: transformedExecution.referenceBlockGraph,
      messageAtomPlan: transformedExecution.messageAtomPlan,
      editableBlockPlan: transformedExecution.editableBlockPlan,
      freeformLayoutPlan: transformedExecution.freeformLayoutPlan,
      qualityEvalSummary: transformedExecution.qualityEvalSummary,
      styleDowngradeVerdict: transformedExecution.styleDowngradeVerdict,
    },
  };
}

function evaluateTopology(
  input: HydratedPlanningInput,
  candidate: TemplatePriorCandidate,
  referenceBlockGraph: ReferenceBlockGraph,
  messageAtomPlan: MessageAtomPlan,
  definition: TopologyDefinition,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
  extractionWarnings: string[],
): TopologyEvaluation {
  const presentCapabilityIds = collectPresentCapabilityIds(
    referenceBlockGraph,
    definition.topologyId,
  );
  const missingRequiredCapabilityIds = definition.requiredCapabilityIds.filter(
    (capabilityId) => !presentCapabilityIds.includes(capabilityId),
  );
  const requiredCapabilityCoverage =
    definition.requiredCapabilityIds.length === 0
      ? 1
      : (definition.requiredCapabilityIds.length - missingRequiredCapabilityIds.length) /
        definition.requiredCapabilityIds.length;

  if (missingRequiredCapabilityIds.length > 0) {
    return {
      topologyId: definition.topologyId,
      definition,
      selectedReadiness: "fallback_only",
      failureStage: "semantic_gate_failure",
      requiredCapabilityCoverage,
      textBearingCapabilityCount: 0,
      matchedCapabilityIds: presentCapabilityIds,
      missingRequiredCapabilityIds,
      renderabilityPrecheckPassed: false,
      score: buildTopologyEvaluationScore(
        requiredCapabilityCoverage,
        false,
        0,
        candidate.rank,
      ),
      reason: `Selected reference is missing required topology capabilities: ${missingRequiredCapabilityIds.join(", ")}`,
      referenceBlockGraph,
      messageAtomPlan,
      topologyBindingPlan: null,
      topologyExecutionPlan: null,
      topologyCompletionReport: buildEmptyTopologyCompletionReport(
        input,
        definition.topologyId,
        candidate.templateCode,
        candidate.title,
        toTopologyCompletionContract(definition),
      ),
      editableBlockPlan: null,
      freeformLayoutPlan: null,
      qualityEvalSummary: null,
      styleDowngradeVerdict: null,
      warnings: uniqueStrings([
        ...extractionWarnings,
        ...missingRequiredCapabilityIds.map(
          (capabilityId) => `topology_missing_capability:${capabilityId}`,
        ),
      ]),
    };
  }

  const topologyBindingPlan = buildTopologyBindingPlan(
    input.job.runId,
    input.job.traceId,
    referenceBlockGraph,
    messageAtomPlan,
    definition,
  );
  if (topologyBindingPlan.requiredBindingFailures.length > 0) {
    return {
      topologyId: definition.topologyId,
      definition,
      selectedReadiness: "fallback_only",
      failureStage: "binding_failure",
      requiredCapabilityCoverage,
      textBearingCapabilityCount: 0,
      matchedCapabilityIds: presentCapabilityIds,
      missingRequiredCapabilityIds: [],
      renderabilityPrecheckPassed: false,
      score: buildTopologyEvaluationScore(
        requiredCapabilityCoverage,
        false,
        0,
        candidate.rank,
      ),
      reason: `Required topology bindings could not be materialized: ${topologyBindingPlan.requiredBindingFailures.join(", ")}`,
      referenceBlockGraph,
      messageAtomPlan,
      topologyBindingPlan: topologyBindingPlan.plan,
      topologyExecutionPlan: null,
      topologyCompletionReport: buildEmptyTopologyCompletionReport(
        input,
        definition.topologyId,
        candidate.templateCode,
        candidate.title,
        toTopologyCompletionContract(definition),
      ),
      editableBlockPlan: null,
      freeformLayoutPlan: null,
      qualityEvalSummary: null,
      styleDowngradeVerdict: null,
      warnings: uniqueStrings([
        ...extractionWarnings,
        ...topologyBindingPlan.requiredBindingFailures.map(
          (capabilityId) => `topology_binding_missing:${capabilityId}`,
        ),
      ]),
    };
  }

  const topologyExecutionPlan = buildTopologyExecutionPlan(
    input,
    referenceBlockGraph,
    topologyBindingPlan.plan,
    definition,
    sceneStylePlan,
    sceneBindingPlan,
  );
  const editableBlockPlan = {
    planId: topologyExecutionPlan.planId,
    runId: topologyExecutionPlan.runId,
    traceId: topologyExecutionPlan.traceId,
    workflowVariant: "topology_v1" as const,
    selectedTemplateCode: topologyExecutionPlan.selectedTemplateCode,
    selectedTemplateTitle: topologyExecutionPlan.selectedTemplateTitle,
    compositionStatus: topologyExecutionPlan.compositionStatus,
    blocks: topologyExecutionPlan.blocks,
    summary: topologyExecutionPlan.summary,
  } satisfies EditableBlockPlan;
  const freeformLayoutPlan = buildTopologyFreeformLayoutPlan(
    input,
    referenceBlockGraph,
    topologyExecutionPlan,
  );
  const topologyCompletionContract = toTopologyCompletionContract(definition);
  const topologyCompletionReport = buildTopologyCompletionReport(
    input,
    candidate,
    definition.topologyId,
    topologyCompletionContract,
    freeformLayoutPlan,
  );
  const renderability = validateTopologyRenderablePlan(
    freeformLayoutPlan,
    input.request.editorContext.canvasWidth,
    input.request.editorContext.canvasHeight,
  );
  const warnings = uniqueStrings([...extractionWarnings, ...renderability.warnings]);
  const qualityEvalSummary = buildTopologyQualityEvalSummary(
    input,
    referenceBlockGraph,
    freeformLayoutPlan,
    warnings,
    renderability.passed && topologyCompletionReport.passed
      ? `Topology ${definition.topologyId} produced a stable editable composition.`
      : renderability.passed
        ? topologyCompletionReport.reason
        : renderability.reason,
  );
  const textBearingCapabilityCount = collectTextBearingCapabilityIds(
    freeformLayoutPlan,
  ).length;
  const stableCapable = renderability.passed && topologyCompletionReport.passed;

  return {
    topologyId: definition.topologyId,
    definition,
    selectedReadiness: stableCapable ? "stable_capable" : "fallback_only",
    failureStage: stableCapable ? "none" : "renderability_guard_failure",
    requiredCapabilityCoverage,
    textBearingCapabilityCount,
    matchedCapabilityIds: topologyCompletionReport.presentCapabilityIds,
    missingRequiredCapabilityIds: [],
    renderabilityPrecheckPassed: stableCapable,
    score: buildTopologyEvaluationScore(
      requiredCapabilityCoverage,
      stableCapable,
      textBearingCapabilityCount,
      candidate.rank,
    ),
    reason: stableCapable
      ? `Topology ${definition.topologyId} retained required capabilities and passed renderability.`
      : renderability.passed
        ? topologyCompletionReport.reason
        : renderability.reason,
    referenceBlockGraph,
    messageAtomPlan,
    topologyBindingPlan: topologyBindingPlan.plan,
    topologyExecutionPlan,
    topologyCompletionReport,
    editableBlockPlan,
    freeformLayoutPlan,
    qualityEvalSummary,
    styleDowngradeVerdict: createTopologyDowngradeVerdict(
      input.job.runId,
      input.job.traceId,
      false,
      null,
    ),
    warnings,
  };
}

function buildTopologyMessageAtomPlan(
  prompt: string,
  copyPlan: CopyPlan | null,
  runId: string,
  traceId: string,
): MessageAtomPlan | null {
  const messageAtomPlan = buildMessageAtomPlan(prompt, copyPlan, runId, traceId);
  return messageAtomPlan
    ? {
        ...messageAtomPlan,
        workflowVariant: "topology_v1",
        summary:
          "Topology message atoms remain loose semantic hints and are later bound into a selected topology family.",
      }
    : null;
}

function transformReferenceBlockGraphWorkflowVariant(
  graph: ReferenceBlockGraph,
): ReferenceBlockGraph {
  return {
    ...graph,
    workflowVariant: "topology_v1",
    summary:
      "Topology reference graph preserves extracted editor-native blocks for topology matching and binding.",
  };
}

function buildTopologyBindingPlan(
  runId: string,
  traceId: string,
  graph: ReferenceBlockGraph,
  atomPlan: MessageAtomPlan,
  definition: TopologyDefinition,
): {
  plan: TopologyBindingPlan;
  requiredBindingFailures: TopologyCapabilityId[];
} {
  const assignments: TopologyBindingAssignment[] = [];
  const usedAtomIds = new Set<string>();
  const usedBlockIds = new Set<string>();
  const requiredBindingFailures: TopologyCapabilityId[] = [];
  const atomsByKind = new Map(
    atomPlan.atoms.map((atom) => [atom.atomId, atom] as const),
  );
  const findFirstBlock = (kind: ReferenceBlock["kind"]) =>
    graph.blocks.find((block) => block.kind === kind) ?? null;
  const pullAtom = (kinds: MessageAtom["kind"][]) => {
    for (const kind of kinds) {
      const atom = atomPlan.atoms.find(
        (candidate) => candidate.kind === kind && !usedAtomIds.has(candidate.atomId),
      );
      if (atom) {
        usedAtomIds.add(atom.atomId);
        return atom;
      }
    }
    return null;
  };
  const bind = (
    block: ReferenceBlock | null,
    atom: MessageAtom | null,
    executionSlotKey: TopologyBindingAssignment["executionSlotKey"],
    topologyCapabilityId: TopologyCapabilityId,
    role: string,
    required: boolean,
  ) => {
    if (!atom) {
      if (required) {
        requiredBindingFailures.push(topologyCapabilityId);
      }
      return;
    }
    if (!block) {
      if (required) {
        requiredBindingFailures.push(topologyCapabilityId);
      }
      return;
    }
    if (usedBlockIds.has(block.blockId)) {
      if (required) {
        requiredBindingFailures.push(topologyCapabilityId);
      }
      return;
    }

    assignments.push({
      blockId: block.blockId,
      atomId: atom.atomId,
      text: atom.text,
      executionSlotKey,
      topologyCapabilityId,
      role,
    });
    usedBlockIds.add(block.blockId);
  };

  if (definition.topologyId === "band_overlay_promo") {
    bind(
      findFirstBlock("display_text"),
      pullAtom(["primary"]),
      "headline",
      "focal_text",
      "topology_band_focal_text",
      true,
    );
    bind(
      findFirstBlock("promo_surface"),
      pullAtom(["offer", "support", "detail"]),
      "offer_line",
      "accent_band",
      "topology_band_accent_band",
      true,
    );
    bind(
      findFirstBlock("support_text"),
      pullAtom(["support", "detail"]),
      "subheadline",
      "supporting_text",
      "topology_band_supporting_text",
      false,
    );
    bind(
      findFirstBlock("action_surface"),
      pullAtom(["cta"]),
      "cta",
      "action_affordance",
      "topology_band_action_affordance",
      false,
    );
    bind(
      findFirstBlock("detail_text"),
      pullAtom(["detail"]),
      "footer_note",
      "fineprint",
      "topology_band_fineprint",
      false,
    );
  } else {
    const centeredActionBlock = findFirstBlock("action_surface");
    const allowCenteredAction =
      centeredActionBlock !== null &&
      (centeredActionBlock.layerType !== "text" ||
        findFirstBlock("support_text") !== null);

    bind(
      findFirstBlock("display_text"),
      pullAtom(["primary"]),
      "headline",
      "focal_text",
      "topology_center_focal_text",
      true,
    );
    bind(
      findFirstBlock("support_text") ?? findFirstBlock("detail_text"),
      pullAtom(["offer", "support", "detail"]),
      "subheadline",
      "supporting_text",
      "topology_center_supporting_text",
      true,
    );
    bind(
      allowCenteredAction ? centeredActionBlock : null,
      pullAtom(["cta"]),
      "cta",
      "action_affordance",
      "topology_center_action_affordance",
      false,
    );
    bind(
      findFirstBlock("detail_text"),
      pullAtom(["detail"]),
      "footer_note",
      "fineprint",
      "topology_center_fineprint",
      false,
    );
  }

  const droppedAtomIds = atomPlan.atoms
    .map((atom) => atom.atomId)
    .filter((atomId) => !assignments.some((assignment) => assignment.atomId === atomId));
  const uniqueFailures = uniqueStrings(requiredBindingFailures) as TopologyCapabilityId[];

  return {
    plan: {
      planId: createRequestId(),
      runId,
      traceId,
      workflowVariant: "topology_v1",
      topologyId: definition.topologyId,
      assignments,
      droppedAtomIds,
      summary:
        `Topology binding mapped message atoms into ${definition.topologyId} capability slots.`,
    },
    requiredBindingFailures: uniqueFailures,
  };
}

function buildTopologyExecutionPlan(
  input: HydratedPlanningInput,
  graph: ReferenceBlockGraph,
  topologyBindingPlan: TopologyBindingPlan,
  definition: TopologyDefinition,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
): TopologyExecutionPlan {
  const copyBlocks: FreeformRenderableBlock[] = [];
  const polishBlocks: FreeformRenderableBlock[] = [];
  const assignmentByBlockId = new Map(
    topologyBindingPlan.assignments.map((assignment) => [
      assignment.blockId,
      assignment,
    ] as const),
  );
  const targetCanvasWidth = input.request.editorContext.canvasWidth;
  const targetCanvasHeight = input.request.editorContext.canvasHeight;
  const contentBounds: LayoutBounds[] = [];

  for (const block of graph.blocks) {
    const scaled = normalizeBoundsWithinCanvas(
      scaleBounds(
        block.bounds,
        graph.sourceCanvasWidth,
        graph.sourceCanvasHeight,
        targetCanvasWidth,
        targetCanvasHeight,
      ),
      targetCanvasWidth,
      targetCanvasHeight,
      block.kind === "detail_text" ? 12 : 24,
    );
    const assignment = assignmentByBlockId.get(block.blockId);

    if (block.kind === "promo_surface" && assignment?.text) {
      const fitted = fitPromoBandContent(scaled, assignment.text, targetCanvasWidth);
      contentBounds.push(fitted.surfaceBounds);
      copyBlocks.push({
        blockId: `${block.blockId}_surface`,
        stage: "copy",
        layerType: "shape",
        executionSlotKey: null,
        role: assignment.role,
        variantKey: "topology_band_accent_band_surface",
        candidateId: graph.selectedTemplateCode,
        bounds: fitted.surfaceBounds,
        textContent: null,
        styleTokens: {
          fillColor:
            sceneBindingPlan?.promoSurfaceColorHex ??
            block.fillColorHex ??
            sceneStylePlan?.palettePolicy.accentColorHex ??
            "#d9f99d",
          cornerRadius: Math.round(fitted.surfaceBounds.height / 2),
          opacity: 0.9,
        },
        clusterZone: block.clusterZone,
        topologyId: definition.topologyId,
        topologyCapabilityId: "accent_band",
        topologyRole: "accent_band",
        textBearing: false,
        actionBearing: false,
        mediaBearing: false,
      });
      copyBlocks.push({
        blockId: `${block.blockId}_text`,
        stage: "copy",
        layerType: "text",
        executionSlotKey: "offer_line",
        role: assignment.role,
        variantKey: "topology_band_accent_band_text",
        candidateId: graph.selectedTemplateCode,
        bounds: fitted.textBounds,
        textContent: assignment.text,
        fontRole: "display",
        fontSize: fitted.fontSize,
        textAlign: "center",
        styleTokens: {
          fillColor:
            sceneBindingPlan?.promoTextColorHex ??
            sceneBindingPlan?.accentTextColorHex ??
            sceneStylePlan?.palettePolicy.primaryTextColorHex ??
            "#111111",
        },
        clusterZone: block.clusterZone,
        topologyId: definition.topologyId,
        topologyCapabilityId: "accent_band",
        topologyRole: "accent_band",
        textBearing: true,
        actionBearing: false,
        mediaBearing: false,
      });
      continue;
    }

    if (block.kind === "action_surface" && assignment?.text) {
      const fitted = fitBandBounds(scaled, assignment.text, "cta", targetCanvasWidth);
      contentBounds.push(fitted);
      copyBlocks.push({
        blockId: `${block.blockId}_cta`,
        stage: "copy",
        layerType: "group",
        executionSlotKey: "cta",
        role: assignment.role,
        variantKey: `topology_${definition.topologyId}_action_affordance`,
        candidateId: graph.selectedTemplateCode,
        bounds: fitted,
        textContent: assignment.text,
        fontRole: "display",
        fontSize: null,
        textAlign: "center",
        styleTokens: {
          surfaceColor:
            sceneBindingPlan?.ctaSurfaceColorHex ??
            sceneStylePlan?.palettePolicy.ctaSurfaceColorHex ??
            "#6bd357",
          textColor:
            sceneBindingPlan?.ctaTextColorHex ??
            sceneStylePlan?.palettePolicy.ctaTextColorHex ??
            "#ffffff",
          ctaShapeLanguage:
            sceneBindingPlan?.ctaShapeLanguage ??
            sceneStylePlan?.ctaShapeLanguage ??
            "transparent_band",
        },
        clusterZone: block.clusterZone,
        topologyId: definition.topologyId,
        topologyCapabilityId: "action_affordance",
        topologyRole: "action_affordance",
        textBearing: true,
        actionBearing: true,
        mediaBearing: false,
      });
      continue;
    }

    if (assignment?.text) {
      const textBlock = buildTextBlock(
        graph.selectedTemplateCode,
        block,
        assignment,
        scaled,
        sceneStylePlan,
        sceneBindingPlan,
        definition.topologyId === "centered_message_stack"
          ? "center"
          : block.textAlign ?? "left",
      );
      copyBlocks.push({
        ...textBlock,
        role: assignment.role,
        variantKey: `topology_${definition.topologyId}_${assignment.topologyCapabilityId}`,
        topologyId: definition.topologyId,
        topologyCapabilityId: assignment.topologyCapabilityId,
        topologyRole: assignment.topologyCapabilityId,
        textBearing: true,
        actionBearing: assignment.topologyCapabilityId === "action_affordance",
        mediaBearing: false,
      });
      contentBounds.push(textBlock.bounds);
      continue;
    }

    if (block.kind !== "decor_cluster") {
      continue;
    }

    if (!isExecutionSafeScaledBounds(scaled, targetCanvasWidth, targetCanvasHeight, block.kind)) {
      continue;
    }
    if (contentBounds.some((bounds) => overlapRatio(bounds, scaled) > 0.12)) {
      continue;
    }

    if (block.layerType === "image" && block.sourceOriginUrl) {
      polishBlocks.push({
        blockId: `${block.blockId}_decor`,
        stage: "polish",
        layerType: "image",
        executionSlotKey: null,
        role: "topology_decor_cluster",
        variantKey: `topology_${definition.topologyId}_decor_image`,
        candidateId: graph.selectedTemplateCode,
        bounds: scaled,
        textContent: null,
        sourceOriginUrl: block.sourceOriginUrl,
        sourceWidth: block.sourceWidth,
        sourceHeight: block.sourceHeight,
        fitMode: "cover",
        cropMode: "centered_cover",
        clusterZone: block.clusterZone,
        topologyId: definition.topologyId,
        topologyCapabilityId: "decor_cluster",
        topologyRole: "decor_cluster",
        textBearing: false,
        actionBearing: false,
        mediaBearing: false,
      });
      continue;
    }

    polishBlocks.push({
      blockId: `${block.blockId}_decor`,
      stage: "polish",
      layerType: "shape",
      executionSlotKey: null,
      role: "topology_decor_cluster",
      variantKey: `topology_${definition.topologyId}_decor_shape`,
      candidateId: graph.selectedTemplateCode,
      bounds: scaled,
      textContent: null,
      styleTokens: {
        fillColor:
          block.fillColorHex ??
          sceneStylePlan?.palettePolicy.accentColorHex ??
          sceneBindingPlan?.accentTextColorHex ??
          "#d9f99d",
        cornerRadius: Math.round(Math.min(scaled.width, scaled.height) / 2),
        opacity: 0.85,
      },
      clusterZone: block.clusterZone,
      topologyId: definition.topologyId,
      topologyCapabilityId: "decor_cluster",
      topologyRole: "decor_cluster",
      textBearing: false,
      actionBearing: false,
      mediaBearing: false,
    });
  }

  resolveTopologyClusterLayout(
    definition.topologyId,
    copyBlocks,
    targetCanvasWidth,
    targetCanvasHeight,
  );

  const blocks = [...copyBlocks, ...polishBlocks];

  return {
    planId: createRequestId(),
    runId: input.job.runId,
    traceId: input.job.traceId,
    workflowVariant: "topology_v1",
    topologyId: definition.topologyId,
    selectedTemplateCode: graph.selectedTemplateCode,
    selectedTemplateTitle: graph.selectedTemplateTitle,
    compositionStatus: copyBlocks.length > 0 ? "stable" : "style_only",
    blocks,
    summary:
      `Topology execution plan emitted ${definition.topologyId} as editor-native freeform blocks.`,
  };
}

function buildTopologyFreeformLayoutPlan(
  input: HydratedPlanningInput,
  graph: ReferenceBlockGraph,
  topologyExecutionPlan: TopologyExecutionPlan,
): FreeformLayoutPlan {
  return {
    planId: createRequestId(),
    runId: input.job.runId,
    traceId: input.job.traceId,
    workflowVariant: "topology_v1",
    selectedTemplateCode: graph.selectedTemplateCode,
    selectedTemplateTitle: graph.selectedTemplateTitle,
    compositionStatus: topologyExecutionPlan.compositionStatus,
    copyBlocks: topologyExecutionPlan.blocks.filter((block) => block.stage === "copy"),
    polishBlocks: topologyExecutionPlan.blocks.filter((block) => block.stage === "polish"),
    summary:
      "Topology freeform carrier reuses the existing FE apply surface while preserving topology capability metadata.",
  };
}

function buildTopologyCompletionReport(
  input: HydratedPlanningInput,
  candidate: TemplatePriorCandidate,
  topologyId: TopologyId,
  completionContract: TopologyCompletionContract,
  freeformLayoutPlan: FreeformLayoutPlan,
): TopologyCompletionReport {
  const presentCapabilityIds = collectPresentTopologyCapabilityIds(freeformLayoutPlan);
  const textBearingCapabilityIds = collectTextBearingCapabilityIds(freeformLayoutPlan);
  const actionBearingPresent = freeformLayoutPlan.copyBlocks.some(
    (block) => block.actionBearing === true,
  );
  const mediaBearingPresent = freeformLayoutPlan.copyBlocks.some(
    (block) => block.mediaBearing === true,
  );
  const missingRequiredCapabilityIds = completionContract.requiredCapabilityIds.filter(
    (capabilityId: string) =>
      !presentCapabilityIds.includes(capabilityId as TopologyCapabilityId),
  );
  const passed =
    missingRequiredCapabilityIds.length === 0 &&
    textBearingCapabilityIds.length >=
      completionContract.minimumEditableTextCapabilityCount &&
    (!completionContract.requiresActionCapability || actionBearingPresent) &&
    (!completionContract.requiresMediaCapability || mediaBearingPresent);

  return {
    reportId: createRequestId(),
    runId: input.job.runId,
    traceId: input.job.traceId,
    workflowVariant: "topology_v1",
    topologyId,
    selectedTemplateCode: candidate.templateCode,
    selectedTemplateTitle: candidate.title,
    completionContract,
    presentCapabilityIds,
    passed,
    reason: passed
      ? `Topology ${topologyId} satisfied its completion contract.`
      : `Topology ${topologyId} is missing completion requirements: ${[
          ...missingRequiredCapabilityIds,
          ...(textBearingCapabilityIds.length <
          completionContract.minimumEditableTextCapabilityCount
            ? ["editable_text_capabilities"]
            : []),
          ...(!completionContract.requiresActionCapability || actionBearingPresent
            ? []
            : ["action_affordance"]),
          ...(!completionContract.requiresMediaCapability || mediaBearingPresent
            ? []
            : ["media_panel"]),
        ].join(", ")}`,
    summary: passed
      ? "Topology completion contract passed."
      : "Topology completion contract did not pass.",
  };
}

function buildEmptyTopologyCompletionReport(
  input: HydratedPlanningInput,
  topologyId: TopologyId | null = null,
  selectedTemplateCode: string | null = null,
  selectedTemplateTitle: string | null = null,
  completionContract: TopologyCompletionContract | null = null,
): TopologyCompletionReport {
  return {
    reportId: createRequestId(),
    runId: input.job.runId,
    traceId: input.job.traceId,
    workflowVariant: "topology_v1",
    topologyId,
    selectedTemplateCode,
    selectedTemplateTitle,
    completionContract,
    presentCapabilityIds: [],
    passed: false,
    reason: "Topology completion could not be evaluated.",
    summary: "No topology completion evaluation was performed.",
  };
}

function validateTopologyRenderablePlan(
  freeformLayoutPlan: FreeformLayoutPlan,
  canvasWidth: number,
  canvasHeight: number,
): { passed: boolean; reason: string; warnings: string[] } {
  const warnings: string[] = [];
  const contentBounds = collectTopologyContentClusterBounds(freeformLayoutPlan.copyBlocks);

  if (
    [...freeformLayoutPlan.copyBlocks, ...freeformLayoutPlan.polishBlocks].some(
      (block) =>
        block.bounds.x < 0 ||
        block.bounds.y < 0 ||
        block.bounds.x + block.bounds.width > canvasWidth ||
        block.bounds.y + block.bounds.height > canvasHeight,
    )
  ) {
    warnings.push("topology_off_canvas_bounds");
  }

  for (let leftIndex = 0; leftIndex < contentBounds.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < contentBounds.length;
      rightIndex += 1
    ) {
      if (overlapRatio(contentBounds[leftIndex]!, contentBounds[rightIndex]!) > 0.28) {
        warnings.push("topology_cluster_overlap");
      }
    }
  }

  for (const block of freeformLayoutPlan.polishBlocks) {
    if (!isExecutionSafeScaledBounds(block.bounds, canvasWidth, canvasHeight, "decor_cluster")) {
      warnings.push("topology_decor_off_canvas");
      continue;
    }
    if (contentBounds.some((bounds) => overlapRatio(bounds, block.bounds) > 0.12)) {
      warnings.push("topology_decor_occlusion");
    }
  }

  const uniqueWarnings = uniqueStrings(warnings);
  if (uniqueWarnings.length === 0) {
    return {
      passed: true,
      reason: "Topology candidate passed renderability.",
      warnings: [],
    };
  }

  return {
    passed: false,
    reason:
      "Topology candidate failed renderability guard and was downgraded to the readable fallback baseline.",
    warnings: uniqueWarnings,
  };
}

function buildTopologyQualityEvalSummary(
  input: HydratedPlanningInput,
  graph: ReferenceBlockGraph,
  freeformLayoutPlan: FreeformLayoutPlan,
  warnings: string[],
  summary: string,
): QualityEvalSummary {
  return {
    summaryId: createRequestId(),
    runId: input.job.runId,
    traceId: input.job.traceId,
    workflowVariant: "topology_v1",
    selectedTemplateCode: graph.selectedTemplateCode,
    selectedTemplateTitle: graph.selectedTemplateTitle,
    warnings,
    retainedReferenceBlockCount: graph.blocks.length,
    emittedBlockCount:
      freeformLayoutPlan.copyBlocks.length + freeformLayoutPlan.polishBlocks.length,
    summary,
  };
}

function buildTopologyFallbackExecution(
  input: HydratedPlanningInput,
  templatePriorBundle: TemplatePriorBundle,
  candidate: TemplatePriorCandidate,
  copyPlan: CopyPlan | null,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
  selectedEvaluation: TopologyEvaluation | null,
): Pick<
  CandidateEvaluation["result"],
  | "referenceBlockGraph"
  | "messageAtomPlan"
  | "editableBlockPlan"
  | "freeformLayoutPlan"
  | "qualityEvalSummary"
  | "styleDowngradeVerdict"
> {
  const fallback = transformResetResult(
    buildReferenceResetPath(
      createResetCompatInput(input),
      buildExecutionBundle(templatePriorBundle, candidate),
      copyPlan,
      sceneStylePlan,
      sceneBindingPlan,
    ),
  );

  return {
    referenceBlockGraph:
      selectedEvaluation?.referenceBlockGraph ?? fallback.referenceBlockGraph,
    messageAtomPlan:
      selectedEvaluation?.messageAtomPlan ?? fallback.messageAtomPlan,
    editableBlockPlan: fallback.editableBlockPlan,
    freeformLayoutPlan: fallback.freeformLayoutPlan,
    qualityEvalSummary: fallback.qualityEvalSummary
      ? {
          ...fallback.qualityEvalSummary,
          warnings: uniqueStrings([
            ...(selectedEvaluation?.warnings ?? []),
            ...fallback.qualityEvalSummary.warnings,
          ]),
          summary:
            `Topology ${selectedEvaluation?.topologyId ?? "unknown"} downgraded at ${selectedEvaluation?.failureStage ?? "precondition_failure"}; ` +
            `fallback executed through the readable style-only baseline.`,
        }
      : selectedEvaluation?.qualityEvalSummary ?? null,
    styleDowngradeVerdict: createTopologyDowngradeVerdict(
      input.job.runId,
      input.job.traceId,
      true,
      selectedEvaluation?.reason ?? null,
    ),
  };
}

function buildExecutionBundle(
  templatePriorBundle: TemplatePriorBundle | null,
  candidate: TemplatePriorCandidate | null,
): TemplatePriorBundle | null {
  if (!templatePriorBundle || !candidate) {
    return templatePriorBundle;
  }

  return {
    ...templatePriorBundle,
    workflowVariant: "topology_v1",
    selectedTemplateCode: candidate.templateCode,
    selectedTemplateTitle: candidate.title,
    selectedScaffold: candidate.scaffold,
  };
}

function buildTopologyMatchScore(
  definition: TopologyDefinition,
  requiredCapabilityCoverage: number,
  renderabilityPrecheckPassed: boolean,
  textBearingCapabilityCount: number,
  matchedCapabilityIds: TopologyCapabilityId[],
  missingRequiredCapabilityIds: TopologyCapabilityId[],
  score: number,
  reason: string,
): TopologyMatchScore {
  return {
    topologyId: definition.topologyId,
    requiredCapabilityCoverage,
    renderabilityPrecheckPassed,
    textBearingCapabilityCount,
    matchedCapabilityIds,
    missingRequiredCapabilityIds,
    score,
    reason,
  };
}

function buildTopologyMatchReport(
  input: HydratedPlanningInput,
  templatePriorBundle: TemplatePriorBundle | null,
  winningEvaluation: CandidateEvaluation | null,
  evaluations: CandidateEvaluation[],
): TopologyMatchReport {
  return {
    reportId: createRequestId(),
    runId: input.job.runId,
    traceId: input.job.traceId,
    workflowVariant: "topology_v1",
    previousSelectedTemplateCode: templatePriorBundle?.selectedTemplateCode ?? null,
    previousSelectedTemplateTitle: templatePriorBundle?.selectedTemplateTitle ?? null,
    nextSelectedTemplateCode: winningEvaluation?.candidate.templateCode ?? null,
    nextSelectedTemplateTitle: winningEvaluation?.candidate.title ?? null,
    selectedTopologyId: winningEvaluation?.selectedEvaluation?.topologyId ?? null,
    entries: evaluations.map((evaluation) => evaluation.matchEntry),
    summary:
      evaluations.length > 0
        ? `Topology match evaluated ${evaluations.length} template candidates across ${TOPOLOGY_REGISTRY.length} topology families.`
        : "Topology match had no template prior candidates to evaluate.",
  };
}

function buildTopologySelection(
  input: HydratedPlanningInput,
  templatePriorBundle: TemplatePriorBundle | null,
  winningEvaluation: CandidateEvaluation | null,
): TopologySelection {
  const previousSelectedTemplateCode = templatePriorBundle?.selectedTemplateCode ?? null;
  const previousSelectedTemplateTitle = templatePriorBundle?.selectedTemplateTitle ?? null;
  const nextSelectedTemplateCode = winningEvaluation?.candidate.templateCode ?? null;
  const nextSelectedTemplateTitle = winningEvaluation?.candidate.title ?? null;
  const reselectionApplied =
    previousSelectedTemplateCode !== null &&
    nextSelectedTemplateCode !== null &&
    previousSelectedTemplateCode !== nextSelectedTemplateCode;
  const reason =
    winningEvaluation === null
      ? "no_template_prior_candidate_available"
      : reselectionApplied
        ? "stable_capable_candidate_reselected"
        : winningEvaluation.selectedEvaluation?.selectedReadiness === "stable_capable"
          ? "original_selection_already_stable_capable"
          : "no_stable_candidate_reused_existing_selection";

  return {
    selectionId: createRequestId(),
    runId: input.job.runId,
    traceId: input.job.traceId,
    workflowVariant: "topology_v1",
    previousSelectedTemplateCode,
    previousSelectedTemplateTitle,
    nextSelectedTemplateCode,
    nextSelectedTemplateTitle,
    selectedTopologyId: winningEvaluation?.selectedEvaluation?.topologyId ?? null,
    reselectionApplied,
    selectedReadiness:
      winningEvaluation?.selectedEvaluation?.selectedReadiness ?? null,
    failureStage:
      winningEvaluation?.selectedEvaluation?.failureStage ?? "precondition_failure",
    reason,
    summary:
      nextSelectedTemplateCode
        ? `Topology selection chose ${nextSelectedTemplateCode} with ${winningEvaluation?.selectedEvaluation?.topologyId ?? "no topology"}${reselectionApplied ? " after reselection." : "."}`
        : "Topology selection could not choose a template candidate.",
  };
}

function selectWinningEvaluation(
  evaluations: CandidateEvaluation[],
  previousSelectedTemplateCode: string | null,
): CandidateEvaluation | null {
  const stableEvaluations = evaluations
    .filter(
      (evaluation) =>
        evaluation.selectedEvaluation?.selectedReadiness === "stable_capable",
    )
    .sort(compareCandidateEvaluations);
  if (stableEvaluations[0]) {
    return stableEvaluations[0];
  }

  if (previousSelectedTemplateCode) {
    const previousSelection = evaluations.find(
      (evaluation) =>
        evaluation.candidate.templateCode === previousSelectedTemplateCode,
    );
    if (previousSelection) {
      return previousSelection;
    }
  }

  return evaluations.sort(compareCandidateEvaluations)[0] ?? null;
}

function compareCandidateEvaluations(
  left: CandidateEvaluation,
  right: CandidateEvaluation,
): number {
  return (
    compareTopologyEvaluations(left.selectedEvaluation, right.selectedEvaluation) ||
    left.candidate.rank - right.candidate.rank ||
    Number(right.matchEntry.originalSelected) - Number(left.matchEntry.originalSelected)
  );
}

function chooseBestTopologyEvaluation(
  evaluations: TopologyEvaluation[],
): TopologyEvaluation | null {
  return [...evaluations].sort(compareTopologyEvaluations)[0] ?? null;
}

function compareTopologyEvaluations(
  left: TopologyEvaluation | null | undefined,
  right: TopologyEvaluation | null | undefined,
): number {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }

  return (
    right.requiredCapabilityCoverage - left.requiredCapabilityCoverage ||
    Number(right.renderabilityPrecheckPassed) - Number(left.renderabilityPrecheckPassed) ||
    right.textBearingCapabilityCount - left.textBearingCapabilityCount ||
    right.score - left.score ||
    TOPOLOGY_REGISTRY.findIndex((definition) => definition.topologyId === left.topologyId) -
      TOPOLOGY_REGISTRY.findIndex((definition) => definition.topologyId === right.topologyId)
  );
}

function buildTopologyEvaluationScore(
  requiredCapabilityCoverage: number,
  renderabilityPrecheckPassed: boolean,
  textBearingCapabilityCount: number,
  candidateRank: number,
): number {
  return Math.round(
    requiredCapabilityCoverage * 10_000 +
      (renderabilityPrecheckPassed ? 1_000 : 0) +
      textBearingCapabilityCount * 120 +
      Math.max(0, 200 - (candidateRank - 1) * 40),
  );
}

function collectPresentCapabilityIds(
  graph: ReferenceBlockGraph,
  topologyId: TopologyId,
): TopologyCapabilityId[] {
  const kinds = new Set(graph.blocks.map((block) => block.kind));
  const actionSurface = graph.blocks.find((block) => block.kind === "action_surface") ?? null;
  const supportText = graph.blocks.find((block) => block.kind === "support_text") ?? null;
  const capabilityIds = new Set<TopologyCapabilityId>();

  if (kinds.has("display_text")) {
    capabilityIds.add("focal_text");
  }
  if (kinds.has("promo_surface")) {
    capabilityIds.add("accent_band");
  }
  if (kinds.has("support_text") || kinds.has("detail_text")) {
    capabilityIds.add("supporting_text");
  }
  if (
    kinds.has("action_surface") &&
    (topologyId !== "centered_message_stack" ||
      (actionSurface !== null &&
        (actionSurface.layerType !== "text" || supportText !== null)))
  ) {
    capabilityIds.add("action_affordance");
  }
  if (kinds.has("detail_text")) {
    capabilityIds.add("fineprint");
  }
  if (kinds.has("decor_cluster")) {
    capabilityIds.add("decor_cluster");
  }
  if (topologyId === "band_overlay_promo" && kinds.has("support_text")) {
    capabilityIds.add("supporting_text");
  }

  return [...capabilityIds];
}

function toTopologyCompletionContract(
  definition: TopologyDefinition,
): TopologyCompletionContract {
  return {
    topologyId: definition.topologyId,
    requiredCapabilityIds: [...definition.requiredCapabilityIds],
    minimumEditableTextCapabilityCount:
      definition.minimumEditableTextCapabilityCount,
    requiresActionCapability: definition.requiresActionCapability,
    requiresMediaCapability: definition.requiresMediaCapability,
  };
}

function createTopologyDowngradeVerdict(
  runId: string,
  traceId: string,
  applied: boolean,
  reason: string | null,
): StyleDowngradeVerdict {
  return {
    verdictId: createRequestId(),
    runId,
    traceId,
    workflowVariant: "topology_v1",
    applied,
    reason,
    summary: applied
      ? `Topology slice downgraded to style-only fallback: ${reason ?? "unknown reason"}.`
      : "Topology slice retained the selected stable path without downgrade.",
  };
}

function transformResetResult(
  result: ReturnType<typeof buildReferenceResetPath>,
): Pick<
  CandidateEvaluation["result"],
  | "referenceBlockGraph"
  | "messageAtomPlan"
  | "editableBlockPlan"
  | "freeformLayoutPlan"
  | "qualityEvalSummary"
  | "styleDowngradeVerdict"
> {
  return {
    referenceBlockGraph: result.referenceBlockGraph
      ? {
          ...result.referenceBlockGraph,
          workflowVariant: "topology_v1",
        }
      : null,
    messageAtomPlan: result.messageAtomPlan
      ? {
          ...result.messageAtomPlan,
          workflowVariant: "topology_v1",
        }
      : null,
    editableBlockPlan: result.editableBlockPlan
      ? {
          ...result.editableBlockPlan,
          workflowVariant: "topology_v1",
        }
      : null,
    freeformLayoutPlan: result.freeformLayoutPlan
      ? {
          ...result.freeformLayoutPlan,
          workflowVariant: "topology_v1",
        }
      : null,
    qualityEvalSummary: result.qualityEvalSummary
      ? {
          ...result.qualityEvalSummary,
          workflowVariant: "topology_v1",
        }
      : null,
    styleDowngradeVerdict: result.styleDowngradeVerdict
      ? {
          ...result.styleDowngradeVerdict,
          workflowVariant: "topology_v1",
        }
      : null,
  };
}

function createResetCompatInput(
  input: HydratedPlanningInput,
): HydratedPlanningInput {
  return {
    ...input,
    request: {
      ...input.request,
      workflowVariant: "retrieval_prior_v2_reset",
    },
  };
}

function normalizeBoundsWithinCanvas(
  bounds: LayoutBounds,
  canvasWidth: number,
  canvasHeight: number,
  padding: number,
): LayoutBounds {
  const width = Math.min(bounds.width, Math.max(canvasWidth - padding * 2, 40));
  const height = Math.min(bounds.height, Math.max(canvasHeight - padding * 2, 24));
  return {
    x: clampNumber(bounds.x, padding, Math.max(padding, canvasWidth - width - padding)),
    y: clampNumber(bounds.y, padding, Math.max(padding, canvasHeight - height - padding)),
    width,
    height,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function collectPresentTopologyCapabilityIds(
  freeformLayoutPlan: FreeformLayoutPlan,
): TopologyCapabilityId[] {
  return uniqueStrings(
    [...freeformLayoutPlan.copyBlocks, ...freeformLayoutPlan.polishBlocks]
      .map((block) => block.topologyCapabilityId)
      .filter((capabilityId): capabilityId is TopologyCapabilityId =>
        typeof capabilityId === "string" && capabilityId.length > 0,
      ),
  ) as TopologyCapabilityId[];
}

function collectTextBearingCapabilityIds(
  freeformLayoutPlan: FreeformLayoutPlan,
): TopologyCapabilityId[] {
  return uniqueStrings(
    freeformLayoutPlan.copyBlocks
      .filter((block) => block.textBearing === true)
      .map((block) => block.topologyCapabilityId)
      .filter((capabilityId): capabilityId is TopologyCapabilityId =>
        typeof capabilityId === "string" && capabilityId.length > 0,
      ),
  ) as TopologyCapabilityId[];
}

function collectTopologyContentClusterBounds(
  copyBlocks: FreeformRenderableBlock[],
): LayoutBounds[] {
  const clusters = new Map<string, LayoutBounds>();

  for (const block of copyBlocks) {
    if (block.topologyCapabilityId === "fineprint") {
      continue;
    }
    const key = block.topologyCapabilityId ?? block.blockId;
    const existing = clusters.get(key);
    clusters.set(key, existing ? mergeBounds(existing, block.bounds) : block.bounds);
  }

  return [...clusters.values()];
}

function mergeBounds(left: LayoutBounds, right: LayoutBounds): LayoutBounds {
  const minX = Math.min(left.x, right.x);
  const minY = Math.min(left.y, right.y);
  const maxX = Math.max(left.x + left.width, right.x + right.width);
  const maxY = Math.max(left.y + left.height, right.y + right.height);
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function resolveTopologyClusterLayout(
  topologyId: TopologyId,
  copyBlocks: FreeformRenderableBlock[],
  canvasWidth: number,
  canvasHeight: number,
) {
  const focal = copyBlocks.find((block) => block.topologyCapabilityId === "focal_text");
  const supporting = copyBlocks.find(
    (block) => block.topologyCapabilityId === "supporting_text",
  );
  const action = copyBlocks.find(
    (block) => block.topologyCapabilityId === "action_affordance",
  );
  const fineprint = copyBlocks.find(
    (block) => block.topologyCapabilityId === "fineprint",
  );
  const accentBand = copyBlocks.find(
    (block) => block.topologyCapabilityId === "accent_band" && block.layerType === "shape",
  );

  if (topologyId === "centered_message_stack") {
    for (const block of [focal, supporting, action].filter(Boolean) as FreeformRenderableBlock[]) {
      block.bounds.x = Math.max(24, Math.round((canvasWidth - block.bounds.width) / 2));
      if (block.textAlign) {
        block.textAlign = "center";
      }
    }
    if (focal && supporting) {
      supporting.bounds.y = focal.bounds.y + focal.bounds.height + 20;
    }
    if (supporting && action) {
      action.bounds.y = Math.min(
        supporting.bounds.y + supporting.bounds.height + 28,
        canvasHeight - action.bounds.height - 24,
      );
    } else if (action) {
      action.bounds.y = Math.min(
        action.bounds.y,
        canvasHeight - action.bounds.height - 24,
      );
    }
  } else {
    if (accentBand && focal) {
      focal.bounds.y = Math.max(
        accentBand.bounds.y + accentBand.bounds.height + 24,
        focal.bounds.y,
      );
    }
    if (focal && action) {
      const maxBottom = action.bounds.y - 24;
      if (focal.bounds.y + focal.bounds.height > maxBottom) {
        focal.bounds.height = Math.max(72, maxBottom - focal.bounds.y);
      }
    }
  }

  if (fineprint) {
    fineprint.bounds.y = Math.min(
      Math.max(canvasHeight - fineprint.bounds.height - 18, fineprint.bounds.y),
      canvasHeight - fineprint.bounds.height - 12,
    );
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
