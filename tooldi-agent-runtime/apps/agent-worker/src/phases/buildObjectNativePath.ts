import { createRequestId } from "@tooldi/agent-domain";

import type {
  BlockBindingPlan,
  BlockBindingAssignment,
  CopyPlan,
  EditableBlockPlan,
  FreeformLayoutPlan,
  FreeformRenderableBlock,
  HydratedPlanningInput,
  LayoutBounds,
  MessageAtom,
  MessageAtomPlan,
  ObjectNativeCandidateSelection,
  ObjectNativeReferenceAudit,
  ObjectNativeAuditEntry,
  ObjectNativeBindingCoverage,
  ObjectNativeClusterFamily,
  ObjectNativeFailureStage,
  ObjectNativeReadinessDiagnostics,
  ObjectNativeRenderabilityReport,
  ObjectNativeRenderabilityMetrics,
  ObjectNativeSemanticGateReason,
  QualityEvalSummary,
  ReferenceBlock,
  ReferenceBlockGraph,
  SceneBindingPlan,
  SceneStylePlan,
  StyleDowngradeVerdict,
  TemplatePriorBundle,
  TemplatePriorCandidate,
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

interface BuildObjectNativePathResult {
  objectNativeReferenceAudit: ObjectNativeReferenceAudit;
  objectNativeCandidateSelection: ObjectNativeCandidateSelection;
  objectNativeRenderabilityReport: ObjectNativeRenderabilityReport;
  referenceBlockGraph: ReferenceBlockGraph | null;
  messageAtomPlan: MessageAtomPlan | null;
  blockBindingPlan: BlockBindingPlan | null;
  editableBlockPlan: EditableBlockPlan | null;
  freeformLayoutPlan: FreeformLayoutPlan | null;
  qualityEvalSummary: QualityEvalSummary | null;
  styleDowngradeVerdict: StyleDowngradeVerdict | null;
}

interface CandidateEvaluation {
  candidate: TemplatePriorCandidate;
  entry: ObjectNativeAuditEntry;
  result: Omit<
    BuildObjectNativePathResult,
    | "objectNativeReferenceAudit"
    | "objectNativeCandidateSelection"
    | "objectNativeRenderabilityReport"
  >;
}

interface ObjectNativeNativeExecutionResult {
  stableCapable: boolean;
  failureStage: ObjectNativeFailureStage;
  diagnostics: ObjectNativeReadinessDiagnostics;
  reason: string;
  warnings: string[];
  referenceBlockGraph: ReferenceBlockGraph | null;
  messageAtomPlan: MessageAtomPlan | null;
  blockBindingPlan: BlockBindingPlan | null;
  editableBlockPlan: EditableBlockPlan | null;
  freeformLayoutPlan: FreeformLayoutPlan | null;
  qualityEvalSummary: QualityEvalSummary | null;
  styleDowngradeVerdict: StyleDowngradeVerdict | null;
}

export function buildObjectNativePath(
  input: HydratedPlanningInput,
  templatePriorBundle: TemplatePriorBundle | null,
  copyPlan: CopyPlan | null,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
): BuildObjectNativePathResult {
  if (deriveWorkflowVariant(input) !== "object_native_v1") {
    return buildEmptyObjectNativeResult(input);
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
    referenceBlockGraph: null,
    messageAtomPlan: null,
    blockBindingPlan: null,
    editableBlockPlan: null,
    freeformLayoutPlan: null,
    qualityEvalSummary: null,
    styleDowngradeVerdict: null,
  };

  const audit = buildReferenceAudit(
    input,
    templatePriorBundle,
    winningEvaluation,
    evaluations,
  );
  const selection = buildCandidateSelection(
    input,
    templatePriorBundle,
    winningEvaluation,
  );
  const renderabilityReport = buildRenderabilityReport(
    input,
    winningEvaluation,
    transformedExecution,
  );

  return {
    objectNativeReferenceAudit: audit,
    objectNativeCandidateSelection: selection,
    objectNativeRenderabilityReport: renderabilityReport,
    ...transformedExecution,
  };
}

function buildEmptyObjectNativeResult(
  input: HydratedPlanningInput,
): BuildObjectNativePathResult {
  return {
    objectNativeReferenceAudit: {
      auditId: createRequestId(),
      runId: input.job.runId,
      traceId: input.job.traceId,
      workflowVariant: "object_native_v1",
      previousSelectedTemplateCode: null,
      previousSelectedTemplateTitle: null,
      nextSelectedTemplateCode: null,
      nextSelectedTemplateTitle: null,
      entries: [],
      summary: "Object-native path was not activated because the workflow variant did not match.",
    },
    objectNativeCandidateSelection: {
      selectionId: createRequestId(),
      runId: input.job.runId,
      traceId: input.job.traceId,
      workflowVariant: "object_native_v1",
      previousSelectedTemplateCode: null,
      previousSelectedTemplateTitle: null,
      nextSelectedTemplateCode: null,
      nextSelectedTemplateTitle: null,
      reselectionApplied: false,
      selectedReadiness: null,
      selectedFailureStage: "precondition_failure",
      selectedDiagnostics: null,
      reason: "workflow_variant_mismatch",
      summary: "Object-native candidate reselection was skipped.",
    },
    objectNativeRenderabilityReport: {
      reportId: createRequestId(),
      runId: input.job.runId,
      traceId: input.job.traceId,
      workflowVariant: "object_native_v1",
      selectedTemplateCode: null,
      selectedTemplateTitle: null,
      passed: false,
      failureStage: "precondition_failure",
      compositionStatus: "none",
      selectedDiagnostics: null,
      reason: "workflow_variant_mismatch",
      warnings: ["workflow_variant_mismatch"],
      summary: "No object-native renderability evaluation was performed.",
    },
    referenceBlockGraph: null,
    messageAtomPlan: null,
    blockBindingPlan: null,
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
  const nativeExecution = buildObjectNativeNativeExecution(
    input,
    templatePriorBundle,
    candidate,
    copyPlan,
    sceneStylePlan,
    sceneBindingPlan,
  );
  const transformed = nativeExecution.stableCapable
    ? nativeExecution
    : buildObjectNativeFallbackExecution(
        input,
        templatePriorBundle,
        candidate,
        copyPlan,
        sceneStylePlan,
        sceneBindingPlan,
        nativeExecution,
      );
  const stableCapable = nativeExecution.stableCapable;
  const compositionStatus = transformed.freeformLayoutPlan?.compositionStatus ?? "none";
  const retainedReferenceBlockCount =
    nativeExecution.referenceBlockGraph?.blocks.length ?? 0;
  const emittedBlockCount =
    (transformed.freeformLayoutPlan?.copyBlocks.length ?? 0) +
    (transformed.freeformLayoutPlan?.polishBlocks.length ?? 0);
  const warnings = uniqueStrings(nativeExecution.warnings);
  const score = buildCandidateScore(
    candidate,
    stableCapable,
    emittedBlockCount,
    retainedReferenceBlockCount,
    warnings.length,
  );
  const reason = nativeExecution.reason;
  const failureStage = nativeExecution.failureStage;

  return {
    candidate,
    entry: {
      templateCode: candidate.templateCode,
      templateTitle: candidate.title,
      rank: candidate.rank,
      originalSelected: templatePriorBundle.selectedTemplateCode === candidate.templateCode,
      readiness: stableCapable
        ? "stable_capable"
        : transformed.freeformLayoutPlan
          ? "fallback_only"
          : "unusable",
      failureStage,
      compositionStatus,
      score,
      retainedReferenceBlockCount,
      emittedBlockCount,
      diagnostics: nativeExecution.diagnostics,
      reason,
      warnings,
    },
    result: transformed,
  };
}

function buildObjectNativeNativeExecution(
  input: HydratedPlanningInput,
  templatePriorBundle: TemplatePriorBundle,
  candidate: TemplatePriorCandidate,
  copyPlan: CopyPlan | null,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
): ObjectNativeNativeExecutionResult {
  const selectedTemplateCode = candidate.templateCode;
  const selectedTemplateTitle = candidate.title;
  const messageAtomPlan = buildObjectNativeMessageAtomPlan(
    input.request.userInput.prompt,
    copyPlan,
    input.job.runId,
    input.job.traceId,
  );
  const page = readFirstParsedPage(candidate.fetchedDocument ?? null);

  if (!selectedTemplateCode || !selectedTemplateTitle || !messageAtomPlan || !page) {
    return {
      stableCapable: false,
      failureStage: "precondition_failure",
      diagnostics: emptyObjectNativeReadinessDiagnostics(),
      reason:
        "Object-native candidate could not start because the reference payload or message atoms were incomplete.",
      warnings: ["object_native_precondition_missing"],
      referenceBlockGraph: null,
      messageAtomPlan,
      blockBindingPlan: null,
      editableBlockPlan: null,
      freeformLayoutPlan: null,
      qualityEvalSummary: null,
      styleDowngradeVerdict: null,
    };
  }

  const extractionAnalysis = extractReferenceBlockGraph(
    input.job.runId,
    input.job.traceId,
    selectedTemplateCode,
    selectedTemplateTitle,
    page,
  );
  const referenceBlockGraph = transformReferenceBlockGraphWorkflowVariant(
    extractionAnalysis.referenceBlockGraph,
  );
  let diagnostics = buildObjectNativeReadinessDiagnostics({
    graph: referenceBlockGraph,
    messageAtomPlan,
    extractionWarnings: extractionAnalysis.warnings,
  });
  const readiness = evaluateObjectNativeSupportedClusterReadiness(
    referenceBlockGraph,
    extractionAnalysis.warnings,
    diagnostics,
  );
  diagnostics = readiness.diagnostics;
  if (!readiness.passed) {
    return {
      stableCapable: false,
      failureStage: "semantic_gate_failure",
      diagnostics,
      reason: readiness.reason,
      warnings: uniqueStrings([
        ...extractionAnalysis.warnings,
        ...readiness.warnings,
      ]),
      referenceBlockGraph,
      messageAtomPlan,
      blockBindingPlan: null,
      editableBlockPlan: null,
      freeformLayoutPlan: null,
      qualityEvalSummary: null,
      styleDowngradeVerdict: null,
    };
  }

  const blockBindingPlan = buildObjectNativeClusterBindingPlan(
    input.job.runId,
    input.job.traceId,
    referenceBlockGraph,
    messageAtomPlan,
  );
  diagnostics = {
    ...diagnostics,
    bindingCoverage: buildObjectNativeBindingCoverage(
      messageAtomPlan,
      blockBindingPlan.plan,
    ),
  };
  if (blockBindingPlan.requiredBindingFailures.length > 0) {
    return {
      stableCapable: false,
      failureStage: "binding_failure",
      diagnostics,
      reason:
        "Object-native candidate had the right cluster families but could not bind the required message atoms.",
      warnings: uniqueStrings([
        ...extractionAnalysis.warnings,
        ...blockBindingPlan.requiredBindingFailures.map(
          (failure) => `object_native_binding_missing:${failure}`,
        ),
      ]),
      referenceBlockGraph,
      messageAtomPlan,
      blockBindingPlan: blockBindingPlan.plan,
      editableBlockPlan: null,
      freeformLayoutPlan: null,
      qualityEvalSummary: null,
      styleDowngradeVerdict: null,
    };
  }

  const editableBlockPlan = buildObjectNativeEditableBlockPlan(
    input,
    referenceBlockGraph,
    blockBindingPlan.plan,
    messageAtomPlan,
    sceneStylePlan,
    sceneBindingPlan,
  );
  const freeformLayoutPlan = buildObjectNativeFreeformLayoutPlan(
    input,
    referenceBlockGraph,
    editableBlockPlan,
  );
  const renderability = validateObjectNativeStableRenderablePlan(
    freeformLayoutPlan,
    input.request.editorContext.canvasWidth,
    input.request.editorContext.canvasHeight,
  );
  diagnostics = {
    ...diagnostics,
    renderabilityMetrics: buildObjectNativeRenderabilityMetrics(
      freeformLayoutPlan,
      renderability.warnings,
      input.request.editorContext.canvasWidth,
      input.request.editorContext.canvasHeight,
    ),
  };
  const qualityWarnings = uniqueStrings([
    ...extractionAnalysis.warnings,
    ...renderability.warnings,
  ]);
  const qualityEvalSummary = buildObjectNativeQualityEvalSummary(
    input,
    referenceBlockGraph,
    freeformLayoutPlan,
    qualityWarnings,
    renderability.passed
      ? "Object-native native slice produced a stable editable cluster composition."
      : renderability.reason,
  );

  if (!renderability.passed) {
    return {
      stableCapable: false,
      failureStage: "renderability_guard_failure",
      diagnostics,
      reason: renderability.reason,
      warnings: qualityWarnings,
      referenceBlockGraph,
      messageAtomPlan,
      blockBindingPlan: blockBindingPlan.plan,
      editableBlockPlan,
      freeformLayoutPlan,
      qualityEvalSummary,
      styleDowngradeVerdict: null,
    };
  }

  return {
    stableCapable: true,
    failureStage: "none",
    diagnostics,
    reason: "Object-native candidate retained supported cluster families and passed renderability.",
    warnings: qualityWarnings,
    referenceBlockGraph,
    messageAtomPlan,
    blockBindingPlan: blockBindingPlan.plan,
    editableBlockPlan,
    freeformLayoutPlan,
    qualityEvalSummary,
    styleDowngradeVerdict: createObjectNativeDowngradeVerdict(
      input.job.runId,
      input.job.traceId,
      false,
      null,
    ),
  };
}

function buildObjectNativeFallbackExecution(
  input: HydratedPlanningInput,
  templatePriorBundle: TemplatePriorBundle,
  candidate: TemplatePriorCandidate,
  copyPlan: CopyPlan | null,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
  nativeExecution: ObjectNativeNativeExecutionResult,
): Omit<
  BuildObjectNativePathResult,
  | "objectNativeReferenceAudit"
  | "objectNativeCandidateSelection"
  | "objectNativeRenderabilityReport"
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
  const warnings = uniqueStrings([
    ...nativeExecution.warnings,
    ...(fallback.qualityEvalSummary?.warnings ?? []),
  ]);

  return {
    referenceBlockGraph:
      nativeExecution.referenceBlockGraph ?? fallback.referenceBlockGraph,
    messageAtomPlan:
      nativeExecution.messageAtomPlan ?? fallback.messageAtomPlan,
    blockBindingPlan:
      nativeExecution.blockBindingPlan ?? fallback.blockBindingPlan,
    editableBlockPlan: fallback.editableBlockPlan,
    freeformLayoutPlan: fallback.freeformLayoutPlan,
    qualityEvalSummary:
      fallback.qualityEvalSummary
        ? {
            ...fallback.qualityEvalSummary,
            warnings,
            summary:
              `Object-native native slice downgraded at ${nativeExecution.failureStage}; ` +
              `fallback executed through the readable style-only baseline.`,
          }
        : nativeExecution.qualityEvalSummary,
    styleDowngradeVerdict: createObjectNativeDowngradeVerdict(
      input.job.runId,
      input.job.traceId,
      true,
      nativeExecution.reason,
    ),
  };
}

function buildObjectNativeMessageAtomPlan(
  prompt: string,
  copyPlan: CopyPlan | null,
  runId: string,
  traceId: string,
): MessageAtomPlan | null {
  const messageAtomPlan = buildMessageAtomPlan(prompt, copyPlan, runId, traceId);
  return messageAtomPlan
    ? {
        ...messageAtomPlan,
        workflowVariant: "object_native_v1",
        summary:
          "Object-native message atoms remain loose semantic hints and do not define the execution topology.",
      }
    : null;
}

function transformReferenceBlockGraphWorkflowVariant(
  graph: ReferenceBlockGraph,
): ReferenceBlockGraph {
  return {
    ...graph,
    workflowVariant: "object_native_v1",
    summary:
      "Object-native cluster graph retains the first supported cluster-family slice from the selected reference.",
  };
}

function evaluateObjectNativeSupportedClusterReadiness(
  graph: ReferenceBlockGraph,
  extractionWarnings: string[],
  diagnostics: ObjectNativeReadinessDiagnostics,
): {
  passed: boolean;
  reason: string;
  warnings: string[];
  diagnostics: ObjectNativeReadinessDiagnostics;
} {
  void graph;
  const warnings = diagnostics.missingClusterFamilies.map((family) =>
    family === "big_text"
      ? "object_native_missing_big_text_cluster"
      : family === "promo_band"
        ? "object_native_missing_promo_band_cluster"
        : "object_native_missing_cta_cluster",
  );
  const semanticGateReason = deriveObjectNativeSemanticGateReason(
    diagnostics,
    extractionWarnings,
  );

  if (warnings.length === 0) {
    return {
      passed: true,
      reason: "Supported object-native cluster families were retained.",
      warnings: [],
      diagnostics: {
        ...diagnostics,
        semanticGateReason,
      },
    };
  }

  return {
    passed: false,
    reason:
      "Selected reference did not retain the supported object-native cluster family slice required for the first native execution path.",
    warnings,
    diagnostics: {
      ...diagnostics,
      semanticGateReason,
    },
  };
}

function buildObjectNativeClusterBindingPlan(
  runId: string,
  traceId: string,
  graph: ReferenceBlockGraph,
  atomPlan: MessageAtomPlan,
): {
  plan: BlockBindingPlan;
  requiredBindingFailures: Array<"primary" | "offer" | "cta">;
} {
  const assignments: BlockBindingAssignment[] = [];
  const droppedAtomIds = new Set<string>();
  const requiredBindingFailures: Array<"primary" | "offer" | "cta"> = [];
  const atomByKind = new Map(atomPlan.atoms.map((atom) => [atom.kind, atom] as const));
  const findBlock = (kind: ReferenceBlock["kind"]) =>
    graph.blocks.find((block) => block.kind === kind) ?? null;

  bind(findBlock("display_text"), atomByKind.get("primary"), "headline", "big_text_cluster");
  bind(findBlock("promo_surface"), atomByKind.get("offer"), "offer_line", "promo_band_cluster");
  bind(findBlock("action_surface"), atomByKind.get("cta"), "cta", "cta_cluster");
  bind(findBlock("detail_text"), atomByKind.get("detail"), "footer_note", "microtext_cluster");

  return {
    plan: {
      planId: createRequestId(),
      runId,
      traceId,
      workflowVariant: "object_native_v1",
      assignments,
      droppedAtomIds: [...droppedAtomIds],
      summary:
        "Object-native block binding maps message atoms into supported cluster families without treating the atom list as a required slot schema.",
    },
    requiredBindingFailures,
  };

  function bind(
    block: ReferenceBlock | null,
    atom: MessageAtom | undefined,
    executionSlotKey: BlockBindingAssignment["executionSlotKey"],
    role: string,
  ) {
    if (!atom) {
      return;
    }
    if (!block) {
      droppedAtomIds.add(atom.atomId);
      if (atom.kind === "primary" || atom.kind === "offer" || atom.kind === "cta") {
        requiredBindingFailures.push(atom.kind);
      }
      return;
    }

    assignments.push({
      blockId: block.blockId,
      atomId: atom.atomId,
      text: atom.text,
      executionSlotKey,
      role,
    });
  }
}

function buildObjectNativeEditableBlockPlan(
  input: HydratedPlanningInput,
  graph: ReferenceBlockGraph,
  blockBindingPlan: BlockBindingPlan,
  messageAtomPlan: MessageAtomPlan,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
): EditableBlockPlan {
  const copyBlocks: FreeformRenderableBlock[] = [];
  const polishBlocks: FreeformRenderableBlock[] = [];
  const assignmentByBlockId = new Map(
    blockBindingPlan.assignments.map((assignment) => [assignment.blockId, assignment] as const),
  );
  const candidateId = graph.selectedTemplateCode;
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
    if (!assignment?.text) {
      continue;
    }

    if (block.kind === "promo_surface") {
      const fitted = fitPromoBandContent(scaled, assignment.text, targetCanvasWidth);
      contentBounds.push(fitted.surfaceBounds);
      copyBlocks.push({
        blockId: `${block.blockId}_surface`,
        stage: "copy",
        layerType: "shape",
        slotKey: null,
        executionSlotKey: null,
        role: "promo_band_cluster",
        variantKey: "object_native_promo_band_surface",
        candidateId,
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
      });
      copyBlocks.push({
        blockId: `${block.blockId}_text`,
        stage: "copy",
        layerType: "text",
        slotKey: null,
        executionSlotKey: "offer_line",
        role: "promo_band_cluster",
        variantKey: "object_native_promo_band_text",
        candidateId,
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
      });
      continue;
    }

    if (block.kind === "action_surface") {
      const fitted = fitBandBounds(scaled, assignment.text, "cta", targetCanvasWidth);
      contentBounds.push(fitted);
      copyBlocks.push({
        blockId: `${block.blockId}_cta`,
        stage: "copy",
        layerType: "group",
        slotKey: "cta",
        executionSlotKey: "cta",
        role: "cta_cluster",
        variantKey: "object_native_cta_cluster",
        candidateId,
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
      });
      continue;
    }

    const textBlock = buildTextBlock(
      candidateId,
      block,
      assignment,
      scaled,
      sceneStylePlan,
      sceneBindingPlan,
      block.textAlign ?? "left",
    );
    const variantKey =
      block.kind === "display_text"
        ? "object_native_big_text"
        : "object_native_microtext";
    copyBlocks.push({
      ...textBlock,
      role:
        block.kind === "display_text"
          ? "big_text_cluster"
          : "microtext_cluster",
      variantKey,
    });
    contentBounds.push(textBlock.bounds);
  }

  for (const block of graph.blocks.filter((entry) => entry.kind === "decor_cluster")) {
    const scaled = scaleBounds(
      block.bounds,
      graph.sourceCanvasWidth,
      graph.sourceCanvasHeight,
      targetCanvasWidth,
      targetCanvasHeight,
    );
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
        slotKey: "decoration",
        executionSlotKey: null,
        role: "corner_decor_cluster",
        variantKey: "object_native_reference_image",
        candidateId,
        bounds: scaled,
        textContent: null,
        sourceOriginUrl: block.sourceOriginUrl,
        sourceWidth: block.sourceWidth,
        sourceHeight: block.sourceHeight,
        fitMode: "cover",
        cropMode: "centered_cover",
        clusterZone: block.clusterZone,
      });
      continue;
    }

    polishBlocks.push({
      blockId: `${block.blockId}_decor`,
      stage: "polish",
      layerType: "shape",
      slotKey: "decoration",
      executionSlotKey: null,
      role: "corner_decor_cluster",
      variantKey: "object_native_reference_shape",
      candidateId,
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
    });
  }

  resolveObjectNativeClusterLayout(copyBlocks, targetCanvasHeight);

  return {
    planId: createRequestId(),
    runId: input.job.runId,
    traceId: input.job.traceId,
    workflowVariant: "object_native_v1",
    selectedTemplateCode: graph.selectedTemplateCode,
    selectedTemplateTitle: graph.selectedTemplateTitle,
    compositionStatus: copyBlocks.length > 0 ? "stable" : "style_only",
    blocks: [...copyBlocks, ...polishBlocks],
    summary:
      "Object-native editable block plan preserves the first supported cluster family slice and binds prompt atoms into those retained clusters.",
  };
}

function buildObjectNativeFreeformLayoutPlan(
  input: HydratedPlanningInput,
  graph: ReferenceBlockGraph,
  editableBlockPlan: EditableBlockPlan,
): FreeformLayoutPlan {
  return {
    planId: createRequestId(),
    runId: input.job.runId,
    traceId: input.job.traceId,
    workflowVariant: "object_native_v1",
    selectedTemplateCode: graph.selectedTemplateCode,
    selectedTemplateTitle: graph.selectedTemplateTitle,
    compositionStatus: editableBlockPlan.compositionStatus,
    copyBlocks: editableBlockPlan.blocks.filter((block) => block.stage === "copy"),
    polishBlocks: editableBlockPlan.blocks.filter((block) => block.stage === "polish"),
    summary:
      "Object-native freeform carrier reuses the existing FE apply surface but carries native cluster-bound execution truth.",
  };
}

function validateObjectNativeStableRenderablePlan(
  freeformLayoutPlan: FreeformLayoutPlan,
  canvasWidth: number,
  canvasHeight: number,
): { passed: boolean; reason: string; warnings: string[] } {
  const warnings: string[] = [];
  const copyBlocks = freeformLayoutPlan.copyBlocks;
  const polishBlocks = freeformLayoutPlan.polishBlocks;
  const contentBounds = collectObjectNativeContentClusterBounds(copyBlocks);

  if (copyBlocks.length < 3) {
    warnings.push("object_native_insufficient_content_clusters");
  }
  if (
    copyBlocks.some(
      (block) =>
        block.bounds.x < 0 ||
        block.bounds.y < 0 ||
        block.bounds.x + block.bounds.width > canvasWidth ||
        block.bounds.y + block.bounds.height > canvasHeight,
    )
  ) {
    warnings.push("object_native_off_canvas_bounds");
  }
  for (let leftIndex = 0; leftIndex < contentBounds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < contentBounds.length; rightIndex += 1) {
      if (overlapRatio(contentBounds[leftIndex]!, contentBounds[rightIndex]!) > 0.28) {
        warnings.push("object_native_cluster_overlap");
      }
    }
  }
  for (const block of polishBlocks) {
    if (!isExecutionSafeScaledBounds(block.bounds, canvasWidth, canvasHeight, "decor_cluster")) {
      warnings.push("object_native_decor_off_canvas");
      continue;
    }
    if (contentBounds.some((bounds) => overlapRatio(bounds, block.bounds) > 0.12)) {
      warnings.push("object_native_decor_occlusion");
    }
  }

  const uniqueWarnings = uniqueStrings(warnings);
  if (uniqueWarnings.length === 0) {
    return {
      passed: true,
      reason: "Object-native candidate passed renderability.",
      warnings: [],
    };
  }

  return {
    passed: false,
    reason:
      "Object-native native slice failed renderability guard and was downgraded to the style-only baseline.",
    warnings: uniqueWarnings,
  };
}

function buildObjectNativeQualityEvalSummary(
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
    workflowVariant: "object_native_v1",
    selectedTemplateCode: graph.selectedTemplateCode,
    selectedTemplateTitle: graph.selectedTemplateTitle,
    warnings,
    retainedReferenceBlockCount: graph.blocks.length,
    emittedBlockCount:
      freeformLayoutPlan.copyBlocks.length + freeformLayoutPlan.polishBlocks.length,
    summary,
  };
}

function createObjectNativeDowngradeVerdict(
  runId: string,
  traceId: string,
  applied: boolean,
  reason: string | null,
): StyleDowngradeVerdict {
  return {
    verdictId: createRequestId(),
    runId,
    traceId,
    workflowVariant: "object_native_v1",
    applied,
    reason,
    summary: applied
      ? `Object-native slice downgraded to style-only fallback: ${reason ?? "unknown reason"}.`
      : "Object-native slice retained the native stable path without downgrade.",
  };
}

function buildCandidateScore(
  candidate: TemplatePriorCandidate,
  stableCapable: boolean,
  emittedBlockCount: number,
  retainedReferenceBlockCount: number,
  warningCount: number,
): number {
  const baseScore = Number.isFinite(candidate.score) ? candidate.score * 1000 : 0;
  const rankBonus = Math.max(0, 200 - (candidate.rank - 1) * 40);
  const stableBonus = stableCapable ? 10_000 : 0;
  return Math.round(
    baseScore +
      rankBonus +
      stableBonus +
      emittedBlockCount * 15 +
      retainedReferenceBlockCount * 5 -
      warningCount * 8,
  );
}

function selectWinningEvaluation(
  evaluations: CandidateEvaluation[],
  previousSelectedTemplateCode: string | null,
): CandidateEvaluation | null {
  const stableCapable = evaluations
    .filter((evaluation) => evaluation.entry.readiness === "stable_capable")
    .sort(compareCandidateEvaluations);
  if (stableCapable[0]) {
    return stableCapable[0];
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
    right.entry.score - left.entry.score ||
    left.candidate.rank - right.candidate.rank
  );
}

function buildExecutionBundle(
  templatePriorBundle: TemplatePriorBundle | null,
  candidate: TemplatePriorCandidate | null,
): TemplatePriorBundle | null {
  if (!templatePriorBundle) {
    return null;
  }

  if (!candidate) {
    return templatePriorBundle;
  }

  return {
    ...templatePriorBundle,
    workflowVariant: "object_native_v1",
    selectedTemplateCode: candidate.templateCode,
    selectedTemplateTitle: candidate.title,
    selectedScaffold: candidate.scaffold,
  };
}

function buildReferenceAudit(
  input: HydratedPlanningInput,
  templatePriorBundle: TemplatePriorBundle | null,
  winningEvaluation: CandidateEvaluation | null,
  evaluations: CandidateEvaluation[],
): ObjectNativeReferenceAudit {
  return {
    auditId: createRequestId(),
    runId: input.job.runId,
    traceId: input.job.traceId,
    workflowVariant: "object_native_v1",
    previousSelectedTemplateCode: templatePriorBundle?.selectedTemplateCode ?? null,
    previousSelectedTemplateTitle: templatePriorBundle?.selectedTemplateTitle ?? null,
    nextSelectedTemplateCode: winningEvaluation?.candidate.templateCode ?? null,
    nextSelectedTemplateTitle: winningEvaluation?.candidate.title ?? null,
    entries: evaluations.map((evaluation) => evaluation.entry),
    summary:
      evaluations.length > 0
        ? `Object-native audit evaluated ${evaluations.length} template candidates and retained ${evaluations.filter((evaluation) => evaluation.entry.readiness === "stable_capable").length} stable-capable candidates.`
        : "Object-native audit had no template prior candidates to evaluate.",
  };
}

function buildCandidateSelection(
  input: HydratedPlanningInput,
  templatePriorBundle: TemplatePriorBundle | null,
  winningEvaluation: CandidateEvaluation | null,
): ObjectNativeCandidateSelection {
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
        : winningEvaluation.entry.readiness === "stable_capable"
          ? "original_selection_already_stable_capable"
          : "no_stable_candidate_reused_existing_selection";

  return {
    selectionId: createRequestId(),
    runId: input.job.runId,
    traceId: input.job.traceId,
    workflowVariant: "object_native_v1",
    previousSelectedTemplateCode,
    previousSelectedTemplateTitle,
    nextSelectedTemplateCode,
    nextSelectedTemplateTitle,
    reselectionApplied,
    selectedReadiness: winningEvaluation?.entry.readiness ?? null,
    selectedFailureStage: winningEvaluation?.entry.failureStage ?? "precondition_failure",
    selectedDiagnostics: winningEvaluation?.entry.diagnostics ?? null,
    reason,
    summary:
      nextSelectedTemplateCode
        ? `Object-native selection chose ${nextSelectedTemplateCode}${reselectionApplied ? " after reselection." : " without reselection."}`
        : "Object-native selection could not choose a template candidate.",
  };
}

function buildRenderabilityReport(
  input: HydratedPlanningInput,
  winningEvaluation: CandidateEvaluation | null,
  transformedExecution: Omit<
    BuildObjectNativePathResult,
    | "objectNativeReferenceAudit"
    | "objectNativeCandidateSelection"
    | "objectNativeRenderabilityReport"
  >,
): ObjectNativeRenderabilityReport {
  const compositionStatus =
    transformedExecution.freeformLayoutPlan?.compositionStatus ?? "none";
  const passed =
    compositionStatus === "stable" &&
    transformedExecution.styleDowngradeVerdict?.applied !== true;
  const warnings = uniqueStrings(
    winningEvaluation?.entry.warnings ??
      transformedExecution.qualityEvalSummary?.warnings ??
      [],
  );
  const reason =
    passed
      ? "stable_renderable_candidate_selected"
      : winningEvaluation?.entry.reason ??
        transformedExecution.styleDowngradeVerdict?.reason ??
        "no_renderable_object_native_candidate";
  const failureStage = passed
    ? "none"
    : winningEvaluation?.entry.failureStage ?? "precondition_failure";

  return {
    reportId: createRequestId(),
    runId: input.job.runId,
    traceId: input.job.traceId,
    workflowVariant: "object_native_v1",
    selectedTemplateCode:
      transformedExecution.freeformLayoutPlan?.selectedTemplateCode ?? null,
    selectedTemplateTitle:
      transformedExecution.freeformLayoutPlan?.selectedTemplateTitle ?? null,
    passed,
    failureStage,
    compositionStatus,
    selectedDiagnostics: winningEvaluation?.entry.diagnostics ?? null,
    reason,
    warnings,
    summary: passed
      ? "Object-native execution passed renderability and retained a stable editable composition."
      : "Object-native execution fell back because no stable renderable candidate survived reselection.",
  };
}

function transformResetResult(
  result: ReturnType<typeof buildReferenceResetPath>,
): Omit<
  BuildObjectNativePathResult,
  | "objectNativeReferenceAudit"
  | "objectNativeCandidateSelection"
  | "objectNativeRenderabilityReport"
> {
  return {
    referenceBlockGraph: result.referenceBlockGraph
      ? {
          ...result.referenceBlockGraph,
          workflowVariant: "object_native_v1",
        }
      : null,
    messageAtomPlan: result.messageAtomPlan
      ? {
          ...result.messageAtomPlan,
          workflowVariant: "object_native_v1",
        }
      : null,
    blockBindingPlan: result.blockBindingPlan
      ? {
          ...result.blockBindingPlan,
          workflowVariant: "object_native_v1",
        }
      : null,
    editableBlockPlan: result.editableBlockPlan
      ? {
          ...result.editableBlockPlan,
          workflowVariant: "object_native_v1",
        }
      : null,
    freeformLayoutPlan: result.freeformLayoutPlan
      ? {
          ...result.freeformLayoutPlan,
          workflowVariant: "object_native_v1",
        }
      : null,
    qualityEvalSummary: result.qualityEvalSummary
      ? {
          ...result.qualityEvalSummary,
          workflowVariant: "object_native_v1",
        }
      : null,
    styleDowngradeVerdict: result.styleDowngradeVerdict
      ? {
          ...result.styleDowngradeVerdict,
          workflowVariant: "object_native_v1",
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function buildObjectNativeReadinessDiagnostics(input: {
  graph: ReferenceBlockGraph;
  messageAtomPlan: MessageAtomPlan;
  extractionWarnings: string[];
}): ObjectNativeReadinessDiagnostics {
  const bindingCoverage = buildObjectNativeBindingCoverage(
    input.messageAtomPlan,
    null,
  );
  const renderabilityMetrics = emptyObjectNativeRenderabilityMetrics();
  const diagnostics: ObjectNativeReadinessDiagnostics = {
    missingClusterFamilies: collectMissingObjectNativeClusterFamilies(input.graph),
    textBearingClusterCount: input.graph.blocks.filter((block) =>
      isSupportedObjectNativeClusterKind(block.kind) &&
      isTextBearingObjectNativeCluster(block),
    ).length,
    contentClusterCount: input.graph.blocks.filter((block) =>
      isSupportedObjectNativeClusterKind(block.kind),
    ).length,
    bindingCoverage,
    renderabilityMetrics,
    semanticGateReason: "none",
  };

  return {
    ...diagnostics,
    semanticGateReason: deriveObjectNativeSemanticGateReason(
      diagnostics,
      input.extractionWarnings,
    ),
  };
}

function emptyObjectNativeReadinessDiagnostics(): ObjectNativeReadinessDiagnostics {
  return {
    missingClusterFamilies: [],
    textBearingClusterCount: 0,
    contentClusterCount: 0,
    bindingCoverage: {
      requiredAtomCount: 0,
      boundRequiredAtomCount: 0,
      optionalAtomCount: 0,
      boundOptionalAtomCount: 0,
      missingRequiredAtomKinds: [],
    },
    renderabilityMetrics: emptyObjectNativeRenderabilityMetrics(),
    semanticGateReason: "none",
  };
}

function emptyObjectNativeRenderabilityMetrics(): ObjectNativeRenderabilityMetrics {
  return {
    evaluated: false,
    copyBlockCount: 0,
    polishBlockCount: 0,
    contentBoundsCount: 0,
    offCanvasBlockCount: 0,
    overlappingClusterPairCount: 0,
    decorOcclusionCount: 0,
    warnings: [],
  };
}

function collectMissingObjectNativeClusterFamilies(
  graph: ReferenceBlockGraph,
): ObjectNativeClusterFamily[] {
  const kinds = new Set(graph.blocks.map((block) => block.kind));
  const missing: ObjectNativeClusterFamily[] = [];
  if (!kinds.has("display_text")) {
    missing.push("big_text");
  }
  if (!kinds.has("promo_surface")) {
    missing.push("promo_band");
  }
  if (!kinds.has("action_surface")) {
    missing.push("cta");
  }
  return missing;
}

function isSupportedObjectNativeClusterKind(
  kind: ReferenceBlock["kind"],
): kind is "display_text" | "promo_surface" | "action_surface" {
  return (
    kind === "display_text" ||
    kind === "promo_surface" ||
    kind === "action_surface"
  );
}

function isTextBearingObjectNativeCluster(block: ReferenceBlock): boolean {
  return block.kind === "display_text" || typeof block.sourceText === "string";
}

function buildObjectNativeBindingCoverage(
  atomPlan: MessageAtomPlan,
  blockBindingPlan: BlockBindingPlan | null,
): ObjectNativeBindingCoverage {
  const requiredKinds = atomPlan.atoms
    .map((atom) => atom.kind)
    .filter((kind): kind is "primary" | "offer" | "cta" =>
      kind === "primary" || kind === "offer" || kind === "cta",
    );
  const optionalKinds = atomPlan.atoms
    .map((atom) => atom.kind)
    .filter((kind) => !requiredKinds.includes(kind as "primary" | "offer" | "cta"));
  const atomKindById = new Map(
    atomPlan.atoms.map((atom) => [atom.atomId, atom.kind] as const),
  );
  const boundKinds = new Set(
    (blockBindingPlan?.assignments ?? [])
      .map((assignment) =>
        assignment.atomId ? atomKindById.get(assignment.atomId) ?? null : null,
      )
      .filter((kind): kind is NonNullable<typeof kind> => kind !== null),
  );

  return {
    requiredAtomCount: requiredKinds.length,
    boundRequiredAtomCount: requiredKinds.filter((kind) => boundKinds.has(kind)).length,
    optionalAtomCount: optionalKinds.length,
    boundOptionalAtomCount: optionalKinds.filter((kind) => boundKinds.has(kind)).length,
    missingRequiredAtomKinds: requiredKinds.filter((kind) => !boundKinds.has(kind)),
  };
}

function deriveObjectNativeSemanticGateReason(
  diagnostics: ObjectNativeReadinessDiagnostics,
  extractionWarnings: string[],
): ObjectNativeSemanticGateReason {
  if (diagnostics.missingClusterFamilies.length === 0) {
    return diagnostics.textBearingClusterCount < diagnostics.contentClusterCount
      ? "insufficient_content_bearing_clusters"
      : "none";
  }

  const displayDetectionMiss =
    diagnostics.missingClusterFamilies.includes("big_text") &&
    (extractionWarnings.includes("reference_display_candidate_rejected_as_decorative") ||
      extractionWarnings.includes("reference_display_candidate_found"));

  return displayDetectionMiss ? "detection_miss" : "missing_cluster_family";
}

function buildObjectNativeRenderabilityMetrics(
  freeformLayoutPlan: FreeformLayoutPlan,
  warnings: string[],
  canvasWidth: number,
  canvasHeight: number,
): ObjectNativeRenderabilityMetrics {
  const copyBlocks = freeformLayoutPlan.copyBlocks;
  const polishBlocks = freeformLayoutPlan.polishBlocks;
  const contentBounds = collectObjectNativeContentClusterBounds(copyBlocks);
  let overlappingClusterPairCount = 0;

  for (let leftIndex = 0; leftIndex < contentBounds.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < contentBounds.length;
      rightIndex += 1
    ) {
      if (overlapRatio(contentBounds[leftIndex]!, contentBounds[rightIndex]!) > 0.28) {
        overlappingClusterPairCount += 1;
      }
    }
  }

  return {
    evaluated: true,
    copyBlockCount: copyBlocks.length,
    polishBlockCount: polishBlocks.length,
    contentBoundsCount: contentBounds.length,
    offCanvasBlockCount: [...copyBlocks, ...polishBlocks].filter(
      (block) =>
        block.bounds.x < 0 ||
        block.bounds.y < 0 ||
        block.bounds.x + block.bounds.width > canvasWidth ||
        block.bounds.y + block.bounds.height > canvasHeight,
    ).length,
    overlappingClusterPairCount,
    decorOcclusionCount: polishBlocks.filter((block) =>
      contentBounds.some((bounds) => overlapRatio(bounds, block.bounds) > 0.12),
    ).length,
    warnings: uniqueStrings(warnings),
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

function collectObjectNativeContentClusterBounds(
  copyBlocks: FreeformRenderableBlock[],
): LayoutBounds[] {
  const clusters = new Map<string, LayoutBounds>();

  for (const block of copyBlocks) {
    if (block.executionSlotKey === "footer_note") {
      continue;
    }
    const key =
      block.variantKey.startsWith("object_native_promo_band")
        ? "promo_band_cluster"
        : block.variantKey === "object_native_cta_cluster"
          ? "cta_cluster"
          : block.variantKey === "object_native_big_text"
            ? "big_text_cluster"
            : block.variantKey === "object_native_microtext"
              ? "microtext_cluster"
              : block.blockId;
    const existing = clusters.get(key);
    clusters.set(
      key,
      existing ? mergeBounds(existing, block.bounds) : block.bounds,
    );
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

function resolveObjectNativeClusterLayout(
  copyBlocks: FreeformRenderableBlock[],
  canvasHeight: number,
) {
  const promoBandSurface = copyBlocks.find(
    (block) => block.variantKey === "object_native_promo_band_surface",
  );
  const bigText = copyBlocks.find(
    (block) => block.variantKey === "object_native_big_text",
  );
  const cta = copyBlocks.find(
    (block) => block.variantKey === "object_native_cta_cluster",
  );
  const microtext = copyBlocks.find(
    (block) => block.variantKey === "object_native_microtext",
  );

  if (promoBandSurface && bigText) {
    const desiredTop = promoBandSurface.bounds.y + promoBandSurface.bounds.height + 24;
    if (bigText.bounds.y < desiredTop) {
      bigText.bounds.y = desiredTop;
    }
  }

  if (bigText && cta) {
    const maxBottom = cta.bounds.y - 24;
    if (bigText.bounds.y + bigText.bounds.height > maxBottom) {
      bigText.bounds.height = Math.max(72, maxBottom - bigText.bounds.y);
    }
  }

  if (microtext && cta) {
    const footerTop = Math.max(
      cta.bounds.y + cta.bounds.height + 16,
      canvasHeight - microtext.bounds.height - 18,
    );
    microtext.bounds.y = Math.min(
      footerTop,
      canvasHeight - microtext.bounds.height - 12,
    );
  }
}
