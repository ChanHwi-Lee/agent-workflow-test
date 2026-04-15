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

  const referenceBlockGraph = extractReferenceBlockGraph(
    input.job.runId,
    input.job.traceId,
    selectedTemplateCode,
    selectedTemplateTitle,
    page,
  );
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
  const warnings = collectQualityWarnings(referenceBlockGraph, blockBindingPlan, freeformLayoutPlan);

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
): BuildReferenceResetPathResult {
  const editableBlockPlan = createStyleOnlyEditableBlockPlan(
    input,
    selectedTemplateCode,
    selectedTemplateTitle,
    messageAtomPlan,
    sceneStylePlan,
    sceneBindingPlan,
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
      warnings: [reason],
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

function buildMessageAtomPlan(
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

function extractReferenceBlockGraph(
  runId: string,
  traceId: string,
  selectedTemplateCode: string,
  selectedTemplateTitle: string,
  page: Record<string, unknown>,
): ReferenceBlockGraph {
  const canvasWidth = asNumber(page.width) ?? 1200;
  const canvasHeight = asNumber(page.height) ?? 628;
  const objects = flattenObjects(readObjectArray(page.objects));
  const blocks: ReferenceBlock[] = [];
  const textBlocks = objects
    .filter(isTextLikeObject)
    .map((object) => classifyTextBlock(object, canvasWidth, canvasHeight))
    .filter((block): block is ReferenceBlock => block !== null);
  const surfaces = objects
    .filter((object) => !isTextLikeObject(object))
    .map((object) => classifySurfaceBlock(object, canvasWidth, canvasHeight))
    .filter((block): block is ReferenceBlock => block !== null);
  const decorations = objects
    .filter((object) => !isTextLikeObject(object))
    .map((object) => classifyDecorationBlock(object, canvasWidth, canvasHeight))
    .filter((block): block is ReferenceBlock => block !== null)
    .sort((left, right) => scoreDecorationBlock(right) - scoreDecorationBlock(left));

  const primaryDisplay = [...textBlocks]
    .filter((block) => block.kind === "display_text")
    .sort((left, right) => right.prominence - left.prominence)[0] ?? null;
  const supportText = [...textBlocks]
    .filter((block) => block.kind === "support_text")
    .sort((left, right) => right.prominence - left.prominence)[0] ?? null;
  const detailText = [...textBlocks]
    .filter((block) => block.kind === "detail_text")
    .sort((left, right) => right.prominence - left.prominence)[0] ?? null;
  const promoSurface = [...surfaces]
    .filter((block) => block.kind === "promo_surface")
    .sort((left, right) => right.prominence - left.prominence)[0] ?? null;
  const actionSurface = [...surfaces]
    .filter((block) => block.kind === "action_surface")
    .sort((left, right) => right.prominence - left.prominence)[0] ?? null;

  blocks.push({
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
  });
  if (primaryDisplay) blocks.push(primaryDisplay);
  if (supportText) blocks.push(supportText);
  if (detailText) blocks.push(detailText);
  if (promoSurface) blocks.push(promoSurface);
  if (actionSurface) blocks.push(actionSurface);
  blocks.push(...decorations.slice(0, 3));

  return {
    planId: createRequestId(),
    runId,
    traceId,
    workflowVariant: "retrieval_prior_v2_reset",
    selectedTemplateCode,
    selectedTemplateTitle,
    sourceCanvasWidth: canvasWidth,
    sourceCanvasHeight: canvasHeight,
    blocks,
    summary:
      "Reset reference block graph keeps one dominant display, semantic surfaces, and only safe edge decorations that can survive editable execution.",
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
  bind(findBlock("support_text"), atomByKind.get("support"), "subheadline", "supporting_copy");
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

  for (const block of graph.blocks) {
    const assignment = assignmentByBlockId.get(block.blockId);
    if (!assignment?.text) {
      continue;
    }
    const scaled = scaleBounds(
      block.bounds,
      graph.sourceCanvasWidth,
      graph.sourceCanvasHeight,
      input.request.editorContext.canvasWidth,
      input.request.editorContext.canvasHeight,
    );
    if (block.kind === "promo_surface") {
      const fitted = fitBandBounds(scaled, assignment.text, "promo", input.request.editorContext.canvasWidth);
      blocks.push({
        blockId: `${block.blockId}_surface`,
        stage: "copy",
        layerType: "shape",
        slotKey: null,
        executionSlotKey: null,
        role: "freeform_surface",
        variantKey: "reset_promo_surface",
        candidateId,
        bounds: fitted,
        textContent: null,
        styleTokens: {
          fillColor:
            block.fillColorHex ??
            sceneStylePlan?.palettePolicy.accentColorHex ??
            sceneBindingPlan?.accentTextColorHex ??
            "#d9f99d",
          cornerRadius: Math.round(fitted.height / 2),
          opacity: 0.9,
        },
        clusterZone: block.clusterZone,
      });
      blocks.push(buildTextBlock(candidateId, block, assignment, fitted, sceneStylePlan, sceneBindingPlan, "center"));
      continue;
    }
    if (block.kind === "action_surface") {
      const fitted = fitBandBounds(scaled, assignment.text, "cta", input.request.editorContext.canvasWidth);
      blocks.push({
        blockId: `${block.blockId}_cta`,
        stage: "copy",
        layerType: "group",
        slotKey: "cta",
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
      input.request.editorContext.canvasWidth,
      input.request.editorContext.canvasHeight,
    );
    if (block.layerType === "image" && block.sourceOriginUrl) {
      blocks.push({
        blockId: `${block.blockId}_decor`,
        stage: "polish",
        layerType: "image",
        slotKey: "decoration",
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
        slotKey: "decoration",
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
      slotKey: null,
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

function createStyleOnlyEditableBlockPlan(
  input: HydratedPlanningInput,
  selectedTemplateCode: string,
  selectedTemplateTitle: string,
  messageAtomPlan: MessageAtomPlan | null,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
): EditableBlockPlan {
  const blocks: FreeformRenderableBlock[] = [];
  const atom = (kind: MessageAtom["kind"]) => messageAtomPlan?.atoms.find((entry) => entry.kind === kind) ?? null;
  const primary = atom("primary");
  const offer = atom("offer");
  const cta = atom("cta");
  const detail = atom("detail");
  if (offer) {
    blocks.push({
      blockId: createRequestId(),
      stage: "copy",
      layerType: "shape",
      slotKey: null,
      executionSlotKey: null,
      role: "freeform_surface",
      variantKey: "reset_style_promo_surface",
      candidateId: selectedTemplateCode,
      bounds: { x: 108, y: 122, width: 480, height: 64 },
      textContent: null,
      styleTokens: {
        fillColor:
          sceneStylePlan?.palettePolicy.accentColorHex ??
          sceneBindingPlan?.accentTextColorHex ??
          "#d9f99d",
        cornerRadius: 32,
        opacity: 0.9,
      },
      clusterZone: "center_cluster",
    });
    blocks.push({
      blockId: createRequestId(),
      stage: "copy",
      layerType: "text",
      slotKey: null,
      executionSlotKey: "offer_line",
      role: "price_callout",
      variantKey: "reset_style_promo_text",
      candidateId: selectedTemplateCode,
      bounds: { x: 138, y: 136, width: 420, height: 34 },
      textContent: offer.text,
      fontRole: "display",
      fontSize: 38,
      textAlign: "center",
      styleTokens: {
        fillColor:
          sceneBindingPlan?.accentTextColorHex ??
          sceneStylePlan?.palettePolicy.backgroundColorHex ??
          "#0f7035",
      },
      clusterZone: "center_cluster",
    });
  }
  if (primary) {
    blocks.push({
      blockId: createRequestId(),
      stage: "copy",
      layerType: "text",
      slotKey: "headline",
      executionSlotKey: "headline",
      role: "headline",
      variantKey: "reset_style_headline",
      candidateId: selectedTemplateCode,
      bounds: { x: 84, y: 220, width: 720, height: 180 },
      textContent: primary.text,
      fontRole: "display",
      fontSize: 96,
      textAlign: "left",
      styleTokens: {
        fillColor:
          sceneBindingPlan?.primaryTextColorHex ??
          sceneStylePlan?.palettePolicy.primaryTextColorHex ??
          "#ffffff",
      },
      clusterZone: "center_cluster",
    });
  }
  if (cta) {
    blocks.push({
      blockId: createRequestId(),
      stage: "copy",
      layerType: "group",
      slotKey: "cta",
      executionSlotKey: "cta",
      role: "cta",
      variantKey: "reset_style_cta",
      candidateId: selectedTemplateCode,
      bounds: { x: 252, y: input.request.editorContext.canvasHeight - 132, width: 696, height: 72 },
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
      slotKey: null,
      executionSlotKey: "footer_note",
      role: "footer_note",
      variantKey: "reset_style_footer",
      candidateId: selectedTemplateCode,
      bounds: { x: 260, y: input.request.editorContext.canvasHeight - 36, width: 680, height: 22 },
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
    summary: "Reset candidate downgraded to a style-only editable block plan.",
  };
}

function buildTextBlock(
  candidateId: string,
  block: ReferenceBlock,
  assignment: BlockBindingAssignment,
  bounds: LayoutBounds,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
  textAlign: "left" | "center" | "right",
): FreeformRenderableBlock {
  const fitted = fitTextBounds(assignment.text ?? "", bounds, block.kind);
  return {
    blockId: `${block.blockId}_text`,
    stage: "copy",
    layerType: "text",
    slotKey: toCompatSlotKey(assignment.executionSlotKey),
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
        block.fillColorHex ??
        sceneBindingPlan?.primaryTextColorHex ??
        sceneStylePlan?.palettePolicy.primaryTextColorHex ??
        "#111111",
    },
    clusterZone: block.clusterZone,
  };
}

function toCompatSlotKey(
  executionSlotKey: BlockBindingAssignment["executionSlotKey"],
): FreeformRenderableBlock["slotKey"] {
  switch (executionSlotKey) {
    case "headline":
      return "headline";
    case "subheadline":
      return "supporting_copy";
    case "cta":
      return "cta";
    default:
      return null;
  }
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

function fitBandBounds(
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

function collectQualityWarnings(
  graph: ReferenceBlockGraph,
  blockBindingPlan: BlockBindingPlan,
  freeformLayoutPlan: FreeformLayoutPlan,
): string[] {
  const warnings: string[] = [];
  if (!graph.blocks.some((block) => block.kind === "display_text")) {
    warnings.push("reference graph retained no dominant display block");
  }
  if (!freeformLayoutPlan.copyBlocks.some((block) => block.executionSlotKey === "headline")) {
    warnings.push("editable block plan emitted no headline block");
  }
  if (blockBindingPlan.droppedAtomIds.length > 0) {
    warnings.push(`dropped ${blockBindingPlan.droppedAtomIds.length} optional message atoms`);
  }
  return warnings;
}

function readFirstParsedPage(
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
  const fontSize = asNumber(object.fontSize);
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
  if (areaRatio < 0.001 || areaRatio > 0.08) {
    return null;
  }
  const zone = resolveClusterZone(bounds, canvasWidth, canvasHeight);
  if (zone !== "top_corner" && zone !== "bottom_strip" && zone !== "right_cluster") {
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
  if (bounds.y < canvasHeight * 0.18 && (fontSize ?? 0) <= 34) {
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

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function scaleBounds(
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
): { passed: boolean; reason: string | null } {
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
      reason: "Reference had no usable dominant display block; reset path downgraded to style-only.",
    };
  }
  if (textBlocks.length < 1) {
    return {
      passed: false,
      reason: "Reference retained no bindable text blocks; reset path downgraded to style-only.",
    };
  }
  if (semanticSurfaces.length < 1) {
    return {
      passed: false,
      reason: "Reference retained no semantic promo/CTA surface; reset path downgraded to style-only.",
    };
  }
  if (retainedBlocks.length < 3) {
    return {
      passed: false,
      reason: "Reference retained too few safe blocks for composition mode; reset path downgraded to style-only.",
    };
  }
  return { passed: true, reason: null };
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
