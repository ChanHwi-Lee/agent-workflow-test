import { createRequestId } from "@tooldi/agent-domain";

import type {
  BlockBindingAssignment,
  BlockBindingPlan,
  ConcreteLayoutClusterZone,
  CopyPlan,
  EditableBlockPlan,
  FreeformLayoutPlan,
  FreeformRenderableBlock,
  HydratedPlanningInput,
  LayoutBounds,
  MessageAtom,
  MessageAtomPlan,
  QualityEvalSummary,
  ReferenceBlock,
  ReferenceBlockGraph,
  SceneBindingPlan,
  SceneStylePlan,
  StyleDowngradeVerdict,
  TemplatePriorBundle,
} from "../types.js";
import { deriveGenericPromoHeadline } from "./copyAbstractLayoutPlanningShared.js";
import { deriveWorkflowVariant } from "./planningContext.js";

type CanvasObject = Record<string, unknown>;

interface ExtractionAnalysisResult {
  referenceBlockGraph: ReferenceBlockGraph;
  warnings: string[];
}

interface RawReferenceCandidates {
  textBlocks: ReferenceBlock[];
  explicitSurfaces: ReferenceBlock[];
  inferredSurfaces: ReferenceBlock[];
  decorations: ReferenceBlock[];
}

interface CanonicalDisplaySelection {
  block: ReferenceBlock | null;
  foundCandidate: boolean;
  rejectedDecorativeCandidate: boolean;
}

interface CanonicalSurfaceSelection {
  block: ReferenceBlock | null;
  source: "explicit" | "implicit" | null;
}

interface BuildReferenceResetPathResult {
  referenceBlockGraph: ReferenceBlockGraph | null;
  messageAtomPlan: MessageAtomPlan | null;
  blockBindingPlan: BlockBindingPlan | null;
  editableBlockPlan: EditableBlockPlan | null;
  freeformLayoutPlan: FreeformLayoutPlan | null;
  qualityEvalSummary: QualityEvalSummary | null;
  styleDowngradeVerdict: StyleDowngradeVerdict | null;
}

export function buildReferenceResetPath(
  input: HydratedPlanningInput,
  templatePriorBundle: TemplatePriorBundle | null,
  copyPlan: CopyPlan | null,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
): BuildReferenceResetPathResult {
  if (deriveWorkflowVariant(input) !== "retrieval_prior_v2_reset") {
    return emptyResult();
  }

  const selectedTemplateCode = templatePriorBundle?.selectedTemplateCode ?? null;
  const selectedTemplateTitle = templatePriorBundle?.selectedTemplateTitle ?? null;
  const primaryCandidate =
    selectedTemplateCode && templatePriorBundle
      ? templatePriorBundle.candidates.find(
          (candidate) => candidate.templateCode === selectedTemplateCode,
        ) ?? null
      : null;
  const page = readFirstParsedPage(primaryCandidate?.fetchedDocument ?? null);
  const messageAtomPlan = buildMessageAtomPlan(
    input.request.userInput.prompt,
    copyPlan,
    input.job.runId,
    input.job.traceId,
  );

  if (!selectedTemplateCode || !selectedTemplateTitle || !messageAtomPlan) {
    return buildStyleOnlyResult(
      input,
      selectedTemplateCode ?? "template_unknown",
      selectedTemplateTitle ?? "style only",
      messageAtomPlan,
      sceneStylePlan,
      sceneBindingPlan,
      "No usable primary template or message atoms were available for retrieval_prior_v2_reset.",
    );
  }

  if (!page) {
    return buildStyleOnlyResult(
      input,
      selectedTemplateCode,
      selectedTemplateTitle,
      messageAtomPlan,
      sceneStylePlan,
      sceneBindingPlan,
      "Selected template had no parsed page payload; downgraded to style-only reset composition.",
    );
  }

  const extractionAnalysis = extractReferenceBlockGraph(
    input.job.runId,
    input.job.traceId,
    selectedTemplateCode,
    selectedTemplateTitle,
    page,
  );
  const referenceBlockGraph = extractionAnalysis.referenceBlockGraph;
  const referenceGate = evaluateStrongReferenceGate(referenceBlockGraph);
  if (!referenceGate.passed) {
    return buildStyleOnlyResult(
      input,
      selectedTemplateCode,
      selectedTemplateTitle,
      messageAtomPlan,
      sceneStylePlan,
      sceneBindingPlan,
      referenceGate.reason ?? "Primary reference was too weak for reset composition mode.",
      referenceBlockGraph,
      [
        ...extractionAnalysis.warnings,
        ...(referenceGate.reasonCode ? [referenceGate.reasonCode] : []),
      ],
    );
  }
  const blockBindingPlan = bindMessageAtomsToReferenceBlocks(
    input.job.runId,
    input.job.traceId,
    referenceBlockGraph,
    messageAtomPlan,
  );
  const editableBlockPlan = buildEditableBlockPlan(
    input,
    referenceBlockGraph,
    blockBindingPlan,
    messageAtomPlan,
    sceneStylePlan,
    sceneBindingPlan,
  );
  const stableRenderableValidation = validateStableRenderablePlan(
    editableBlockPlan,
    input.request.editorContext.canvasWidth,
    input.request.editorContext.canvasHeight,
  );
  if (!stableRenderableValidation.passed) {
    return buildStyleOnlyResult(
      input,
      selectedTemplateCode,
      selectedTemplateTitle,
      messageAtomPlan,
      sceneStylePlan,
      sceneBindingPlan,
      stableRenderableValidation.reason ??
        "Stable candidate failed renderability guard; reset path downgraded to style-only.",
      referenceBlockGraph,
      [
        ...stableRenderableValidation.warnings,
        "downgraded_to_style_only_after_renderability_guard",
      ],
    );
  }
  const freeformLayoutPlan: FreeformLayoutPlan = {
    planId: createRequestId(),
    runId: input.job.runId,
    traceId: input.job.traceId,
    workflowVariant: "retrieval_prior_v2_reset",
    selectedTemplateCode,
    selectedTemplateTitle,
    compositionStatus: editableBlockPlan.compositionStatus,
    copyBlocks: editableBlockPlan.blocks.filter((block) => block.stage === "copy"),
    polishBlocks: editableBlockPlan.blocks.filter((block) => block.stage === "polish"),
    summary:
      "Reset candidate executes editable block plan through the existing freeform carrier.",
  };
  const warnings = collectQualityWarnings(
    referenceBlockGraph,
    blockBindingPlan,
    freeformLayoutPlan,
    sceneBindingPlan,
    extractionAnalysis.warnings,
  );

  return {
    referenceBlockGraph,
    messageAtomPlan,
    blockBindingPlan,
    editableBlockPlan,
    freeformLayoutPlan,
    qualityEvalSummary: {
      summaryId: createRequestId(),
      runId: input.job.runId,
      traceId: input.job.traceId,
      workflowVariant: "retrieval_prior_v2_reset",
      selectedTemplateCode,
      selectedTemplateTitle,
      warnings,
      retainedReferenceBlockCount: referenceBlockGraph.blocks.length,
      emittedBlockCount: freeformLayoutPlan.copyBlocks.length + freeformLayoutPlan.polishBlocks.length,
      summary:
        warnings.length > 0
          ? `Reset candidate emitted ${freeformLayoutPlan.copyBlocks.length + freeformLayoutPlan.polishBlocks.length} blocks with ${warnings.length} quality warnings.`
          : "Reset candidate emitted a stable editable block plan without quality warnings.",
    },
    styleDowngradeVerdict: createDowngradeVerdict(
      input.job.runId,
      input.job.traceId,
      false,
      null,
    ),
  };
}

function emptyResult(): BuildReferenceResetPathResult {
  return {
    referenceBlockGraph: null,
    messageAtomPlan: null,
    blockBindingPlan: null,
    editableBlockPlan: null,
    freeformLayoutPlan: null,
    qualityEvalSummary: null,
    styleDowngradeVerdict: null,
  };
}

function buildStyleOnlyResult(
  input: HydratedPlanningInput,
  selectedTemplateCode: string,
  selectedTemplateTitle: string,
  messageAtomPlan: MessageAtomPlan | null,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
  reason: string,
  referenceBlockGraph: ReferenceBlockGraph | null = null,
  extraWarnings: string[] = [],
): BuildReferenceResetPathResult {
  const editableBlockPlan = createStyleOnlyEditableBlockPlan(
    input,
    selectedTemplateCode,
    selectedTemplateTitle,
    messageAtomPlan,
    sceneStylePlan,
    sceneBindingPlan,
  );
  const warnings = collectStyleOnlyQualityWarnings(
    editableBlockPlan,
    sceneBindingPlan,
    reason,
    extraWarnings,
  );
  return {
    referenceBlockGraph,
    messageAtomPlan,
    blockBindingPlan: null,
    editableBlockPlan,
    freeformLayoutPlan: {
      planId: createRequestId(),
      runId: input.job.runId,
      traceId: input.job.traceId,
      workflowVariant: "retrieval_prior_v2_reset",
      selectedTemplateCode,
      selectedTemplateTitle,
      compositionStatus: "style_only",
      copyBlocks: editableBlockPlan.blocks.filter((block) => block.stage === "copy"),
      polishBlocks: editableBlockPlan.blocks.filter((block) => block.stage === "polish"),
      summary: editableBlockPlan.summary,
    },
    qualityEvalSummary: {
      summaryId: createRequestId(),
      runId: input.job.runId,
      traceId: input.job.traceId,
      workflowVariant: "retrieval_prior_v2_reset",
      selectedTemplateCode,
      selectedTemplateTitle,
      warnings,
      retainedReferenceBlockCount: referenceBlockGraph?.blocks.length ?? 0,
      emittedBlockCount: editableBlockPlan.blocks.length,
      summary: reason,
    },
    styleDowngradeVerdict: createDowngradeVerdict(
      input.job.runId,
      input.job.traceId,
      true,
      reason,
    ),
  };
}

function collectStyleOnlyQualityWarnings(
  editableBlockPlan: EditableBlockPlan,
  sceneBindingPlan: SceneBindingPlan | null,
  reason: string,
  extraWarnings: string[],
): string[] {
  const warnings = [reason, ...extraWarnings];
  const promoTextBlock = editableBlockPlan.blocks.find(
    (block) => block.executionSlotKey === "offer_line",
  );
  if (promoTextBlock?.styleTokens?.widthExpanded === true) {
    warnings.push("promo_band_width_expanded");
  }
  if (
    typeof promoTextBlock?.styleTokens?.wrappedLines === "number" &&
    Number(promoTextBlock.styleTokens.wrappedLines) > 1
  ) {
    warnings.push("promo_wrapped_to_two_lines");
  }
  warnings.push("style_only_simple_readable_layout_applied");
  warnings.push("safe_decor_skipped_due_to_style_only");
  if (sceneBindingPlan?.promoTextColorSource === "contrast_fallback") {
    warnings.push("promo_contrast_fallback_applied");
  }
  const headlineBlock = editableBlockPlan.blocks.find(
    (block) => block.executionSlotKey === "headline",
  );
  if (headlineBlock?.styleTokens?.styleOnlyHeadlineShrunk === true) {
    warnings.push("style_only_headline_shrunk_to_fit");
  }
  return [...new Set(warnings)];
}

export function buildMessageAtomPlan(
  prompt: string,
  copyPlan: CopyPlan | null,
  runId: string,
  traceId: string,
): MessageAtomPlan | null {
  if (!copyPlan) {
    return null;
  }

  const slotText = (key: string) =>
    copyPlan.slots.find((slot) => slot.key === key)?.text.trim() ?? "";
  const atoms: MessageAtom[] = [];
  const pushAtom = (kind: MessageAtom["kind"], text: string, optional: boolean) => {
    const normalized = text.trim();
    if (!normalized) {
      return;
    }
    atoms.push({
      atomId: createRequestId(),
      kind,
      text: normalized,
      optional,
    });
  };

  const normalizedPrompt = normalizePromptForMessageAtoms(prompt);
  const promptHeadline = derivePromptPrimaryMessage(normalizedPrompt, copyPlan);
  const offerText = derivePromptOfferMessage(normalizedPrompt, slotText("offer_line"));
  const ctaText = derivePromptCtaMessage(normalizedPrompt, slotText("cta"));

  pushAtom("primary", promptHeadline, false);
  pushAtom("offer", offerText, true);
  if (shouldCreateSupportAtom(normalizedPrompt, slotText("subheadline"), copyPlan.primaryMessage)) {
    pushAtom("support", slotText("subheadline"), true);
  }
  pushAtom("cta", ctaText, true);
  pushAtom("detail", slotText("footer_note"), true);

  return {
    planId: createRequestId(),
    runId,
    traceId,
    workflowVariant: "retrieval_prior_v2_reset",
    atoms,
    summary:
      "Reset message atom plan derives prompt-native primary/offer/cta/detail atoms and only keeps support text when the prompt shape clearly warrants it.",
  };
}

export function extractReferenceBlockGraph(
  runId: string,
  traceId: string,
  selectedTemplateCode: string,
  selectedTemplateTitle: string,
  page: Record<string, unknown>,
): ExtractionAnalysisResult {
  const canvasWidth = asNumber(page.width) ?? 1200;
  const canvasHeight = asNumber(page.height) ?? 628;
  const warnings: string[] = [];
  const rawCandidates = extractRawReferenceCandidates(page, canvasWidth, canvasHeight);
  const canonicalDisplay = selectCanonicalDisplay(rawCandidates.textBlocks, canvasWidth, canvasHeight);
  const promoSurface = selectCanonicalSurface(
    rawCandidates.explicitSurfaces,
    rawCandidates.inferredSurfaces,
    rawCandidates.textBlocks,
    canvasWidth,
    canvasHeight,
    "promo_surface",
  );
  const actionSurface = selectCanonicalSurface(
    rawCandidates.explicitSurfaces,
    rawCandidates.inferredSurfaces,
    rawCandidates.textBlocks,
    canvasWidth,
    canvasHeight,
    "action_surface",
  );
  const detailText = selectCanonicalDetailText(rawCandidates.textBlocks);
  const decorations = selectCanonicalDecorations(
    rawCandidates.decorations,
    canvasWidth,
    canvasHeight,
  );

  if (canonicalDisplay.foundCandidate) {
    warnings.push("reference_display_candidate_found");
  }
  if (canonicalDisplay.rejectedDecorativeCandidate) {
    warnings.push("reference_display_candidate_rejected_as_decorative");
  }
  if (promoSurface.source === "explicit") {
    warnings.push("explicit_promo_surface_matched");
  } else if (promoSurface.source === "implicit") {
    warnings.push("implicit_promo_surface_inferred");
  }
  if (actionSurface.source === "explicit") {
    warnings.push("explicit_cta_surface_matched");
  } else if (actionSurface.source === "implicit") {
    warnings.push("implicit_cta_surface_inferred");
  }

  const blocks: ReferenceBlock[] = [{
    blockId: createRequestId(),
    kind: "background",
    layerType: "shape",
    bounds: { x: 0, y: 0, width: canvasWidth, height: canvasHeight },
    sourceObjectType: "page",
    sourceObjectId: null,
    sourceText: null,
    fillColorHex: null,
    fontSize: null,
    prominence: canvasWidth * canvasHeight,
    clusterZone: null,
    textAlign: null,
    sourceOriginUrl: null,
    sourceWidth: null,
    sourceHeight: null,
  }];
  if (canonicalDisplay.block) blocks.push(canonicalDisplay.block);
  if (detailText) blocks.push(detailText);
  if (promoSurface.block) blocks.push(promoSurface.block);
  if (actionSurface.block) blocks.push(actionSurface.block);
  blocks.push(...decorations);
  const sanitizedBlocks = sanitizeReferenceBlocksForExecution(
    blocks,
    canvasWidth,
    canvasHeight,
  );

  return {
    referenceBlockGraph: {
      planId: createRequestId(),
      runId,
      traceId,
      workflowVariant: "retrieval_prior_v2_reset",
      selectedTemplateCode,
      selectedTemplateTitle,
      sourceCanvasWidth: canvasWidth,
      sourceCanvasHeight: canvasHeight,
      blocks: sanitizedBlocks,
      summary:
        "Reset reference block graph keeps one dominant display, semantic surfaces, and only safe edge decorations that can survive editable execution.",
    },
    warnings,
  };
}

function extractRawReferenceCandidates(
  page: Record<string, unknown>,
  canvasWidth: number,
  canvasHeight: number,
): RawReferenceCandidates {
  const objects = flattenObjects(readObjectArray(page.objects));
  const textBlocks = objects
    .filter(isTextLikeObject)
    .map((object) => classifyTextBlock(object, canvasWidth, canvasHeight))
    .filter((block): block is ReferenceBlock => block !== null);
  const explicitSurfaces = objects
    .filter((object) => !isTextLikeObject(object))
    .map((object) => classifySurfaceBlock(object, canvasWidth, canvasHeight))
    .filter((block): block is ReferenceBlock => block !== null);
  const inferredSurfaces = inferImplicitSurfaceBlocks(textBlocks, canvasWidth, canvasHeight);
  const decorations = objects
    .filter((object) => !isTextLikeObject(object))
    .map((object) => classifyDecorationBlock(object, canvasWidth, canvasHeight))
    .filter((block): block is ReferenceBlock => block !== null)
    .sort((left, right) => scoreDecorationBlock(right) - scoreDecorationBlock(left));

  return {
    textBlocks,
    explicitSurfaces,
    inferredSurfaces,
    decorations,
  };
}

function bindMessageAtomsToReferenceBlocks(
  runId: string,
  traceId: string,
  graph: ReferenceBlockGraph,
  atomPlan: MessageAtomPlan,
): BlockBindingPlan {
  const assignments: BlockBindingAssignment[] = [];
  const droppedAtomIds = new Set<string>();
  const atomByKind = new Map(atomPlan.atoms.map((atom) => [atom.kind, atom] as const));
  const findBlock = (kind: ReferenceBlock["kind"]) => graph.blocks.find((block) => block.kind === kind) ?? null;
  const bind = (
    block: ReferenceBlock | null,
    atom: MessageAtom | undefined,
    executionSlotKey: BlockBindingAssignment["executionSlotKey"],
    role: string,
  ) => {
    if (!atom) {
      return;
    }
    if (!block) {
      droppedAtomIds.add(atom.atomId);
      return;
    }
    assignments.push({
      blockId: block.blockId,
      atomId: atom.atomId,
      text: atom.text,
      executionSlotKey,
      role,
    });
  };

  bind(findBlock("display_text"), atomByKind.get("primary"), "headline", "headline");
  bind(findBlock("promo_surface"), atomByKind.get("offer"), "offer_line", "price_callout");
  bind(findBlock("action_surface"), atomByKind.get("cta"), "cta", "cta");
  bind(findBlock("detail_text"), atomByKind.get("detail"), "footer_note", "footer_note");

  for (const atom of atomPlan.atoms) {
    if (!assignments.some((assignment) => assignment.atomId === atom.atomId) && atom.optional) {
      droppedAtomIds.add(atom.atomId);
    }
  }

  return {
    planId: createRequestId(),
    runId,
    traceId,
    workflowVariant: "retrieval_prior_v2_reset",
    assignments,
    droppedAtomIds: [...droppedAtomIds],
    summary:
      "Reset block binding uses reference blocks as structure truth and only binds message atoms into retained semantic areas.",
  };
}

function selectCanonicalDisplay(
  textBlocks: ReferenceBlock[],
  canvasWidth: number,
  canvasHeight: number,
): CanonicalDisplaySelection {
  const potentialHeadlineCandidates = textBlocks.filter((block) =>
    isPotentialHeadlineCandidate(block, canvasWidth, canvasHeight),
  );
  const headlineCandidates = potentialHeadlineCandidates.filter((block) =>
    isCanonicalHeadlineCandidate(block, textBlocks, canvasWidth, canvasHeight),
  );
  const foundCandidate = potentialHeadlineCandidates.length > 0;
  const safeCandidates = headlineCandidates
    .filter((block) => isExecutionSafeDisplayBlock(block, canvasWidth, canvasHeight))
    .sort(
      (left, right) =>
        scoreDisplayCandidate(right, canvasWidth, canvasHeight) -
        scoreDisplayCandidate(left, canvasWidth, canvasHeight),
    );
  const block = safeCandidates[0] ? { ...safeCandidates[0], kind: "display_text" as const } : null;
  const rejectedDecorativeCandidate = potentialHeadlineCandidates.some((entry) =>
    looksDecorativeDisplayCue(entry),
  );
  return {
    block,
    foundCandidate,
    rejectedDecorativeCandidate,
  };
}

function selectCanonicalSurface(
  explicitSurfaces: ReferenceBlock[],
  inferredSurfaces: ReferenceBlock[],
  textBlocks: ReferenceBlock[],
  canvasWidth: number,
  canvasHeight: number,
  kind: "promo_surface" | "action_surface",
): CanonicalSurfaceSelection {
  const cue = kind === "promo_surface"
    ? selectPromoCueBlock(textBlocks, canvasWidth, canvasHeight)
    : selectActionCueBlock(textBlocks, canvasWidth, canvasHeight);
  const explicitCandidates = explicitSurfaces
    .filter((block) => block.kind === kind)
    .filter((block) => isCanonicalSurfaceCandidate(block, canvasHeight, kind))
    .sort(
      (left, right) =>
        scoreSurfaceCandidate(right, cue, canvasWidth, canvasHeight, kind) -
        scoreSurfaceCandidate(left, cue, canvasWidth, canvasHeight, kind),
    );
  if (explicitCandidates[0]) {
    return { block: explicitCandidates[0], source: "explicit" };
  }
  const inferredCandidates = inferredSurfaces
    .filter((block) => block.kind === kind)
    .sort((left, right) => right.prominence - left.prominence);
  if (inferredCandidates[0]) {
    return { block: inferredCandidates[0], source: "implicit" };
  }
  return { block: null, source: null };
}

function selectCanonicalDetailText(textBlocks: ReferenceBlock[]): ReferenceBlock | null {
  return (
    [...textBlocks]
      .filter((block) => block.kind === "detail_text")
      .sort((left, right) => right.prominence - left.prominence)[0] ?? null
  );
}

function selectCanonicalDecorations(
  decorations: ReferenceBlock[],
  canvasWidth: number,
  canvasHeight: number,
): ReferenceBlock[] {
  return decorations
    .filter((block) => isExecutionSafeScaledBounds(block.bounds, canvasWidth, canvasHeight, block.kind))
    .slice(0, 1);
}

function buildEditableBlockPlan(
  input: HydratedPlanningInput,
  graph: ReferenceBlockGraph,
  blockBindingPlan: BlockBindingPlan,
  messageAtomPlan: MessageAtomPlan,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
): EditableBlockPlan {
  const blocks: FreeformRenderableBlock[] = [];
  const assignmentByBlockId = new Map(blockBindingPlan.assignments.map((assignment) => [assignment.blockId, assignment] as const));
  const candidateId = graph.selectedTemplateCode;
  const semanticBounds: LayoutBounds[] = [];
  const targetCanvasWidth = input.request.editorContext.canvasWidth;
  const targetCanvasHeight = input.request.editorContext.canvasHeight;

  for (const block of graph.blocks) {
    const assignment = assignmentByBlockId.get(block.blockId);
    if (!assignment?.text) {
      continue;
    }
    const scaled = scaleBounds(
      block.bounds,
      graph.sourceCanvasWidth,
      graph.sourceCanvasHeight,
      targetCanvasWidth,
      targetCanvasHeight,
    );
    if (block.kind === "promo_surface") {
      const fitted = fitPromoBandContent(scaled, assignment.text, targetCanvasWidth);
      semanticBounds.push(fitted.surfaceBounds);
      blocks.push({
        blockId: `${block.blockId}_surface`,
        stage: "copy",
        layerType: "shape",
        executionSlotKey: null,
        role: "freeform_surface",
        variantKey: "reset_promo_surface",
        candidateId,
        bounds: fitted.surfaceBounds,
        textContent: null,
        styleTokens: {
          fillColor:
            sceneBindingPlan?.promoSurfaceColorHex ??
            block.fillColorHex ??
            sceneStylePlan?.palettePolicy.accentColorHex ??
            sceneBindingPlan?.ctaSurfaceColorHex ??
            "#d9f99d",
          cornerRadius: Math.round(fitted.surfaceBounds.height / 2),
          opacity: 0.9,
          widthExpanded: fitted.widthExpanded,
        },
        clusterZone: block.clusterZone,
      });
      blocks.push({
        blockId: `${block.blockId}_text`,
        stage: "copy",
        layerType: "text",
        executionSlotKey: "offer_line",
        role: "price_callout",
        variantKey: `reset_${block.kind}`,
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
          wrappedLines: fitted.wrappedLines,
          widthExpanded: fitted.widthExpanded,
        },
        clusterZone: block.clusterZone,
      });
      continue;
    }
    if (block.kind === "action_surface") {
      const fitted = fitBandBounds(scaled, assignment.text, "cta", targetCanvasWidth);
      semanticBounds.push(fitted);
      blocks.push({
        blockId: `${block.blockId}_cta`,
        stage: "copy",
        layerType: "group",
        executionSlotKey: "cta",
        role: "cta",
        variantKey: "reset_cta_band",
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

    blocks.push(buildTextBlock(candidateId, block, assignment, scaled, sceneStylePlan, sceneBindingPlan, block.textAlign ?? "left"));
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
    if (semanticBounds.some((bounds) => overlapRatio(bounds, scaled) > 0.12)) {
      continue;
    }
    if (block.layerType === "image" && block.sourceOriginUrl) {
      blocks.push({
        blockId: `${block.blockId}_decor`,
        stage: "polish",
        layerType: "image",
        executionSlotKey: null,
        role: "freeform_reference_decor",
        variantKey: "reset_reference_image",
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
    } else {
      blocks.push({
        blockId: `${block.blockId}_decor`,
        stage: "polish",
        layerType: "shape",
        executionSlotKey: null,
        role: "freeform_reference_decor",
        variantKey: "reset_reference_shape",
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
  }

  const detailBound = blocks.some((block) => block.executionSlotKey === "footer_note");
  const detailAtom = messageAtomPlan.atoms.find((atom) => atom.kind === "detail") ?? null;
  if (!detailBound && detailAtom) {
    blocks.push({
      blockId: createRequestId(),
      stage: "copy",
      layerType: "text",
      executionSlotKey: "footer_note",
      role: "footer_note",
      variantKey: "reset_footer_detail",
      candidateId,
      bounds: {
        x: 220,
        y: input.request.editorContext.canvasHeight - 38,
        width: input.request.editorContext.canvasWidth - 440,
        height: 22,
      },
      textContent: detailAtom.text,
      fontRole: "body",
      fontSize: 18,
      textAlign: "center",
      styleTokens: {
        fillColor:
          sceneBindingPlan?.secondaryTextColorHex ??
          sceneStylePlan?.palettePolicy.secondaryTextColorHex ??
          "#ffffff",
      },
      clusterZone: "bottom_strip",
    });
  }

  return {
    planId: createRequestId(),
    runId: input.job.runId,
    traceId: input.job.traceId,
    workflowVariant: "retrieval_prior_v2_reset",
    selectedTemplateCode: graph.selectedTemplateCode,
    selectedTemplateTitle: graph.selectedTemplateTitle,
    compositionStatus: blocks.length > 0 ? "stable" : "style_only",
    blocks,
    summary:
      "Reset editable block plan keeps reference semantic surfaces and variable message atoms without fixed slot topology.",
  };
}

function validateStableRenderablePlan(
  editableBlockPlan: EditableBlockPlan,
  canvasWidth: number,
  canvasHeight: number,
): { passed: boolean; reason: string | null; warnings: string[] } {
  if (editableBlockPlan.compositionStatus !== "stable") {
    return { passed: true, reason: null, warnings: [] };
  }

  const warnings: string[] = [];
  const copyBlocks = editableBlockPlan.blocks.filter((block) => block.stage === "copy");
  const polishBlocks = editableBlockPlan.blocks.filter((block) => block.stage === "polish");
  const headlineBlocks = copyBlocks.filter((block) => block.executionSlotKey === "headline");
  const offerTextBlocks = copyBlocks.filter((block) => block.executionSlotKey === "offer_line");
  const ctaBlocks = copyBlocks.filter((block) => block.executionSlotKey === "cta");
  const footerBlocks = copyBlocks.filter((block) => block.executionSlotKey === "footer_note");
  const supportBlocks = copyBlocks.filter((block) => block.executionSlotKey === "subheadline");
  const promoSurfaceBlocks = copyBlocks.filter(
    (block) => block.variantKey === "reset_promo_surface",
  );

  if (
    headlineBlocks.length > 1 ||
    offerTextBlocks.length > 1 ||
    ctaBlocks.length > 1 ||
    footerBlocks.length > 1 ||
    promoSurfaceBlocks.length > 1 ||
    supportBlocks.length > 0 ||
    polishBlocks.length > 1
  ) {
    warnings.push("stable_candidate_rejected_due_to_unsupported_subset");
  }

  const headline = headlineBlocks[0] ?? null;
  const promoSurface = promoSurfaceBlocks[0] ?? null;
  const offerText = offerTextBlocks[0] ?? null;
  const cta = ctaBlocks[0] ?? null;
  const footer = footerBlocks[0] ?? null;
  const semanticBlocks = [
    ...headlineBlocks,
    ...offerTextBlocks,
    ...ctaBlocks,
    ...footerBlocks,
    ...promoSurfaceBlocks,
  ];

  if (
    semanticBlocks.some(
      (block) => !isBoundsWithinCanvas(block.bounds, canvasWidth, canvasHeight),
    ) ||
    polishBlocks.some((block) => !isBoundsWithinCanvas(block.bounds, canvasWidth, canvasHeight))
  ) {
    warnings.push("stable_candidate_rejected_due_to_off_canvas_bounds");
  }

  if (headline && !isHeadlineBlockRenderable(headline.bounds, canvasWidth, canvasHeight)) {
    warnings.push("stable_candidate_rejected_due_to_off_canvas_bounds");
  }
  if (promoSurface && !isPromoZoneRenderable(promoSurface.bounds, canvasHeight)) {
    warnings.push("stable_candidate_rejected_due_to_zone_conflict");
  }
  if (cta && !isCtaZoneRenderable(cta.bounds, canvasHeight)) {
    warnings.push("stable_candidate_rejected_due_to_zone_conflict");
  }
  if (
    promoSurface &&
    offerText &&
    !isContainedWithin(offerText.bounds, promoSurface.bounds, 8)
  ) {
    warnings.push("stable_candidate_rejected_due_to_zone_conflict");
  }

  const minStackGap = 16;
  if (
    promoSurface &&
    headline &&
    promoSurface.bounds.y + promoSurface.bounds.height + minStackGap > headline.bounds.y
  ) {
    warnings.push("stable_candidate_rejected_due_to_semantic_overlap");
  }
  if (
    headline &&
    cta &&
    headline.bounds.y + headline.bounds.height + minStackGap > cta.bounds.y
  ) {
    warnings.push("stable_candidate_rejected_due_to_semantic_overlap");
  }
  if (cta && footer && cta.bounds.y + cta.bounds.height + 8 > footer.bounds.y) {
    warnings.push("stable_candidate_rejected_due_to_semantic_overlap");
  }

  for (const decor of polishBlocks) {
    if (!isExecutionSafeScaledBounds(decor.bounds, canvasWidth, canvasHeight, "decor_cluster")) {
      warnings.push("stable_candidate_rejected_due_to_off_canvas_bounds");
      continue;
    }
    if (
      decor.clusterZone !== "top_corner" &&
      decor.clusterZone !== "right_cluster" &&
      decor.clusterZone !== "bottom_strip"
    ) {
      warnings.push("stable_candidate_rejected_due_to_zone_conflict");
      continue;
    }
    if (semanticBlocks.some((block) => overlapRatio(block.bounds, decor.bounds) > 0.12)) {
      warnings.push("stable_candidate_rejected_due_to_semantic_overlap");
    }
  }

  const uniqueWarnings = [...new Set(warnings)];
  if (uniqueWarnings.length === 0) {
    return { passed: true, reason: null, warnings: [] };
  }

  return {
    passed: false,
    reason: describeStableGuardFailure(uniqueWarnings),
    warnings: uniqueWarnings,
  };
}

function describeStableGuardFailure(warnings: string[]): string {
  if (warnings.includes("stable_candidate_rejected_due_to_off_canvas_bounds")) {
    return "Stable candidate failed renderability guard due to off-canvas bounds; reset path downgraded to style-only.";
  }
  if (warnings.includes("stable_candidate_rejected_due_to_zone_conflict")) {
    return "Stable candidate failed renderability guard due to zone conflict; reset path downgraded to style-only.";
  }
  if (warnings.includes("stable_candidate_rejected_due_to_semantic_overlap")) {
    return "Stable candidate failed renderability guard due to semantic overlap; reset path downgraded to style-only.";
  }
  if (warnings.includes("stable_candidate_rejected_due_to_unsupported_subset")) {
    return "Stable candidate failed renderability guard due to unsupported stable subset; reset path downgraded to style-only.";
  }
  return "Stable candidate failed renderability guard; reset path downgraded to style-only.";
}

function isBoundsWithinCanvas(
  bounds: LayoutBounds,
  canvasWidth: number,
  canvasHeight: number,
): boolean {
  return (
    bounds.x >= 0 &&
    bounds.y >= 0 &&
    bounds.x + bounds.width <= canvasWidth &&
    bounds.y + bounds.height <= canvasHeight
  );
}

function isHeadlineBlockRenderable(
  bounds: LayoutBounds,
  canvasWidth: number,
  canvasHeight: number,
): boolean {
  const areaRatio = (bounds.width * bounds.height) / Math.max(canvasWidth * canvasHeight, 1);
  return isBoundsWithinCanvas(bounds, canvasWidth, canvasHeight) && areaRatio <= 0.34;
}

function isPromoZoneRenderable(bounds: LayoutBounds, canvasHeight: number): boolean {
  const top = bounds.y;
  const bottom = bounds.y + bounds.height;
  return top >= canvasHeight * 0.06 && bottom <= canvasHeight * 0.42;
}

function isCtaZoneRenderable(bounds: LayoutBounds, canvasHeight: number): boolean {
  const top = bounds.y;
  const bottom = bounds.y + bounds.height;
  return top >= canvasHeight * 0.62 && bottom <= canvasHeight * 0.94;
}

function isContainedWithin(
  inner: LayoutBounds,
  outer: LayoutBounds,
  tolerance: number,
): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

function createStyleOnlyEditableBlockPlan(
  input: HydratedPlanningInput,
  selectedTemplateCode: string,
  selectedTemplateTitle: string,
  messageAtomPlan: MessageAtomPlan | null,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
): EditableBlockPlan {
  const blocks: FreeformRenderableBlock[] = [];
  const canvasWidth = input.request.editorContext.canvasWidth;
  const canvasHeight = input.request.editorContext.canvasHeight;
  const atom = (kind: MessageAtom["kind"]) => messageAtomPlan?.atoms.find((entry) => entry.kind === kind) ?? null;
  const primary = atom("primary");
  const offer = atom("offer");
  const cta = atom("cta");
  const detail = atom("detail");
  const footerBounds: LayoutBounds | null = detail
    ? { x: 260, y: canvasHeight - 36, width: 680, height: 22 }
    : null;
  const ctaBounds: LayoutBounds | null = cta
    ? { x: 252, y: canvasHeight - 132, width: 696, height: 72 }
    : null;
  let promoSurfaceBounds: LayoutBounds | null = null;

  if (offer) {
    const fittedPromo = fitPromoBandContent(
      { x: 108, y: 122, width: 480, height: 64 },
      offer.text,
      canvasWidth,
    );
    promoSurfaceBounds = fittedPromo.surfaceBounds;
    blocks.push({
      blockId: createRequestId(),
      stage: "copy",
      layerType: "shape",
      executionSlotKey: null,
      role: "freeform_surface",
      variantKey: "reset_style_promo_surface",
      candidateId: selectedTemplateCode,
      bounds: fittedPromo.surfaceBounds,
      textContent: null,
      styleTokens: {
        fillColor:
          sceneBindingPlan?.promoSurfaceColorHex ??
          sceneStylePlan?.palettePolicy.accentColorHex ??
          sceneBindingPlan?.ctaSurfaceColorHex ??
          "#d9f99d",
        cornerRadius: 32,
        opacity: 0.9,
        widthExpanded: fittedPromo.widthExpanded,
      },
      clusterZone: "center_cluster",
    });
    blocks.push({
      blockId: createRequestId(),
      stage: "copy",
      layerType: "text",
      executionSlotKey: "offer_line",
      role: "price_callout",
      variantKey: "reset_style_promo_text",
      candidateId: selectedTemplateCode,
      bounds: fittedPromo.textBounds,
      textContent: offer.text,
      fontRole: "display",
      fontSize: fittedPromo.fontSize,
      textAlign: "center",
      styleTokens: {
        fillColor:
          sceneBindingPlan?.promoTextColorHex ??
          sceneBindingPlan?.accentTextColorHex ??
          sceneStylePlan?.palettePolicy.primaryTextColorHex ??
          "#111111",
        wrappedLines: fittedPromo.wrappedLines,
        widthExpanded: fittedPromo.widthExpanded,
      },
      clusterZone: "center_cluster",
    });
  }
  if (primary) {
    const headlineLayout = fitStyleOnlyHeadlineBlock(
      primary.text,
      canvasWidth,
      canvasHeight,
      promoSurfaceBounds,
      ctaBounds,
      footerBounds,
    );
    blocks.push({
      blockId: createRequestId(),
      stage: "copy",
      layerType: "text",
      executionSlotKey: "headline",
      role: "headline",
      variantKey: "reset_style_headline",
      candidateId: selectedTemplateCode,
      bounds: headlineLayout.bounds,
      textContent: primary.text,
      fontRole: "display",
      fontSize: headlineLayout.fontSize,
      textAlign: "left",
      styleTokens: {
        fillColor:
          sceneBindingPlan?.primaryTextColorHex ??
          sceneStylePlan?.palettePolicy.primaryTextColorHex ??
          "#ffffff",
        styleOnlyHeadlineShrunk: headlineLayout.fontSize < 96,
      },
      clusterZone: "center_cluster",
    });
  }
  if (cta) {
    blocks.push({
      blockId: createRequestId(),
      stage: "copy",
      layerType: "group",
      executionSlotKey: "cta",
      role: "cta",
      variantKey: "reset_style_cta",
      candidateId: selectedTemplateCode,
      bounds: ctaBounds ?? { x: 252, y: canvasHeight - 132, width: 696, height: 72 },
      textContent: cta.text,
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
      clusterZone: "bottom_strip",
    });
  }
  if (detail) {
    blocks.push({
      blockId: createRequestId(),
      stage: "copy",
      layerType: "text",
      executionSlotKey: "footer_note",
      role: "footer_note",
      variantKey: "reset_style_footer",
      candidateId: selectedTemplateCode,
      bounds: footerBounds ?? { x: 260, y: canvasHeight - 36, width: 680, height: 22 },
      textContent: detail.text,
      fontRole: "body",
      fontSize: 18,
      textAlign: "center",
      styleTokens: {
        fillColor:
          sceneBindingPlan?.secondaryTextColorHex ??
          sceneStylePlan?.palettePolicy.secondaryTextColorHex ??
          "#ffffff",
      },
      clusterZone: "bottom_strip",
    });
  }
  return {
    planId: createRequestId(),
    runId: input.job.runId,
    traceId: input.job.traceId,
    workflowVariant: "retrieval_prior_v2_reset",
    selectedTemplateCode,
    selectedTemplateTitle,
    compositionStatus: "style_only",
    blocks,
    summary: "Reset candidate downgraded to a simple readable style-only editable block plan.",
  };
}

function fitStyleOnlyHeadlineBlock(
  text: string,
  canvasWidth: number,
  canvasHeight: number,
  promoSurfaceBounds: LayoutBounds | null,
  ctaBounds: LayoutBounds | null,
  footerBounds: LayoutBounds | null,
): { bounds: LayoutBounds; fontSize: number } {
  const left = 84;
  const width = 720;
  const top = promoSurfaceBounds ? promoSurfaceBounds.y + promoSurfaceBounds.height + 28 : 148;
  const lowerBound = ctaBounds
    ? ctaBounds.y - 40
    : footerBounds
      ? footerBounds.y - 56
      : canvasHeight - 72;
  const availableHeight = clampNumber(lowerBound - top, 120, 280);
  const baseBounds: LayoutBounds = {
    x: left,
    y: top,
    width,
    height: availableHeight,
  };
  const fitted = fitTextBounds(text, baseBounds, "display_text");
  return {
    bounds: {
      ...baseBounds,
      height: fitted.bounds.height,
    },
    fontSize: fitted.fontSize,
  };
}

export function buildTextBlock(
  candidateId: string,
  block: ReferenceBlock,
  assignment: BlockBindingAssignment,
  bounds: LayoutBounds,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
  textAlign: "left" | "center" | "right",
): FreeformRenderableBlock {
  const fitted = fitTextBounds(assignment.text ?? "", bounds, block.kind);
  const promoTextColor =
    sceneBindingPlan?.promoTextColorHex ??
    sceneBindingPlan?.accentTextColorHex ??
    sceneStylePlan?.palettePolicy.primaryTextColorHex ??
    "#111111";
  return {
    blockId: `${block.blockId}_text`,
    stage: "copy",
    layerType: "text",
    executionSlotKey: assignment.executionSlotKey,
    role: assignment.role,
    variantKey: `reset_${block.kind}`,
    candidateId,
    bounds: fitted.bounds,
    textContent: assignment.text,
    fontRole: block.kind === "display_text" ? "display" : "body",
    fontSize: fitted.fontSize,
    textAlign,
    styleTokens: {
      fillColor:
        block.kind === "promo_surface"
          ? promoTextColor
          : block.fillColorHex ??
            sceneBindingPlan?.primaryTextColorHex ??
            sceneStylePlan?.palettePolicy.primaryTextColorHex ??
            "#111111",
    },
    clusterZone: block.clusterZone,
  };
}

function fitTextBounds(
  text: string,
  bounds: LayoutBounds,
  kind: ReferenceBlock["kind"],
): { bounds: LayoutBounds; fontSize: number } {
  const targetCharsPerLine = kind === "display_text" ? 7 : kind === "detail_text" ? 28 : 16;
  const lines = Math.max(1, Math.ceil(Math.max(text.length, 1) / targetCharsPerLine));
  const fontSize = Math.max(
    kind === "display_text" ? 48 : kind === "detail_text" ? 16 : 24,
    Math.min(
      kind === "display_text" ? 112 : kind === "detail_text" ? 18 : 42,
      Math.floor(bounds.height / (lines * 1.18)),
    ),
  );
  return {
    bounds,
    fontSize,
  };
}

export function fitBandBounds(
  bounds: LayoutBounds,
  text: string,
  kind: "promo" | "cta",
  canvasWidth: number,
): LayoutBounds {
  const minWidth = kind === "cta" ? 420 : 300;
  const padding = kind === "cta" ? 180 : 120;
  const targetWidth = Math.min(canvasWidth - 120, Math.max(minWidth, text.length * 18 + padding));
  const x = Math.max(48, Math.min(canvasWidth - targetWidth - 48, bounds.x + (bounds.width - targetWidth) / 2));
  return {
    x,
    y: bounds.y,
    width: targetWidth,
    height: bounds.height,
  };
}

export function fitPromoBandContent(
  surfaceBounds: LayoutBounds,
  text: string,
  canvasWidth: number,
): {
  surfaceBounds: LayoutBounds;
  textBounds: LayoutBounds;
  fontSize: number;
  wrappedLines: number;
  widthExpanded: boolean;
} {
  const minFont = 24;
  const maxFont = 42;
  const horizontalPadding = 28;
  const verticalPadding = 12;
  const maxSurfaceWidth = Math.max(300, canvasWidth - 96);
  const maxTextWidth = Math.max(180, maxSurfaceWidth - horizontalPadding * 2);
  let fontSize = maxFont;
  let widthExpanded = false;

  while (
    fontSize > minFont &&
    approximatePromoTextWidth(text, fontSize) > maxTextWidth
  ) {
    fontSize -= 2;
  }

  let wrappedLines = 1;
  let measuredTextWidth = Math.min(maxTextWidth, approximatePromoTextWidth(text, fontSize));

  if (approximatePromoTextWidth(text, fontSize) > maxTextWidth) {
    wrappedLines = 2;
    fontSize = clampNumber(
      Math.floor(
        Math.min(
          surfaceBounds.height / 2.35,
          maxTextWidth / Math.max(text.replace(/\s+/g, "").length * 0.52, 1),
        ),
      ),
      20,
      32,
    );
    measuredTextWidth = Math.min(
      maxTextWidth,
      Math.max(180, Math.ceil(approximatePromoTextWidth(text, fontSize) / 2)),
    );
  }

  const textHeight = estimatePromoRenderedTextHeight(fontSize, wrappedLines);
  const surfaceWidth = clampNumber(
    Math.max(
      surfaceBounds.width,
      Math.round(measuredTextWidth + horizontalPadding * 2),
    ),
    300,
    maxSurfaceWidth,
  );
  const surfaceHeight = Math.max(
    surfaceBounds.height,
    Math.round(textHeight + verticalPadding * 2),
  );
  const fittedSurface: LayoutBounds = {
    x: clampNumber(
      Math.round(surfaceBounds.x + (surfaceBounds.width - surfaceWidth) / 2),
      48,
      canvasWidth - surfaceWidth - 48,
    ),
    y: surfaceBounds.y,
    width: surfaceWidth,
    height: surfaceHeight,
  };
  widthExpanded = fittedSurface.width > surfaceBounds.width;
  const textBounds: LayoutBounds = {
    x: fittedSurface.x + horizontalPadding,
    y: fittedSurface.y + Math.round((fittedSurface.height - textHeight) / 2),
    width: Math.max(160, Math.round(fittedSurface.width - horizontalPadding * 2)),
    height: textHeight,
  };

  return {
    surfaceBounds: fittedSurface,
    textBounds,
    fontSize,
    wrappedLines,
    widthExpanded,
  };
}

function approximatePromoTextWidth(text: string, fontSize: number): number {
  return Math.ceil(text.replace(/\s+/g, "").length * fontSize * 0.88);
}

function estimatePromoRenderedTextHeight(fontSize: number, wrappedLines: number): number {
  const renderedLineHeight = fontSize * 1.13 * 1.13;
  const renderedPadding = fontSize;
  const totalHeight = renderedLineHeight * wrappedLines + renderedPadding;
  return Math.max(Math.ceil(totalHeight), fontSize);
}

function collectQualityWarnings(
  graph: ReferenceBlockGraph,
  blockBindingPlan: BlockBindingPlan,
  freeformLayoutPlan: FreeformLayoutPlan,
  sceneBindingPlan: SceneBindingPlan | null,
  extractionWarnings: string[] = [],
): string[] {
  const warnings: string[] = [...extractionWarnings];
  if (!graph.blocks.some((block) => block.kind === "display_text")) {
    warnings.push("reference graph retained no dominant display block");
  }
  if (!freeformLayoutPlan.copyBlocks.some((block) => block.executionSlotKey === "headline")) {
    warnings.push("editable block plan emitted no headline block");
  }
  if (blockBindingPlan.droppedAtomIds.length > 0) {
    warnings.push(`dropped ${blockBindingPlan.droppedAtomIds.length} optional message atoms`);
  }
  const promoTextBlock = freeformLayoutPlan.copyBlocks.find(
    (block) => block.executionSlotKey === "offer_line",
  );
  if (promoTextBlock?.styleTokens?.widthExpanded === true) {
    warnings.push("promo_band_width_expanded");
  }
  if (
    typeof promoTextBlock?.styleTokens?.wrappedLines === "number" &&
    Number(promoTextBlock.styleTokens.wrappedLines) > 1
  ) {
    warnings.push("promo_wrapped_to_two_lines");
  }
  warnings.push(`safe_decor_retained_count:${freeformLayoutPlan.polishBlocks.length}`);
  if (freeformLayoutPlan.compositionStatus === "style_only") {
    warnings.push("style_only_simple_readable_layout_applied");
    warnings.push("safe_decor_skipped_due_to_style_only");
  } else if (
    freeformLayoutPlan.compositionStatus === "stable" &&
    !graph.blocks.some((block) => block.kind === "decor_cluster") &&
    freeformLayoutPlan.polishBlocks.length === 0
  ) {
    warnings.push("safe_decor_skipped_due_to_no_safe_candidate");
  }
  if (sceneBindingPlan?.promoTextColorSource === "contrast_fallback") {
    warnings.push("promo_contrast_fallback_applied");
  }
  const headlineBlock = freeformLayoutPlan.copyBlocks.find(
    (block) => block.executionSlotKey === "headline",
  );
  if (headlineBlock?.styleTokens?.styleOnlyHeadlineShrunk === true) {
    warnings.push("style_only_headline_shrunk_to_fit");
  }
  return [...new Set(warnings)];
}

export function readFirstParsedPage(
  document: NonNullable<TemplatePriorBundle["candidates"][number]["fetchedDocument"]> | null,
): Record<string, unknown> | null {
  const page = document?.pages[0]?.parsed;
  return page && typeof page === "object" ? page : null;
}

function readObjectArray(value: unknown): CanvasObject[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is CanvasObject => typeof entry === "object" && entry !== null)
    : [];
}

function flattenObjects(objects: CanvasObject[]): CanvasObject[] {
  return objects.flatMap((object) => {
    const children = readObjectArray(object.objects);
    return children.length > 0 ? [object, ...flattenObjects(children)] : [object];
  });
}

function isTextLikeObject(object: CanvasObject): boolean {
  const type = typeof object.type === "string" ? object.type : "";
  return type === "text" || type === "textbox" || type === "i-text";
}

function classifyTextBlock(
  object: CanvasObject,
  canvasWidth: number,
  canvasHeight: number,
): ReferenceBlock | null {
  const bounds = readBounds(object);
  const text = readText(object);
  if (!bounds || !text) {
    return null;
  }
  const fontSize = readEffectiveFontSize(object, bounds);
  if (isMetaTextLike(text, bounds, canvasHeight, fontSize)) {
    return null;
  }
  const area = bounds.width * bounds.height;
  const prominence = (fontSize ?? 0) * 100 + area;
  const clusterZone = resolveClusterZone(bounds, canvasWidth, canvasHeight);
  let kind: ReferenceBlock["kind"] = "support_text";
  if ((fontSize ?? 0) >= 54 || area >= canvasWidth * canvasHeight * 0.08) {
    kind = "display_text";
  } else if (bounds.y >= canvasHeight * 0.78 && (fontSize ?? 0) <= 26) {
    kind = "detail_text";
  }
  return {
    blockId: createRequestId(),
    kind,
    layerType: "text",
    bounds,
    sourceObjectType: typeof object.type === "string" ? object.type : "text",
    sourceObjectId: typeof object.id === "string" ? object.id : null,
    sourceText: text,
    fillColorHex: normalizeHex(readFillColor(object)),
    fontSize,
    prominence,
    clusterZone,
    textAlign: readTextAlign(object),
    sourceOriginUrl: null,
    sourceWidth: null,
    sourceHeight: null,
  };
}

function classifySurfaceBlock(
  object: CanvasObject,
  canvasWidth: number,
  canvasHeight: number,
): ReferenceBlock | null {
  const bounds = readBounds(object);
  if (!bounds) {
    return null;
  }
  const areaRatio = (bounds.width * bounds.height) / Math.max(canvasWidth * canvasHeight, 1);
  const isBandLike =
    bounds.width >= canvasWidth * 0.24 &&
    bounds.width <= canvasWidth * 0.82 &&
    bounds.height >= canvasHeight * 0.05 &&
    bounds.height <= canvasHeight * 0.18;
  if (!isBandLike || areaRatio < 0.01) {
    return null;
  }
  const fill = normalizeHex(readFillColor(object));
  if (fill && isDarkFill(fill)) {
    return null;
  }
  const kind: ReferenceBlock["kind"] =
    bounds.y >= canvasHeight * 0.55 ? "action_surface" : bounds.y <= canvasHeight * 0.45 ? "promo_surface" : "decor_cluster";
  if (kind === "decor_cluster") {
    return null;
  }
  return {
    blockId: createRequestId(),
    kind,
    layerType: normalizeLayerType(object),
    bounds,
    sourceObjectType: typeof object.type === "string" ? object.type : "shape",
    sourceObjectId: typeof object.id === "string" ? object.id : null,
    sourceText: null,
    fillColorHex: fill,
    fontSize: null,
    prominence: bounds.width * bounds.height,
    clusterZone: resolveClusterZone(bounds, canvasWidth, canvasHeight),
    textAlign: null,
    sourceOriginUrl: readSourceUrl(object),
    sourceWidth: asNumber(object.imageWidth),
    sourceHeight: asNumber(object.imageHeight),
  };
}

function classifyDecorationBlock(
  object: CanvasObject,
  canvasWidth: number,
  canvasHeight: number,
): ReferenceBlock | null {
  const bounds = readBounds(object);
  if (!bounds) {
    return null;
  }
  const areaRatio = (bounds.width * bounds.height) / Math.max(canvasWidth * canvasHeight, 1);
  if (areaRatio < 0.001 || areaRatio > 0.14) {
    return null;
  }
  const zone = resolveDecorationZone(bounds, canvasWidth, canvasHeight);
  if (!zone) {
    return null;
  }
  const fill = normalizeHex(readFillColor(object));
  if (fill && isDarkFill(fill)) {
    return null;
  }
  if (normalizeLayerType(object) === "shape" && !fill) {
    return null;
  }
  return {
    blockId: createRequestId(),
    kind: "decor_cluster",
    layerType: normalizeLayerType(object),
    bounds,
    sourceObjectType: typeof object.type === "string" ? object.type : "shape",
    sourceObjectId: typeof object.id === "string" ? object.id : null,
    sourceText: null,
    fillColorHex: fill,
    fontSize: null,
    prominence: bounds.width * bounds.height,
    clusterZone: zone,
    textAlign: null,
    sourceOriginUrl: readSourceUrl(object),
    sourceWidth: asNumber(object.imageWidth),
    sourceHeight: asNumber(object.imageHeight),
  };
}

function resolveDecorationZone(
  bounds: LayoutBounds,
  canvasWidth: number,
  canvasHeight: number,
): ConcreteLayoutClusterZone | null {
  const rightEdge = bounds.x + bounds.width;
  const bottomEdge = bounds.y + bounds.height;
  if (bottomEdge <= canvasHeight * 0.34) {
    return "top_corner";
  }
  if (bounds.y >= canvasHeight * 0.7) {
    return "bottom_strip";
  }
  if (rightEdge >= canvasWidth * 0.72) {
    return "right_cluster";
  }
  return null;
}

function readBounds(object: CanvasObject): LayoutBounds | null {
  const width = asNumber(object.width);
  const height = asNumber(object.height);
  const left = asNumber(object.left) ?? asNumber(object.left_from_zero);
  const top = asNumber(object.top) ?? asNumber(object.top_from_zero);
  if (width === null || height === null || left === null || top === null) {
    return null;
  }
  const originX = typeof object.originX === "string" ? object.originX : "left";
  const originY = typeof object.originY === "string" ? object.originY : "top";
  const x = originX === "center" ? left - width / 2 : originX === "right" ? left - width : left;
  const y = originY === "center" ? top - height / 2 : originY === "bottom" ? top - height : top;
  return { x, y, width, height };
}

function resolveClusterZone(
  bounds: LayoutBounds,
  canvasWidth: number,
  canvasHeight: number,
): ConcreteLayoutClusterZone {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  if (centerY >= canvasHeight * 0.78) {
    return "bottom_strip";
  }
  if (centerX >= canvasWidth * 0.72 && centerY <= canvasHeight * 0.4) {
    return "top_corner";
  }
  if (centerX >= canvasWidth * 0.62) {
    return "right_cluster";
  }
  return "center_cluster";
}

function isMetaTextLike(
  text: string,
  bounds: LayoutBounds,
  canvasHeight: number,
  fontSize: number | null,
): boolean {
  const normalized = text.trim().toUpperCase();
  if (/^\d{1,2}\.\d{1,2}\s*[~-]\s*\d{1,2}\.\d{1,2}$/.test(normalized)) {
    return true;
  }
  const topBand = bounds.y < canvasHeight * 0.18;
  const compactHeight = bounds.height <= canvasHeight * 0.08;
  const compactWidth = bounds.width <= 320;
  const smallFont = fontSize !== null ? fontSize <= 34 : compactHeight;
  if (topBand && smallFont && compactWidth) {
    if (normalized.length <= 18) {
      return true;
    }
    if (normalized.includes("SPRING") || normalized.includes("SALE") || normalized.includes("NEW")) {
      return true;
    }
  }
  return false;
}

function readText(object: CanvasObject): string | null {
  return typeof object.text === "string" && object.text.trim().length > 0 ? object.text.trim() : null;
}

function readEffectiveFontSize(
  object: CanvasObject,
  bounds: LayoutBounds,
): number | null {
  const direct = asNumber(object.fontSize);
  if (direct !== null) {
    return direct;
  }
  const styles = object.styles;
  if (styles && typeof styles === "object") {
    for (const lineStyles of Object.values(styles as Record<string, unknown>)) {
      if (!lineStyles || typeof lineStyles !== "object") {
        continue;
      }
      for (const charStyle of Object.values(lineStyles as Record<string, unknown>)) {
        if (!charStyle || typeof charStyle !== "object") {
          continue;
        }
        const styledSize = asNumber((charStyle as Record<string, unknown>).fontSize);
        if (styledSize !== null) {
          return styledSize;
        }
      }
    }
  }
  if (bounds.height <= 0) {
    return null;
  }
  return Math.max(16, Math.min(160, Math.round(bounds.height * 0.78)));
}

function readFillColor(object: CanvasObject): string | null {
  const fill = object.fill;
  if (typeof fill === "string") {
    return fill;
  }
  if (fill && typeof fill === "object" && "colorStops" in fill && Array.isArray((fill as { colorStops?: unknown[] }).colorStops)) {
    const stops = (fill as { colorStops: Array<{ color?: unknown }> }).colorStops;
    const first = stops.find((entry) => typeof entry?.color === "string");
    return typeof first?.color === "string" ? first.color : null;
  }
  return null;
}

function normalizeHex(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  if (normalized.startsWith("#")) {
    return normalized;
  }
  const rgbMatch =
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+\s*)?\)$/i.exec(
      normalized,
    );
  if (!rgbMatch) {
    return null;
  }
  const channels = rgbMatch.slice(1, 4).map((channel) =>
    Math.max(0, Math.min(255, Number.parseInt(channel ?? "0", 10))),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function readTextAlign(object: CanvasObject): "left" | "center" | "right" | null {
  return object.textAlign === "left" || object.textAlign === "center" || object.textAlign === "right"
    ? object.textAlign
    : null;
}

function readSourceUrl(object: CanvasObject): string | null {
  return typeof object.originSrc === "string"
    ? object.originSrc
    : typeof object.src === "string"
      ? object.src
      : null;
}

function normalizeLayerType(object: CanvasObject): ReferenceBlock["layerType"] {
  const type = typeof object.type === "string" ? object.type : "shape";
  if (type === "image") return "image";
  if (type === "group") return "group";
  if (type === "text" || type === "textbox" || type === "i-text") return "text";
  return "shape";
}

function inferImplicitSurfaceBlocks(
  textBlocks: ReferenceBlock[],
  canvasWidth: number,
  canvasHeight: number,
): ReferenceBlock[] {
  const blocks: ReferenceBlock[] = [];
  const promoCue = textBlocks
    .filter((block) => isPromoCueBlock(block, canvasWidth, canvasHeight))
    .sort((left, right) => right.prominence - left.prominence)[0] ?? null;
  const actionCue = textBlocks
    .filter((block) => isActionCueBlock(block, canvasWidth, canvasHeight))
    .sort((left, right) => right.prominence - left.prominence)[0] ?? null;

  if (promoCue) {
    blocks.push({
      blockId: createRequestId(),
      kind: "promo_surface",
      layerType: "shape",
      bounds: resolveCanonicalSurfaceBounds(promoCue.bounds, canvasWidth, canvasHeight, "promo"),
      sourceObjectType: "synthetic_promo_surface",
      sourceObjectId: promoCue.sourceObjectId,
      sourceText: promoCue.sourceText,
      fillColorHex: null,
      fontSize: null,
      prominence: promoCue.prominence * 0.9,
      clusterZone: promoCue.clusterZone,
      textAlign: promoCue.textAlign,
      sourceOriginUrl: null,
      sourceWidth: null,
      sourceHeight: null,
    });
  }

  if (actionCue) {
    blocks.push({
      blockId: createRequestId(),
      kind: "action_surface",
      layerType: "shape",
      bounds: resolveCanonicalSurfaceBounds(actionCue.bounds, canvasWidth, canvasHeight, "action"),
      sourceObjectType: "synthetic_action_surface",
      sourceObjectId: actionCue.sourceObjectId,
      sourceText: actionCue.sourceText,
      fillColorHex: null,
      fontSize: null,
      prominence: actionCue.prominence * 0.85,
      clusterZone: actionCue.clusterZone,
      textAlign: actionCue.textAlign,
      sourceOriginUrl: null,
      sourceWidth: null,
      sourceHeight: null,
    });
  }

  return blocks;
}

function isPromoCueBlock(
  block: ReferenceBlock,
  canvasWidth: number,
  canvasHeight: number,
): boolean {
  if (!block.sourceText || block.kind !== "support_text") {
    return false;
  }
  const normalized = block.sourceText.replace(/\s+/g, "");
  const inUpperHalf = block.bounds.y + block.bounds.height <= canvasHeight * 0.5;
  const bandLikeWidth = block.bounds.width >= canvasWidth * 0.24;
  const compactHeight = block.bounds.height <= canvasHeight * 0.12;
  return (
    inUpperHalf &&
    bandLikeWidth &&
    compactHeight &&
    (/(할인|혜택|쿠폰|특가|OFF|세일|프로모션|이벤트|최대)/iu.test(normalized) ||
      block.textAlign === "center")
  );
}

function isActionCueBlock(
  block: ReferenceBlock,
  canvasWidth: number,
  canvasHeight: number,
): boolean {
  if (!block.sourceText) {
    return false;
  }
  const normalized = block.sourceText.replace(/\s+/g, "");
  const nearBottom = block.bounds.y >= canvasHeight * 0.45;
  const bandLikeWidth = block.bounds.width >= canvasWidth * 0.24;
  const compactHeight = block.bounds.height <= canvasHeight * 0.12;
  const strongCtaTextCue = /(가기|보기|확인|신청|바로|구매|쇼핑|자세히|예약|문의|▶|→)/iu.test(
    normalized,
  );
  return (
    (nearBottom || strongCtaTextCue) &&
    bandLikeWidth &&
    compactHeight &&
    (strongCtaTextCue || block.textAlign === "center")
  );
}

function resolveCanonicalSurfaceBounds(
  bounds: LayoutBounds,
  canvasWidth: number,
  canvasHeight: number,
  kind: "promo" | "action",
): LayoutBounds {
  const centerX = bounds.x + bounds.width / 2;
  const targetWidth =
    kind === "action"
      ? clampNumber(bounds.width + 144, Math.round(canvasWidth * 0.36), Math.round(canvasWidth * 0.62))
      : clampNumber(bounds.width + 112, Math.round(canvasWidth * 0.28), Math.round(canvasWidth * 0.58));
  const targetHeight =
    kind === "action"
      ? clampNumber(bounds.height + 36, Math.round(canvasHeight * 0.09), Math.round(canvasHeight * 0.12))
      : clampNumber(bounds.height + 28, Math.round(canvasHeight * 0.07), Math.round(canvasHeight * 0.1));
  const x = clampNumber(Math.round(centerX - targetWidth / 2), 48, canvasWidth - targetWidth - 48);
  const y =
    kind === "action"
      ? clampNumber(Math.round(canvasHeight * 0.72), Math.round(canvasHeight * 0.68), Math.round(canvasHeight * 0.8))
      : clampNumber(Math.round(canvasHeight * 0.14), Math.round(canvasHeight * 0.12), Math.round(canvasHeight * 0.24));
  const width = targetWidth;
  const height = targetHeight;
  return { x, y, width, height };
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function scaleBounds(
  bounds: LayoutBounds,
  sourceCanvasWidth: number,
  sourceCanvasHeight: number,
  targetCanvasWidth: number,
  targetCanvasHeight: number,
): LayoutBounds {
  const scaleX = targetCanvasWidth / Math.max(sourceCanvasWidth, 1);
  const scaleY = targetCanvasHeight / Math.max(sourceCanvasHeight, 1);
  return {
    x: Math.round(bounds.x * scaleX),
    y: Math.round(bounds.y * scaleY),
    width: Math.round(bounds.width * scaleX),
    height: Math.round(bounds.height * scaleY),
  };
}

function isPotentialHeadlineCandidate(
  block: ReferenceBlock,
  canvasWidth: number,
  canvasHeight: number,
): boolean {
  if (block.kind === "detail_text") {
    return false;
  }
  if (
    !block.sourceText ||
    isPromoCueBlock(block, canvasWidth, canvasHeight) ||
    isActionCueBlock(block, canvasWidth, canvasHeight)
  ) {
    return false;
  }
  const fontSize = block.fontSize ?? 0;
  const areaRatio =
    (block.bounds.width * block.bounds.height) /
    Math.max(canvasWidth * canvasHeight, 1);
  const lineLikeWidth = block.bounds.width >= canvasWidth * 0.22;
  const readableHeight = block.bounds.height >= canvasHeight * 0.08;
  return fontSize >= 36 || areaRatio >= 0.035 || (lineLikeWidth && readableHeight);
}

function isCanonicalHeadlineCandidate(
  block: ReferenceBlock,
  textBlocks: ReferenceBlock[],
  canvasWidth: number,
  canvasHeight: number,
): boolean {
  if (!isPotentialHeadlineCandidate(block, canvasWidth, canvasHeight)) {
    return false;
  }
  if (looksDecorativeDisplayCue(block)) {
    return false;
  }
  const otherTextOverlap = textBlocks.some(
    (other) => other.blockId !== block.blockId && overlapRatio(other.bounds, block.bounds) > 0.34,
  );
  return !otherTextOverlap;
}

function looksDecorativeDisplayCue(block: ReferenceBlock): boolean {
  const text = block.sourceText?.trim() ?? "";
  const normalized = text.replace(/\s+/g, "");
  const fontSize = block.fontSize ?? 0;
  const aspectRatio = block.bounds.width / Math.max(block.bounds.height, 1);
  const compactWordmark = aspectRatio <= 1.35;
  const hasPromotionalHeadlineCue =
    /(할인|세일|특가|오픈|신상|혜택|이벤트|SALE|OPEN|OFF|NEW)/iu.test(normalized);

  if (hasPromotionalHeadlineCue) {
    return false;
  }
  if (normalized.length <= 2 && block.bounds.height >= 160 && compactWordmark) {
    return true;
  }
  if (
    normalized.length <= 3 &&
    fontSize >= 96 &&
    block.bounds.height >= 180 &&
    compactWordmark
  ) {
    return true;
  }
  return false;
}

function selectPromoCueBlock(
  textBlocks: ReferenceBlock[],
  canvasWidth: number,
  canvasHeight: number,
): ReferenceBlock | null {
  return (
    textBlocks
      .filter((block) => isPromoCueBlock(block, canvasWidth, canvasHeight))
      .sort((left, right) => right.prominence - left.prominence)[0] ?? null
  );
}

function selectActionCueBlock(
  textBlocks: ReferenceBlock[],
  canvasWidth: number,
  canvasHeight: number,
): ReferenceBlock | null {
  return (
    textBlocks
      .filter((block) => isActionCueBlock(block, canvasWidth, canvasHeight))
      .sort((left, right) => right.prominence - left.prominence)[0] ?? null
  );
}

function isCanonicalSurfaceCandidate(
  block: ReferenceBlock,
  canvasHeight: number,
  kind: "promo_surface" | "action_surface",
): boolean {
  if (kind === "promo_surface") {
    return isPromoZoneRenderable(block.bounds, canvasHeight);
  }
  return isCtaZoneRenderable(block.bounds, canvasHeight);
}

function scoreSurfaceCandidate(
  block: ReferenceBlock,
  cue: ReferenceBlock | null,
  canvasWidth: number,
  canvasHeight: number,
  kind: "promo_surface" | "action_surface",
): number {
  let score = block.prominence;
  if (kind === "promo_surface") {
    score += Math.max(0, canvasHeight * 0.3 - block.bounds.y) * 8;
  } else {
    score += Math.max(0, block.bounds.y - canvasHeight * 0.62) * 6;
  }
  if (cue) {
    const cueCenterX = cue.bounds.x + cue.bounds.width / 2;
    const blockCenterX = block.bounds.x + block.bounds.width / 2;
    const centerPenalty = Math.abs(cueCenterX - blockCenterX);
    const containsCue = isContainedWithin(cue.bounds, block.bounds, 24) ? 8000 : 0;
    score += containsCue - centerPenalty * 12;
  } else {
    const centerPenalty = Math.abs(block.bounds.x + block.bounds.width / 2 - canvasWidth / 2);
    score -= centerPenalty * 6;
  }
  return score;
}

function isExecutionSafeDisplayBlock(
  block: ReferenceBlock,
  canvasWidth: number,
  canvasHeight: number,
): boolean {
  const text = block.sourceText?.trim() ?? "";
  const whitespaceSeparated = text.split(/\s+/).filter(Boolean);
  const isSingleWordGlyph = whitespaceSeparated.length <= 1 && text.length <= 2;
  const topBleed = Math.max(0, -block.bounds.y);
  const leftBleed = Math.max(0, -block.bounds.x);
  const rightBleed = Math.max(0, block.bounds.x + block.bounds.width - canvasWidth);
  const areaRatio = (block.bounds.width * block.bounds.height) / Math.max(canvasWidth * canvasHeight, 1);
  const visibleWidth =
    Math.max(0, Math.min(block.bounds.x + block.bounds.width, canvasWidth) - Math.max(block.bounds.x, 0));
  const visibleWidthRatio = visibleWidth / Math.max(block.bounds.width, 1);
  const singleSidedHorizontalBleed =
    (leftBleed > 0 && rightBleed === 0) || (rightBleed > 0 && leftBleed === 0);
  const allowsHeadlineSpillover =
    !isSingleWordGlyph &&
    singleSidedHorizontalBleed &&
    visibleWidthRatio >= 0.22 &&
    topBleed <= canvasHeight * 0.06;

  if (topBleed > canvasHeight * 0.08) {
    return false;
  }
  if (
    (leftBleed > canvasWidth * 0.12 || rightBleed > canvasWidth * 0.12) &&
    !allowsHeadlineSpillover
  ) {
    return false;
  }
  if (areaRatio > 0.22) {
    return false;
  }
  if (isSingleWordGlyph && block.bounds.height >= canvasHeight * 0.24) {
    return false;
  }
  return true;
}

function scoreDisplayCandidate(
  block: ReferenceBlock,
  canvasWidth: number,
  canvasHeight: number,
): number {
  const text = block.sourceText?.trim() ?? "";
  const textLengthBonus = Math.min(text.length, 24) * 200;
  const centerBias = 1 - Math.min(1, Math.abs(block.bounds.x + block.bounds.width / 2 - canvasWidth / 2) / Math.max(canvasWidth / 2, 1));
  const topBleedPenalty = Math.max(0, -block.bounds.y) * 120;
  const areaPenalty = Math.max(0, block.bounds.width * block.bounds.height - canvasWidth * canvasHeight * 0.14) * 0.2;
  return block.prominence + textLengthBonus + centerBias * 10000 - topBleedPenalty - areaPenalty;
}

function sanitizeReferenceBlocksForExecution(
  blocks: ReferenceBlock[],
  canvasWidth: number,
  canvasHeight: number,
): ReferenceBlock[] {
  return blocks.filter((block) => {
    if (block.kind === "background") {
      return true;
    }
    if (block.kind === "decor_cluster") {
      return isExecutionSafeScaledBounds(block.bounds, canvasWidth, canvasHeight, block.kind);
    }
    if (block.kind === "display_text") {
      return isExecutionSafeDisplayBlock(block, canvasWidth, canvasHeight);
    }
    return isExecutionSafeScaledBounds(block.bounds, canvasWidth, canvasHeight, block.kind);
  });
}

export function isExecutionSafeScaledBounds(
  bounds: LayoutBounds,
  canvasWidth: number,
  canvasHeight: number,
  kind: ReferenceBlock["kind"],
): boolean {
  const topBleed = Math.max(0, -bounds.y);
  const leftBleed = Math.max(0, -bounds.x);
  const rightBleed = Math.max(0, bounds.x + bounds.width - canvasWidth);
  const bottomBleed = Math.max(0, bounds.y + bounds.height - canvasHeight);
  if (kind === "decor_cluster") {
    return topBleed <= canvasHeight * 0.05 &&
      leftBleed <= canvasWidth * 0.05 &&
      rightBleed <= canvasWidth * 0.05 &&
      bottomBleed <= canvasHeight * 0.05;
  }
  return topBleed <= canvasHeight * 0.04 &&
    leftBleed <= canvasWidth * 0.04 &&
    rightBleed <= canvasWidth * 0.04 &&
    bottomBleed <= canvasHeight * 0.04;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isDarkFill(fill: string): boolean {
  const match = /^#?([0-9a-f]{6})$/i.exec(fill);
  if (!match) {
    return false;
  }
  const value = match[1];
  if (!value) {
    return false;
  }
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return r + g + b < 96;
}

function createDowngradeVerdict(
  runId: string,
  traceId: string,
  applied: boolean,
  reason: string | null,
): StyleDowngradeVerdict {
  return {
    verdictId: createRequestId(),
    runId,
    traceId,
    workflowVariant: "retrieval_prior_v2_reset",
    applied,
    reason,
    summary: applied
      ? `V2 reset downgraded to style-only generation: ${reason ?? "unknown reason"}.`
      : "V2 reset retained a stable reference-first editable block plan.",
  };
}

function evaluateStrongReferenceGate(
  graph: ReferenceBlockGraph,
): { passed: boolean; reason: string | null; reasonCode: string | null } {
  const retainedBlocks = graph.blocks.filter((block) => block.kind !== "background");
  const textBlocks = retainedBlocks.filter(
    (block) =>
      block.kind === "display_text" ||
      block.kind === "support_text" ||
      block.kind === "detail_text",
  );
  const semanticSurfaces = retainedBlocks.filter(
    (block) =>
      block.kind === "promo_surface" || block.kind === "action_surface",
  );
  if (!retainedBlocks.some((block) => block.kind === "display_text")) {
    return {
      passed: false,
      reason: "Reference had no safe dominant display block; reset path downgraded to style-only.",
      reasonCode: "downgraded_due_to_no_canonical_headline",
    };
  }
  if (textBlocks.length < 1) {
    return {
      passed: false,
      reason: "Reference retained no bindable text blocks; reset path downgraded to style-only.",
      reasonCode: "downgraded_due_to_no_canonical_headline",
    };
  }
  if (semanticSurfaces.length < 1) {
    return {
      passed: false,
      reason: "Reference retained no semantic promo/CTA surface; reset path downgraded to style-only.",
      reasonCode: "downgraded_due_to_missing_semantic_pair",
    };
  }
  if (retainedBlocks.length < 3) {
    return {
      passed: false,
      reason: "Reference retained too few safe blocks for composition mode; reset path downgraded to style-only.",
      reasonCode: "downgraded_due_to_missing_semantic_pair",
    };
  }
  return { passed: true, reason: null, reasonCode: null };
}

function normalizePromptForMessageAtoms(prompt: string): string {
  return prompt
    .replace(/\s+/g, " ")
    .replace(/(배너|광고|템플릿)(를|을)?\s*(만들어줘|제작해줘|만들어 줘|해주세요|해줘)$/u, "")
    .trim();
}

function derivePromptPrimaryMessage(
  normalizedPrompt: string,
  copyPlan: CopyPlan,
): string {
  const slotHeadline =
    copyPlan.slots.find((slot) => slot.key === "headline")?.text.trim() ?? "";
  if (
    slotHeadline &&
    slotHeadline !== copyPlan.primaryMessage &&
    !looksLikeRawRequest(slotHeadline)
  ) {
    return slotHeadline;
  }
  if (!looksLikeRawRequest(copyPlan.primaryMessage)) {
    return copyPlan.primaryMessage.trim();
  }
  return deriveGenericPromoHeadline(normalizedPrompt || copyPlan.primaryMessage);
}

function derivePromptOfferMessage(
  normalizedPrompt: string,
  fallbackOffer: string,
): string {
  if (fallbackOffer) {
    return fallbackOffer;
  }
  if (/(세일|할인|혜택|프로모션|이벤트|특가|off)/iu.test(normalizedPrompt)) {
    return "전 품목 최대 50% 할인";
  }
  return "";
}

function derivePromptCtaMessage(
  normalizedPrompt: string,
  fallbackCta: string,
): string {
  if (fallbackCta) {
    return fallbackCta;
  }
  if (/(세일|할인|혜택|프로모션|이벤트|특가|오픈|new)/iu.test(normalizedPrompt)) {
    return "혜택 보기";
  }
  if (/(구매|쇼핑|예약|신청|확인|보기)/iu.test(normalizedPrompt)) {
    return "자세히 보기";
  }
  return "";
}

function shouldCreateSupportAtom(
  normalizedPrompt: string,
  supportText: string,
  primaryMessage: string,
): boolean {
  if (!supportText) {
    return false;
  }
  if (supportText === primaryMessage.trim()) {
    return false;
  }
  if (normalizedPrompt.length < 18) {
    return false;
  }
  return /[,!?.·]|(지금|이번|새로운|신상|한정|특별|확인)/u.test(normalizedPrompt);
}

function looksLikeRawRequest(text: string): boolean {
  return /(만들어줘|제작해줘|해주세요|배너|광고|템플릿)/u.test(text);
}

function scoreDecorationBlock(block: ReferenceBlock): number {
  let score = block.prominence;
  if (block.layerType === "image") {
    score += 500000;
  } else if (block.layerType === "group") {
    score += 250000;
  }
  if (block.clusterZone === "top_corner") {
    score += 120000;
  } else if (block.clusterZone === "right_cluster") {
    score += 80000;
  } else if (block.clusterZone === "bottom_strip") {
    score += 60000;
  }
  return score;
}

export function overlapRatio(a: LayoutBounds, b: LayoutBounds): number {
  const overlapWidth = Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  );
  const overlapArea = overlapWidth * overlapHeight;
  if (overlapArea <= 0) {
    return 0;
  }
  return overlapArea / Math.max(1, Math.min(a.width * a.height, b.width * b.height));
}
