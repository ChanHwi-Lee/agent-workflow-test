import { createRequestId } from "@tooldi/agent-domain";

import type {
  ConcreteLayoutClusterZone,
  CopyAtom,
  CopyAtomPlan,
  CopyBindingAssignment,
  CopyBindingPlan,
  CopyPlan,
  FreeformLayoutPlan,
  FreeformRenderableBlock,
  HydratedPlanningInput,
  LayoutBounds,
  ReferenceCompositionBlock,
  ReferenceCompositionBlockKind,
  ReferenceCompositionGraph,
  ReferenceCompositionRelation,
  ReferenceSupportEvidence,
  ReferenceSupportEvidenceItem,
  SceneBindingPlan,
  SceneStylePlan,
  StyleDowngradeVerdict,
  TemplatePriorBundle,
  TemplateRemixPlan,
} from "../types.js";
import { deriveWorkflowVariant } from "./planningContext.js";

type CanvasObject = Record<string, unknown>;

interface BuildReferenceCompositionV2Result {
  referenceCompositionGraph: ReferenceCompositionGraph | null;
  referenceSupportEvidence: ReferenceSupportEvidence | null;
  copyAtomPlan: CopyAtomPlan | null;
  copyBindingPlan: CopyBindingPlan | null;
  templateRemixPlan: TemplateRemixPlan | null;
  freeformLayoutPlan: FreeformLayoutPlan | null;
  styleDowngradeVerdict: StyleDowngradeVerdict | null;
}

export function buildReferenceCompositionV2(
  input: HydratedPlanningInput,
  templatePriorBundle: TemplatePriorBundle | null,
  copyPlan: CopyPlan | null,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
): BuildReferenceCompositionV2Result {
  if (deriveWorkflowVariant(input) !== "retrieval_prior_v2") {
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
  const firstPage = readFirstParsedPage(primaryCandidate?.fetchedDocument ?? null);
  const copyAtomPlan = buildCopyAtomPlan(copyPlan);

  if (!selectedTemplateCode || !selectedTemplateTitle || !copyAtomPlan) {
    return {
      ...emptyResult(),
      copyAtomPlan,
      styleDowngradeVerdict: createDowngradeVerdict(
        input.job.runId,
        input.job.traceId,
        true,
        "No usable primary template or copy atoms were available for retrieval_prior_v2.",
      ),
      freeformLayoutPlan: createStyleOnlyFreeformLayoutPlan(
        input,
        selectedTemplateCode ?? "template_unknown",
        selectedTemplateTitle ?? "style only",
        copyAtomPlan,
        sceneStylePlan,
        sceneBindingPlan,
        true,
      ),
    };
  }

  const referenceSupportEvidence = buildReferenceSupportEvidence(
    templatePriorBundle,
    selectedTemplateCode,
  );

  if (!firstPage) {
    return {
      referenceCompositionGraph: null,
      referenceSupportEvidence,
      copyAtomPlan,
      copyBindingPlan: null,
      templateRemixPlan: null,
      freeformLayoutPlan: createStyleOnlyFreeformLayoutPlan(
        input,
        selectedTemplateCode,
        selectedTemplateTitle,
        copyAtomPlan,
        sceneStylePlan,
        sceneBindingPlan,
        true,
      ),
      styleDowngradeVerdict: createDowngradeVerdict(
        input.job.runId,
        input.job.traceId,
        true,
        "Selected template had no parsed page payload; downgraded to style-only composition.",
      ),
    };
  }

  const extracted = extractReferenceCompositionGraph(
    input.job.runId,
    input.job.traceId,
    selectedTemplateCode,
    selectedTemplateTitle,
    primaryCandidate?.fetchedDocument ?? null,
    firstPage,
    sceneStylePlan,
    sceneBindingPlan,
  );
  const copyBindingPlan = bindCopyAtomsToReferenceBlocks(
    input.job.runId,
    input.job.traceId,
    extracted.blocks,
    copyAtomPlan,
  );
  const stableComposition =
    extracted.compositionStatus === "stable" &&
    copyBindingPlan.assignments.some((assignment) => assignment.text);

  return {
    referenceCompositionGraph: extracted,
    referenceSupportEvidence,
    copyAtomPlan,
    copyBindingPlan,
    templateRemixPlan: stableComposition
      ? buildTemplateRemixPlan(
          input.job.runId,
          input.job.traceId,
          selectedTemplateCode,
          selectedTemplateTitle,
          firstPage,
          extracted,
          copyBindingPlan,
        )
      : null,
    freeformLayoutPlan: stableComposition
      ? createStableFreeformLayoutPlan(
          input,
          firstPage,
          extracted,
          copyBindingPlan,
          copyAtomPlan,
          sceneStylePlan,
          sceneBindingPlan,
        )
      : createStyleOnlyFreeformLayoutPlan(
          input,
          selectedTemplateCode,
          selectedTemplateTitle,
          copyAtomPlan,
          sceneStylePlan,
          sceneBindingPlan,
          true,
        ),
    styleDowngradeVerdict: createDowngradeVerdict(
      input.job.runId,
      input.job.traceId,
      !stableComposition,
      stableComposition
        ? null
        : "Reference composition was weak or copy binding produced no usable text assignments; downgraded to style-only composition.",
    ),
  };
}

function emptyResult(): BuildReferenceCompositionV2Result {
  return {
    referenceCompositionGraph: null,
    referenceSupportEvidence: null,
    copyAtomPlan: null,
    copyBindingPlan: null,
    templateRemixPlan: null,
    freeformLayoutPlan: null,
    styleDowngradeVerdict: null,
  };
}

function buildReferenceSupportEvidence(
  templatePriorBundle: TemplatePriorBundle | null,
  selectedTemplateCode: string,
): ReferenceSupportEvidence | null {
  if (!templatePriorBundle) {
    return null;
  }

  const supportReferences: ReferenceSupportEvidenceItem[] = templatePriorBundle.candidates
    .filter(
      (candidate) =>
        candidate.templateCode !== selectedTemplateCode && candidate.keep,
    )
    .slice(0, 3)
    .map((candidate) => ({
      templateCode: candidate.templateCode,
      title: candidate.title,
      score: candidate.score,
      keywordTokens: candidate.keywordTokens,
      layoutModeHint: candidate.scaffold?.layoutModeHint ?? null,
      backgroundMode: candidate.scaffold?.backgroundMode ?? null,
    }));

  return {
    planId: createRequestId(),
    runId: templatePriorBundle.runId,
    traceId: templatePriorBundle.traceId,
    workflowVariant: "retrieval_prior_v2",
    primaryTemplateCode: selectedTemplateCode,
    supportReferences,
    summary:
      supportReferences.length > 0
        ? `Support references reinforce style evidence from ${supportReferences.length} secondary templates.`
        : "No secondary support references were retained for retrieval_prior_v2.",
  };
}

function buildCopyAtomPlan(copyPlan: CopyPlan | null): CopyAtomPlan | null {
  if (!copyPlan) {
    return null;
  }

  const atoms: CopyAtom[] = copyPlan.slots
    .filter((slot) => slot.text.trim().length > 0)
    .map((slot) => ({
      atomId: createRequestId(),
      sourceSlotKey: slot.key,
      text: slot.text.trim(),
      priority: slot.priority,
      preferredKind:
        slot.key === "headline"
          ? "display"
          : slot.key === "cta"
            ? "cta"
            : slot.key === "offer_line" || slot.key === "badge_text"
              ? "promo_band"
              : slot.key === "footer_note"
                ? "detail"
                : "support",
      droppable: slot.key !== "headline",
    }));

  return {
    planId: createRequestId(),
    runId: copyPlan.runId,
    traceId: copyPlan.traceId,
    workflowVariant: "retrieval_prior_v2",
    atoms,
    summary: `Copy atom plan keeps ${atoms.length} flexible atoms for freeform binding.`,
  };
}

function extractReferenceCompositionGraph(
  runId: string,
  traceId: string,
  selectedTemplateCode: string,
  selectedTemplateTitle: string,
  document: TemplatePriorBundle["candidates"][number]["fetchedDocument"] | null,
  page: Record<string, unknown>,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
): ReferenceCompositionGraph {
  const sourceCanvasWidth = resolveSourceCanvasWidth(document, page);
  const sourceCanvasHeight = resolveSourceCanvasHeight(document, page);
  const objects = flattenObjects(readObjectArray(page.objects));
  const textObjects = objects.filter(
    (object) => isTextLikeObject(object) && readText(object).length > 0,
  );
  const rectObjects = objects.filter(isRectLikeObject);
  const bindableTextObjects = textObjects.filter(
    (object) => !isMetaTextLike(object, sourceCanvasWidth, sourceCanvasHeight),
  );
  const companionRectByObject = new Map<CanvasObject, CanvasObject | null>();
  for (const object of bindableTextObjects) {
    companionRectByObject.set(
      object,
      findCompanionSurface(object, rectObjects, sourceCanvasWidth),
    );
  }
  const displaySelection = selectPrimaryAndEchoDisplayObjects(
    bindableTextObjects,
    companionRectByObject,
    sourceCanvasWidth,
    sourceCanvasHeight,
  );
  const blocks: ReferenceCompositionBlock[] = [];
  const relations: ReferenceCompositionRelation[] = [];

  for (const object of bindableTextObjects) {
    const bounds = readBounds(object);
    if (!bounds || bounds.width < 12 || bounds.height < 10) {
      continue;
    }
    const companionRect = companionRectByObject.get(object) ?? null;
    const kind = classifyTextBlock(
      object,
      companionRect,
      displaySelection.primary === object || displaySelection.echo === object,
      sourceCanvasHeight,
    );
    const blockId = createRequestId();
    const companionSurface = companionRect
      ? {
          bounds: readBounds(companionRect)!,
          fillColorHex:
            readColor(companionRect) ??
            sceneStylePlan?.palettePolicy.accentColorHex ??
            sceneBindingPlan?.ctaSurfaceColorHex ??
            null,
          opacity: asNumber(companionRect.opacity),
          cornerRadius:
            asNumber(companionRect.rx) ??
            asNumber(companionRect.ry) ??
            null,
        }
      : null;

    blocks.push({
      blockId,
      layerType: "text",
      kind,
      sourceObjectType: readType(object),
      sourceText: readText(object),
      prominence: estimateTextPriority(object),
      bounds,
      fontSize: asNumber(object.fontSize),
      textAlign: readTextAlign(object),
      fontRole:
        kind === "display" || kind === "promo_band" || kind === "cta"
          ? "display"
          : "body",
      fillColorHex:
        readColor(object) ??
        sceneStylePlan?.palettePolicy.primaryTextColorHex ??
        sceneBindingPlan?.primaryTextColorHex ??
        "#111111",
      clusterZone: determineClusterZone(bounds, sourceCanvasWidth, sourceCanvasHeight),
      companionSurface,
    });

    if (companionSurface) {
      relations.push({
        relationId: createRequestId(),
        fromBlockId: blockId,
        toBlockId: `${blockId}_surface`,
        type: "companion_surface",
      });
    }
  }

  const decorationBlocks = buildDecorationReferenceBlocks(
    objects,
    blocks,
    sourceCanvasWidth,
    sourceCanvasHeight,
    sceneStylePlan,
    sceneBindingPlan,
  );
  blocks.push(...decorationBlocks);

  const sortedTextBlocks = blocks
    .filter((block) => block.layerType === "text")
    .sort((left, right) => left.bounds.y - right.bounds.y);
  for (let index = 1; index < sortedTextBlocks.length; index += 1) {
    relations.push({
      relationId: createRequestId(),
      fromBlockId: sortedTextBlocks[index - 1]!.blockId,
      toBlockId: sortedTextBlocks[index]!.blockId,
      type: "stack_after",
    });
  }

  const compositionStatus =
    sortedTextBlocks.length >= 2 &&
    sortedTextBlocks.some((block) => block.kind === "display")
      ? "stable"
      : "weak";

  return {
    planId: createRequestId(),
    runId,
    traceId,
    workflowVariant: "retrieval_prior_v2",
    selectedTemplateCode,
    selectedTemplateTitle,
    sourceCanvasWidth,
    sourceCanvasHeight,
    compositionStatus,
    blocks,
    relations,
    summary:
      `Reference composition graph extracted ${blocks.length} blocks ` +
      `(${sortedTextBlocks.length} text) from ${selectedTemplateCode} with ${compositionStatus} status.`,
  };
}

function bindCopyAtomsToReferenceBlocks(
  runId: string,
  traceId: string,
  blocks: ReferenceCompositionBlock[],
  copyAtomPlan: CopyAtomPlan,
): CopyBindingPlan {
  const assignments: CopyBindingAssignment[] = [];
  const usedAtomIds = new Set<string>();
  const textBlocks = blocks
    .filter((block) => block.layerType === "text")
    .sort((left, right) => {
      if (left.kind === right.kind) {
        return left.bounds.y - right.bounds.y;
      }
      return bindingRank(left.kind) - bindingRank(right.kind);
    });

  const headlineAtom = selectAtom(copyAtomPlan.atoms, usedAtomIds, ["headline", null], "display");
  const displayBlocks = textBlocks.filter((block) => block.kind === "display");
  const { primaryDisplay, echoDisplay } = selectPrimaryAndEchoDisplayBlocks(displayBlocks);
  if (headlineAtom && primaryDisplay) {
    const headlineSplit = splitHeadlineForDisplayPair(headlineAtom.text, Boolean(echoDisplay));
    assignments.push({
      blockId: primaryDisplay.blockId,
      atomIds: [headlineAtom.atomId],
      text: headlineSplit.primaryText,
      bindingKind: "direct",
      executionSlotKey: "headline",
      role: "headline",
    });
    usedAtomIds.add(headlineAtom.atomId);

    if (echoDisplay) {
      assignments.push({
        blockId: echoDisplay.blockId,
        atomIds: headlineSplit.echoText ? [headlineAtom.atomId] : [],
        text: headlineSplit.echoText,
        bindingKind: headlineSplit.echoText ? "direct" : "omitted",
        executionSlotKey: null,
        role: "freeform_display_text",
      });
    }
  }

  bindByKind(textBlocks, assignments, copyAtomPlan.atoms, usedAtomIds, "promo_band", {
    preferredSlotKeys: ["offer_line", "badge_text", "subheadline"],
    preferredKinds: ["promo_band", "support"],
    semanticRole: "price_callout",
    semanticExecutionSlotKey: "offer_line",
    fallbackRole: "freeform_band_text",
  });
  bindByKind(textBlocks, assignments, copyAtomPlan.atoms, usedAtomIds, "cta", {
    preferredSlotKeys: ["cta", "offer_line"],
    preferredKinds: ["cta", "promo_band"],
    semanticRole: "cta",
    semanticExecutionSlotKey: "cta",
    fallbackRole: "freeform_cta_text",
  });
  bindByKind(textBlocks, assignments, copyAtomPlan.atoms, usedAtomIds, "support", {
    preferredSlotKeys: ["subheadline", "offer_line"],
    preferredKinds: ["support", "promo_band"],
    semanticRole: "subheadline",
    semanticExecutionSlotKey: "subheadline",
    fallbackRole: "freeform_support_text",
  });
  bindByKind(textBlocks, assignments, copyAtomPlan.atoms, usedAtomIds, "detail", {
    preferredSlotKeys: ["footer_note", "subheadline", "badge_text"],
    preferredKinds: ["detail", "support", "promo_band"],
    semanticRole: "footer_note",
    semanticExecutionSlotKey: "footer_note",
    fallbackRole: "freeform_detail_text",
  });

  const assignedBlockIds = new Set(assignments.map((assignment) => assignment.blockId));
  for (const block of textBlocks) {
    if (!assignedBlockIds.has(block.blockId)) {
      assignments.push({
        blockId: block.blockId,
        atomIds: [],
        text: null,
        bindingKind: "omitted",
        executionSlotKey: null,
        role: "freeform_text",
      });
    }
  }

  return {
    planId: createRequestId(),
    runId,
    traceId,
    workflowVariant: "retrieval_prior_v2",
    assignments,
    droppedAtomIds: copyAtomPlan.atoms
      .filter((atom) => !usedAtomIds.has(atom.atomId))
      .map((atom) => atom.atomId),
    summary:
      `Copy binding mapped ${assignments.filter((assignment) => assignment.text).length} ` +
      `reference text blocks and dropped ${copyAtomPlan.atoms.filter((atom) => !usedAtomIds.has(atom.atomId)).length} atoms.`,
  };
}

function bindByKind(
  textBlocks: ReferenceCompositionBlock[],
  assignments: CopyBindingAssignment[],
  atoms: CopyAtom[],
  usedAtomIds: Set<string>,
  blockKind: ReferenceCompositionBlockKind,
  options: {
    preferredSlotKeys: Array<CopyAtom["sourceSlotKey"]>;
    preferredKinds: Array<CopyAtom["preferredKind"]>;
    semanticRole: string;
    semanticExecutionSlotKey: CopyBindingAssignment["executionSlotKey"];
    fallbackRole: string;
  },
): void {
  const targets = textBlocks.filter((block) => block.kind === blockKind);
  let semanticUsed = false;
  for (const block of targets) {
    const atom = selectAtom(atoms, usedAtomIds, options.preferredSlotKeys, ...options.preferredKinds);
    if (!atom) {
      assignments.push({
        blockId: block.blockId,
        atomIds: [],
        text: null,
        bindingKind: "omitted",
        executionSlotKey: null,
        role: options.fallbackRole,
      });
      continue;
    }
    usedAtomIds.add(atom.atomId);
    assignments.push({
      blockId: block.blockId,
      atomIds: [atom.atomId],
      text: atom.text,
      bindingKind: "direct",
      executionSlotKey: !semanticUsed ? options.semanticExecutionSlotKey : null,
      role: !semanticUsed ? options.semanticRole : options.fallbackRole,
    });
    semanticUsed = true;
  }
}

function createStableFreeformLayoutPlan(
  input: HydratedPlanningInput,
  page: Record<string, unknown>,
  graph: ReferenceCompositionGraph,
  copyBindingPlan: CopyBindingPlan,
  copyAtomPlan: CopyAtomPlan,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
): FreeformLayoutPlan {
  const copyBlocks: FreeformRenderableBlock[] = [];
  const polishBlocks: FreeformRenderableBlock[] = [];
  const sourceObjects = flattenObjects(readObjectArray(page.objects));
  const assignmentByBlockId = new Map(
    copyBindingPlan.assignments.map((assignment) => [assignment.blockId, assignment] as const),
  );
  const candidateId = graph.selectedTemplateCode;
  const semanticBandBounds = graph.blocks
    .filter((block) => block.layerType === "text")
    .flatMap((block) => {
      const assignment = assignmentByBlockId.get(block.blockId);
      if (!assignment?.text || !block.companionSurface) {
        return [];
      }
      if (block.kind !== "cta" && block.kind !== "promo_band") {
        return [];
      }
      return [block.companionSurface.bounds];
    });
  const semanticObjectBounds = graph.blocks
    .filter((block) => block.layerType === "text")
    .flatMap((block) =>
      block.companionSurface ? [block.bounds, block.companionSurface.bounds] : [block.bounds],
    );

  for (const block of graph.blocks) {
    if (block.layerType === "text") {
      const assignment = assignmentByBlockId.get(block.blockId);
      if (!assignment?.text) {
        continue;
      }

      const scaledTextBounds = scaleBounds(
        block.bounds,
        graph.sourceCanvasWidth,
        graph.sourceCanvasHeight,
        input.request.editorContext.canvasWidth,
        input.request.editorContext.canvasHeight,
      );
      const preferredFontSize = scaleFontSize(
        block.fontSize,
        graph.sourceCanvasWidth,
        input.request.editorContext.canvasWidth,
        block.kind,
      );
      const fittedTextLayout = fitRenderableTextLayout(
        assignment.text,
        scaledTextBounds,
        preferredFontSize,
        block.kind,
        block.clusterZone,
        input.request.editorContext.canvasWidth,
        input.request.editorContext.canvasHeight,
      );

      if (block.kind === "cta" && block.companionSurface) {
        const scaledSurfaceBounds = scaleBounds(
          block.companionSurface.bounds,
          graph.sourceCanvasWidth,
          graph.sourceCanvasHeight,
          input.request.editorContext.canvasWidth,
          input.request.editorContext.canvasHeight,
        );
        copyBlocks.push({
          blockId: `${block.blockId}_cta_group`,
          stage: "copy",
          layerType: "group",
          executionSlotKey: "cta",
          role: "cta",
          variantKey: "reference_cta_band",
          candidateId,
          bounds: fitSemanticSurfaceBounds(
            scaledSurfaceBounds,
            assignment.text,
            block.kind,
            input.request.editorContext.canvasWidth,
            input.request.editorContext.canvasHeight,
          ),
          textContent: assignment.text,
          fontRole: "display",
          fontSize: null,
          textAlign: "center",
          styleTokens: {
            surfaceColor:
              block.companionSurface.fillColorHex ??
              sceneBindingPlan?.ctaSurfaceColorHex ??
              sceneStylePlan?.palettePolicy.ctaSurfaceColorHex ??
              "#111111",
            textColor:
              sceneBindingPlan?.ctaTextColorHex ??
              sceneStylePlan?.palettePolicy.ctaTextColorHex ??
              "#ffffff",
            ctaShapeLanguage:
              sceneBindingPlan?.ctaShapeLanguage ??
              sceneStylePlan?.ctaShapeLanguage ??
              "band",
          },
          clusterZone: block.clusterZone,
        });
        continue;
      }

      if (block.companionSurface) {
        const scaledSurfaceBounds = scaleBounds(
          block.companionSurface.bounds,
          graph.sourceCanvasWidth,
          graph.sourceCanvasHeight,
          input.request.editorContext.canvasWidth,
          input.request.editorContext.canvasHeight,
        );
        copyBlocks.push({
          blockId: `${block.blockId}_surface`,
          stage: "copy",
          layerType: "shape",
          executionSlotKey: null,
          role: "freeform_surface",
          variantKey: `surface_${block.kind}`,
          candidateId,
          bounds: fitSemanticSurfaceBounds(
            scaledSurfaceBounds,
            assignment.text,
            block.kind,
            input.request.editorContext.canvasWidth,
            input.request.editorContext.canvasHeight,
          ),
          textContent: null,
          styleTokens: {
            fillColor:
              block.companionSurface.fillColorHex ??
              sceneStylePlan?.palettePolicy.accentColorHex ??
              sceneBindingPlan?.accentTextColorHex ??
              "#d9f99d",
            cornerRadius: block.companionSurface.cornerRadius ?? 18,
            opacity: block.companionSurface.opacity ?? 1,
          },
          clusterZone: block.clusterZone,
        });
      }

      copyBlocks.push({
        blockId: `${block.blockId}_text`,
        stage: "copy",
        layerType: "text",
        executionSlotKey: assignment.executionSlotKey,
        role: assignment.role,
        variantKey: `text_${block.kind}`,
        candidateId,
        bounds: fittedTextLayout.bounds,
        textContent: assignment.text,
        fontRole: block.fontRole ?? "body",
        fontSize: fittedTextLayout.fontSize,
        textAlign: block.textAlign ?? "left",
        styleTokens: {
          fillColor:
            block.fillColorHex ??
            sceneStylePlan?.palettePolicy.primaryTextColorHex ??
            sceneBindingPlan?.primaryTextColorHex ??
            "#111111",
        },
        clusterZone: block.clusterZone,
      });
      continue;
    }
  }

  polishBlocks.push(
    ...buildTemplateRemixDecorationBlocks(
      sourceObjects,
      graph,
      semanticBandBounds,
      semanticObjectBounds,
      input.request.editorContext.canvasWidth,
      input.request.editorContext.canvasHeight,
      sceneStylePlan,
      sceneBindingPlan,
      candidateId,
    ),
  );

  const droppedAtomIdSet = new Set(copyBindingPlan.droppedAtomIds);
  const footerAtom = copyAtomPlan.atoms.find(
    (atom) =>
      droppedAtomIdSet.has(atom.atomId) && atom.sourceSlotKey === "footer_note",
  );
  if (
    footerAtom &&
    !copyBlocks.some((block) => block.executionSlotKey === "footer_note")
  ) {
    copyBlocks.push({
      blockId: createRequestId(),
      stage: "copy",
      layerType: "text",
      executionSlotKey: "footer_note",
      role: "footer_note",
      variantKey: "synthetic_detail_footer",
      candidateId,
      bounds: {
        x: Math.round(input.request.editorContext.canvasWidth * 0.3),
        y: input.request.editorContext.canvasHeight - 38,
        width: Math.round(input.request.editorContext.canvasWidth * 0.4),
        height: 22,
      },
      textContent: footerAtom.text,
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
    workflowVariant: "retrieval_prior_v2",
    selectedTemplateCode: graph.selectedTemplateCode,
    selectedTemplateTitle: graph.selectedTemplateTitle,
    compositionStatus: "stable",
    copyBlocks,
    polishBlocks,
    summary:
      `Freeform layout keeps ${copyBlocks.length} copy-stage blocks and ${polishBlocks.length} polish blocks from the primary reference composition.`,
  };
}

function buildTemplateRemixPlan(
  runId: string,
  traceId: string,
  selectedTemplateCode: string,
  selectedTemplateTitle: string,
  page: Record<string, unknown>,
  graph: ReferenceCompositionGraph,
  copyBindingPlan: CopyBindingPlan,
): TemplateRemixPlan {
  const sourceObjects = flattenObjects(readObjectArray(page.objects));
  const decisions: TemplateRemixPlan["decisions"] = [];
  const assignmentBySourceText = new Map(
    graph.blocks
      .filter((block) => block.layerType === "text")
      .map((block) => [
        block.sourceText ?? "",
        copyBindingPlan.assignments.find((assignment) => assignment.blockId === block.blockId) ??
          null,
      ] as const),
  );

  for (const object of sourceObjects) {
    const objectId = typeof object.id === "string" ? object.id : createRequestId();
    if (isTextLikeObject(object)) {
      const text = readText(object);
      if (!text) {
        continue;
      }
      if (
        isMetaTextLike(
          object,
          graph.sourceCanvasWidth,
          graph.sourceCanvasHeight,
        )
      ) {
        decisions.push({
          sourceObjectId: objectId,
          sourceObjectType: readType(object),
          decision: "remove",
          role: null,
          reason: "meta_text_removed",
        });
        continue;
      }
      const assignment = assignmentBySourceText.get(text) ?? null;
      decisions.push({
        sourceObjectId: objectId,
        sourceObjectType: readType(object),
        decision: assignment?.text ? "replace_text" : "remove",
        role: assignment?.role ?? null,
        reason: assignment?.text ? "semantic_text_replaced" : "unused_reference_text_removed",
      });
      continue;
    }

    const bounds = readBounds(object);
    if (!bounds) {
      continue;
    }
    decisions.push({
      sourceObjectId: objectId,
      sourceObjectType: readType(object),
      decision:
        shouldPreserveDecorationObject(
          object,
          bounds,
          graph,
        )
          ? "preserve"
          : "remove",
      role: null,
      reason: shouldPreserveDecorationObject(object, bounds, graph)
        ? "non_text_scaffold_preserved"
        : "conflicting_or_low_value_object_removed",
    });
  }

  return {
    planId: createRequestId(),
    runId,
    traceId,
    workflowVariant: "retrieval_prior_v2",
    selectedTemplateCode,
    selectedTemplateTitle,
    decisions,
    preservedCount: decisions.filter((decision) => decision.decision === "preserve").length,
    removedCount: decisions.filter((decision) => decision.decision === "remove").length,
    replacedTextCount: decisions.filter((decision) => decision.decision === "replace_text").length,
    summary:
      `Template remix preserves ${decisions.filter((decision) => decision.decision === "preserve").length} non-text objects and rewrites ${decisions.filter((decision) => decision.decision === "replace_text").length} semantic text objects from the primary scaffold.`,
  };
}

function buildTemplateRemixDecorationBlocks(
  sourceObjects: CanvasObject[],
  graph: ReferenceCompositionGraph,
  semanticBandBounds: LayoutBounds[],
  semanticObjectBounds: LayoutBounds[],
  targetCanvasWidth: number,
  targetCanvasHeight: number,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
  candidateId: string,
): FreeformRenderableBlock[] {
  const sourceCanvasArea = graph.sourceCanvasWidth * graph.sourceCanvasHeight;

  return sourceObjects
    .filter((object) => !isTextLikeObject(object))
    .map((object) => ({
      object,
      bounds: readBounds(object),
    }))
    .filter(
      (entry): entry is { object: CanvasObject; bounds: LayoutBounds } =>
        Boolean(entry.bounds),
    )
    .filter(({ object, bounds }) => {
      const area = bounds.width * bounds.height;
      if (area <= sourceCanvasArea * 0.0015 || area >= sourceCanvasArea * 0.16) {
        return false;
      }
      if (
        semanticBandBounds.some((semanticBounds) =>
          isSameHorizontalStrip(bounds, semanticBounds),
        ) &&
        isDecorativeBandLike(bounds, graph.sourceCanvasHeight)
      ) {
        return false;
      }
      if (semanticObjectBounds.some((semanticBounds) => overlapRatio(bounds, semanticBounds) > 0.18)) {
        return false;
      }
      return shouldPreserveDecorationObject(object, bounds, graph);
    })
    .sort((left, right) => decorationPriority(right.object, right.bounds, graph) - decorationPriority(left.object, left.bounds, graph))
    .slice(0, 5)
    .map(({ object, bounds }, index) => {
      const scaledBounds = scaleBounds(
        bounds,
        graph.sourceCanvasWidth,
        graph.sourceCanvasHeight,
        targetCanvasWidth,
        targetCanvasHeight,
      );
      const clusterZone = determineClusterZone(bounds, graph.sourceCanvasWidth, graph.sourceCanvasHeight);
      if (readType(object) === "image" && readImageUrl(object)) {
        return {
          blockId: `${typeof object.id === "string" ? object.id : createRequestId()}_image_${index}`,
          stage: "polish",
          layerType: "image",
          executionSlotKey: null,
          role: "reference_decoration_image",
          variantKey: "reference_decoration_image",
          candidateId,
          bounds: scaledBounds,
          textContent: null,
          sourceOriginUrl: readImageUrl(object),
          sourceWidth: asNumber(object.width),
          sourceHeight: asNumber(object.height),
          styleTokens: {
            opacity: asNumber(object.opacity) ?? 1,
            angle: asNumber(object.angle) ?? 0,
            flipX: asBoolean(object.flipX) ?? false,
            flipY: asBoolean(object.flipY) ?? false,
          },
          clusterZone,
        } satisfies FreeformRenderableBlock;
      }

      const gradientColors = readGradientColors(object);
      return {
        blockId: `${typeof object.id === "string" ? object.id : createRequestId()}_shape_${index}`,
        stage: "polish",
        layerType: "shape",
        executionSlotKey: null,
        role: inferDecorationRole({
          blockId: "decoration",
          layerType: "shape",
          kind: "decoration",
          sourceObjectType: readType(object),
          sourceText: null,
          prominence: bounds.width * bounds.height,
          bounds,
          fontSize: null,
          textAlign: null,
          fontRole: null,
          fillColorHex: readColor(object),
          clusterZone,
          companionSurface: null,
        }),
        variantKey: "reference_decoration_shape",
        candidateId,
        bounds: scaledBounds,
        textContent: null,
        styleTokens: {
          fillColor:
            gradientColors?.primary ??
            readColor(object) ??
            sceneStylePlan?.palettePolicy.accentColorHex ??
            sceneBindingPlan?.accentTextColorHex ??
            "#6bd357",
          secondaryColor: gradientColors?.secondary ?? null,
          opacity: asNumber(object.opacity) ?? 1,
          angle: asNumber(object.angle) ?? 0,
          cornerRadius:
            asNumber(object.rx) ?? asNumber(object.ry) ?? inferDecorationRadius({
              blockId: "decoration",
              layerType: "shape",
              kind: "decoration",
              sourceObjectType: readType(object),
              sourceText: null,
              prominence: bounds.width * bounds.height,
              bounds,
              fontSize: null,
              textAlign: null,
              fontRole: null,
              fillColorHex: readColor(object),
              clusterZone,
              companionSurface: null,
            }),
        },
        clusterZone,
      } satisfies FreeformRenderableBlock;
    });
}

function shouldPreserveDecorationObject(
  object: CanvasObject,
  bounds: LayoutBounds,
  graph: ReferenceCompositionGraph,
): boolean {
  const area = bounds.width * bounds.height;
  const clusterZone = determineClusterZone(bounds, graph.sourceCanvasWidth, graph.sourceCanvasHeight);
  if (
    clusterZone !== "top_corner" &&
    clusterZone !== "right_cluster" &&
    clusterZone !== "bottom_strip"
  ) {
    return false;
  }
  if (readType(object) === "image") {
    return (
      Boolean(readImageUrl(object)) &&
      area <= graph.sourceCanvasWidth * graph.sourceCanvasHeight * 0.09
    );
  }
  return !isVeryDarkColor(readColor(object));
}

function decorationPriority(
  object: CanvasObject,
  bounds: LayoutBounds,
  graph: ReferenceCompositionGraph,
): number {
  const clusterZone = determineClusterZone(bounds, graph.sourceCanvasWidth, graph.sourceCanvasHeight);
  const zoneScore =
    clusterZone === "top_corner" ? 3 : clusterZone === "right_cluster" ? 2 : clusterZone === "bottom_strip" ? 1 : 0;
  const imageBonus = readType(object) === "image" ? 2 : 0;
  return zoneScore * 100000 + imageBonus * 10000 + bounds.width * bounds.height;
}

function fitTextFontSize(
  text: string,
  bounds: LayoutBounds,
  preferredFontSize: number,
  kind: ReferenceCompositionBlockKind,
): number {
  const minFontSize = kind === "display" ? 44 : kind === "detail" ? 14 : 20;
  let fontSize = preferredFontSize;
  while (
    fontSize > minFontSize &&
    estimateTextOverflow(text, bounds.width, bounds.height, fontSize)
  ) {
    fontSize -= kind === "display" ? 4 : 2;
  }
  return Math.max(minFontSize, fontSize);
}

function fitRenderableTextLayout(
  text: string,
  initialBounds: LayoutBounds,
  preferredFontSize: number,
  kind: ReferenceCompositionBlockKind,
  clusterZone: ConcreteLayoutClusterZone | null | undefined,
  canvasWidth: number,
  canvasHeight: number,
): { bounds: LayoutBounds; fontSize: number } {
  let bounds = { ...initialBounds };
  let fontSize = fitTextFontSize(text, bounds, preferredFontSize, kind);
  if (!estimateTextOverflow(text, bounds.width, bounds.height, fontSize)) {
    return { bounds, fontSize };
  }

  const maxWidthFactor =
    kind === "display" ? 1.15 : kind === "promo_band" ? 1.1 : kind === "cta" ? 1.08 : 1.04;
  const maxHeightFactor = kind === "display" ? 1.08 : kind === "detail" ? 1.02 : 1.04;
  const maxWidth = Math.round(initialBounds.width * maxWidthFactor);
  const maxHeight = Math.round(initialBounds.height * maxHeightFactor);

  while (
    estimateTextOverflow(text, bounds.width, bounds.height, fontSize) &&
    (bounds.width < maxWidth || bounds.height < maxHeight)
  ) {
    const nextBounds = expandBoundsForCluster(
      bounds,
      Math.min(maxWidth, bounds.width + (kind === "display" ? 24 : kind === "promo_band" ? 18 : 12)),
      Math.min(maxHeight, bounds.height + (kind === "display" ? 14 : 8)),
      clusterZone,
      canvasWidth,
      canvasHeight,
    );
    if (
      nextBounds.x === bounds.x &&
      nextBounds.y === bounds.y &&
      nextBounds.width === bounds.width &&
      nextBounds.height === bounds.height
    ) {
      break;
    }
    bounds = nextBounds;
    fontSize = fitTextFontSize(text, bounds, fontSize, kind);
  }

  return { bounds, fontSize };
}

function fitSemanticSurfaceBounds(
  initialBounds: LayoutBounds,
  text: string,
  kind: ReferenceCompositionBlockKind,
  canvasWidth: number,
  canvasHeight: number,
): LayoutBounds {
  if (kind !== "promo_band" && kind !== "cta") {
    return initialBounds;
  }

  const insetX = kind === "cta" ? 48 : 36;
  const insetY = kind === "cta" ? 18 : 12;
  const labelFontSize = kind === "cta" ? 22 : 32;
  const labelBounds: LayoutBounds = {
    x: initialBounds.x + insetX,
    y: initialBounds.y + insetY,
    width: Math.max(40, initialBounds.width - insetX * 2),
    height: Math.max(20, initialBounds.height - insetY * 2),
  };

  if (!estimateTextOverflow(text, labelBounds.width, labelBounds.height, labelFontSize)) {
    return initialBounds;
  }

  return expandBoundsForCluster(
    initialBounds,
    Math.min(canvasWidth, Math.round(initialBounds.width * (kind === "cta" ? 1.08 : 1.1))),
    initialBounds.height,
    kind === "cta" ? "bottom_strip" : "center_cluster",
    canvasWidth,
    canvasHeight,
  );
}

function expandBoundsForCluster(
  bounds: LayoutBounds,
  targetWidth: number,
  targetHeight: number,
  clusterZone: ConcreteLayoutClusterZone | null | undefined,
  canvasWidth: number,
  canvasHeight: number,
): LayoutBounds {
  const widthDelta = Math.max(0, targetWidth - bounds.width);
  const heightDelta = Math.max(0, targetHeight - bounds.height);
  let x = bounds.x;
  if (widthDelta > 0) {
    if (clusterZone === "right_cluster") {
      x -= widthDelta;
    } else if (clusterZone === "center_cluster" || clusterZone === "bottom_strip") {
      x -= Math.round(widthDelta / 2);
    }
  }
  let y = bounds.y;
  if (heightDelta > 0 && clusterZone === "bottom_strip") {
    y -= Math.round(heightDelta / 2);
  }

  return {
    x: clampNumber(x, 0, Math.max(0, canvasWidth - targetWidth)),
    y: clampNumber(y, 0, Math.max(0, canvasHeight - targetHeight)),
    width: Math.min(targetWidth, canvasWidth),
    height: Math.min(targetHeight, canvasHeight),
  };
}

function estimateTextOverflow(
  text: string,
  width: number,
  height: number,
  fontSize: number,
): boolean {
  const normalized = normalizeText(text);
  const avgCharWidth = fontSize * 0.9;
  const maxCharsPerLine = Math.max(1, Math.floor(width / Math.max(avgCharWidth, 1)));
  const textLength = normalized.length;
  const estimatedLines = Math.max(1, Math.ceil(textLength / Math.max(maxCharsPerLine, 1)));
  const estimatedHeight = estimatedLines * fontSize * 1.13;
  return estimatedHeight > height || textLength * avgCharWidth > width * Math.max(1, estimatedLines);
}

function createStyleOnlyFreeformLayoutPlan(
  input: HydratedPlanningInput,
  selectedTemplateCode: string,
  selectedTemplateTitle: string,
  copyAtomPlan: CopyAtomPlan | null,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
  downgraded: boolean,
): FreeformLayoutPlan {
  const copyBlocks: FreeformRenderableBlock[] = [];
  const polishBlocks: FreeformRenderableBlock[] = [];
  const canvasWidth = input.request.editorContext.canvasWidth;
  const canvasHeight = input.request.editorContext.canvasHeight;
  const atoms = copyAtomPlan?.atoms ?? [];
  const displayAtom = atoms.find((atom) => atom.preferredKind === "display") ?? atoms[0] ?? null;
  const supportAtom = atoms.find((atom) => atom.preferredKind === "support") ?? null;
  const promoAtom = atoms.find((atom) => atom.preferredKind === "promo_band") ?? null;
  const ctaAtom = atoms.find((atom) => atom.preferredKind === "cta") ?? null;
  const detailAtom = atoms.find((atom) => atom.preferredKind === "detail") ?? null;

  if (promoAtom) {
    copyBlocks.push({
      blockId: createRequestId(),
      stage: "copy",
      layerType: "shape",
      executionSlotKey: null,
      role: "freeform_surface",
      variantKey: "style_only_promo_band",
      candidateId: selectedTemplateCode,
      bounds: { x: 84, y: 126, width: 420, height: 64 },
      textContent: null,
      styleTokens: {
        fillColor:
          sceneStylePlan?.palettePolicy.accentColorHex ??
          sceneBindingPlan?.accentTextColorHex ??
          "#d9f99d",
        cornerRadius: 24,
        opacity: 0.9,
      },
      clusterZone: "center_cluster",
    });
    copyBlocks.push({
      blockId: createRequestId(),
      stage: "copy",
      layerType: "text",
      executionSlotKey: "offer_line",
      role: "price_callout",
      variantKey: "style_only_promo_text",
      candidateId: selectedTemplateCode,
      bounds: { x: 108, y: 138, width: 372, height: 40 },
      textContent: promoAtom.text,
      fontRole: "display",
      fontSize: 42,
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

  if (displayAtom) {
    copyBlocks.push({
      blockId: createRequestId(),
      stage: "copy",
      layerType: "text",
      executionSlotKey: "headline",
      role: "headline",
      variantKey: "style_only_display",
      candidateId: selectedTemplateCode,
      bounds: { x: 96, y: 210, width: 640, height: 164 },
      textContent: displayAtom.text,
      fontRole: "display",
      fontSize: 112,
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

  if (supportAtom) {
    copyBlocks.push({
      blockId: createRequestId(),
      stage: "copy",
      layerType: "text",
      executionSlotKey: "subheadline",
      role: "subheadline",
      variantKey: "style_only_support",
      candidateId: selectedTemplateCode,
      bounds: { x: 100, y: 392, width: 520, height: 54 },
      textContent: supportAtom.text,
      fontRole: "body",
      fontSize: 32,
      textAlign: "left",
      styleTokens: {
        fillColor:
          sceneBindingPlan?.secondaryTextColorHex ??
          sceneStylePlan?.palettePolicy.secondaryTextColorHex ??
          "#ffffff",
      },
      clusterZone: "center_cluster",
    });
  }

  if (ctaAtom) {
    copyBlocks.push({
      blockId: createRequestId(),
      stage: "copy",
      layerType: "group",
      executionSlotKey: "cta",
      role: "cta",
      variantKey: "style_only_cta",
      candidateId: selectedTemplateCode,
      bounds: { x: 240, y: canvasHeight - 146, width: 720, height: 72 },
      textContent: ctaAtom.text,
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

  if (detailAtom) {
    copyBlocks.push({
      blockId: createRequestId(),
      stage: "copy",
      layerType: "text",
      executionSlotKey: "footer_note",
      role: "footer_note",
      variantKey: "style_only_footer",
      candidateId: selectedTemplateCode,
      bounds: { x: 360, y: canvasHeight - 42, width: 480, height: 24 },
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

  polishBlocks.push(
    {
      blockId: createRequestId(),
      stage: "polish",
      layerType: "shape",
      executionSlotKey: null,
      role: "freeform_accent_circle",
      variantKey: "style_only_accent",
      candidateId: selectedTemplateCode,
      bounds: { x: 1000, y: 68, width: 96, height: 96 },
      textContent: null,
      styleTokens: {
        fillColor:
          sceneStylePlan?.palettePolicy.accentColorHex ??
          sceneBindingPlan?.accentTextColorHex ??
          "#d9f99d",
        cornerRadius: 48,
        opacity: 0.9,
      },
      clusterZone: "top_corner",
    },
    {
      blockId: createRequestId(),
      stage: "polish",
      layerType: "shape",
      executionSlotKey: null,
      role: "freeform_accent_circle",
      variantKey: "style_only_accent",
      candidateId: selectedTemplateCode,
      bounds: { x: 964, y: 452, width: 124, height: 124 },
      textContent: null,
      styleTokens: {
        fillColor:
          sceneBindingPlan?.ctaSurfaceColorHex ??
          sceneStylePlan?.palettePolicy.accentColorHex ??
          "#6bd357",
        cornerRadius: 62,
        opacity: 0.72,
      },
      clusterZone: "bottom_strip",
    },
  );

  return {
    planId: createRequestId(),
    runId: input.job.runId,
    traceId: input.job.traceId,
    workflowVariant: "retrieval_prior_v2",
    selectedTemplateCode,
    selectedTemplateTitle,
    compositionStatus: downgraded ? "style_only" : "stable",
    copyBlocks,
    polishBlocks,
    summary:
      "Style-only freeform layout keeps V2 inside the same execution path without falling back to V1.",
  };
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
    workflowVariant: "retrieval_prior_v2",
    applied,
    reason,
    summary: applied
      ? `V2 downgraded to style-only generation: ${reason ?? "unknown reason"}.`
      : "V2 retained stable reference composition without style-only downgrade.",
  };
}

function buildDecorationReferenceBlocks(
  objects: CanvasObject[],
  textBlocks: ReferenceCompositionBlock[],
  canvasWidth: number,
  canvasHeight: number,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
): ReferenceCompositionBlock[] {
  const occupiedBounds = textBlocks.map((block) => block.bounds);
  return objects
    .filter((object) => !isTextLikeObject(object))
    .map((object) => ({
      object,
      bounds: readBounds(object),
    }))
    .filter(
      (entry): entry is { object: CanvasObject; bounds: LayoutBounds } =>
        Boolean(entry.bounds),
    )
    .filter(({ object, bounds }) => {
      const area = bounds.width * bounds.height;
      const clusterZone = determineClusterZone(bounds, canvasWidth, canvasHeight);
      if (area <= canvasWidth * canvasHeight * 0.004) {
        return false;
      }
      if (area >= canvasWidth * canvasHeight * 0.35) {
        return false;
      }
      if (
        clusterZone !== "top_corner" &&
        clusterZone !== "right_cluster" &&
        clusterZone !== "bottom_strip"
      ) {
        return false;
      }
      if (
        readType(object) === "image" &&
        area >= canvasWidth * canvasHeight * 0.015 &&
        clusterZone !== "top_corner" &&
        clusterZone !== "bottom_strip"
      ) {
        return false;
      }
      if (isVeryDarkColor(readColor(object))) {
        return false;
      }
      return !occupiedBounds.some((occupied) => overlapRatio(bounds, occupied) > 0.15);
    })
    .sort(
      (left, right) =>
        right.bounds.width * right.bounds.height -
        left.bounds.width * left.bounds.height,
    )
    .slice(0, 3)
    .map(({ object, bounds }) => ({
      blockId: createRequestId(),
      layerType: "shape" as const,
      kind: "decoration" as const,
      sourceObjectType: readType(object),
      sourceText: null,
      prominence: bounds.width * bounds.height,
      bounds,
      fontSize: null,
      textAlign: null,
      fontRole: null,
      fillColorHex:
        readColor(object) ??
        sceneStylePlan?.palettePolicy.accentColorHex ??
        sceneBindingPlan?.accentTextColorHex ??
        "#6bd357",
      clusterZone: determineClusterZone(bounds, canvasWidth, canvasHeight),
      companionSurface: null,
    }));
}

function classifyTextBlock(
  object: CanvasObject,
  companionRect: CanvasObject | null,
  isDisplayCandidate: boolean,
  canvasHeight: number,
): ReferenceCompositionBlockKind {
  const bounds = readBounds(object);
  const top = bounds?.y ?? 0;
  const fontSize = asNumber(object.fontSize) ?? 0;

  if (companionRect) {
    const companionBounds = readBounds(companionRect);
    if (companionBounds && companionBounds.width >= 240 && top >= canvasHeight * 0.45) {
      return "cta";
    }
    return "promo_band";
  }
  if (fontSize <= 24 || top >= canvasHeight * 0.84) {
    return "detail";
  }
  if (isDisplayCandidate) {
    return "display";
  }
  return "support";
}

function isMetaTextLike(
  object: CanvasObject,
  canvasWidth: number,
  canvasHeight: number,
): boolean {
  const text = normalizeText(readText(object));
  const bounds = readBounds(object);
  if (!text || !bounds) {
    return false;
  }
  const fontSize = asNumber(object.fontSize) ?? 0;
  const topArea = bounds.y <= canvasHeight * 0.18;
  const shortUtility = text.length <= 18;
  const narrowLabel = bounds.width <= canvasWidth * 0.28;
  if (isDateLikeText(text)) {
    return true;
  }
  if (
    topArea &&
    shortUtility &&
    narrowLabel &&
    fontSize <= 30
  ) {
    return true;
  }
  if (
    topArea &&
    fontSize <= 34 &&
    /^[A-Z][A-Z\s!&-]{2,24}$/u.test(text)
  ) {
    return true;
  }
  return false;
}

function isDateLikeText(text: string): boolean {
  return (
    /\b\d{1,2}\s*[./-]\s*\d{1,2}\b/u.test(text) ||
    /\b\d{1,2}\s*[./-]\s*\d{1,2}\s*[~-]\s*\d{1,2}\s*[./-]?\s*\d{0,2}\b/u.test(
      text,
    ) ||
    /\b\d{1,2}\s*~\s*\d{1,2}\b/u.test(text)
  );
}

function selectPrimaryAndEchoDisplayObjects(
  textObjects: CanvasObject[],
  companionRectByObject: Map<CanvasObject, CanvasObject | null>,
  canvasWidth: number,
  canvasHeight: number,
): { primary: CanvasObject | null; echo: CanvasObject | null } {
  const eligible = textObjects
    .filter((object) => !companionRectByObject.get(object))
    .filter((object) => {
      const bounds = readBounds(object);
      const fontSize = asNumber(object.fontSize) ?? 0;
      if (!bounds) {
        return false;
      }
      return (
        fontSize >= 44 ||
        bounds.width * bounds.height >= canvasWidth * canvasHeight * 0.03
      );
    })
    .sort((left, right) => estimateTextPriority(right) - estimateTextPriority(left));
  const primary = eligible[0] ?? null;
  const echo =
    primary
      ? eligible.find(
          (candidate) =>
            candidate !== primary &&
            isEchoDisplayCandidate(primary, candidate, canvasWidth, canvasHeight),
        ) ?? null
      : null;
  return { primary, echo };
}

function isEchoDisplayCandidate(
  primary: CanvasObject,
  candidate: CanvasObject,
  canvasWidth: number,
  canvasHeight: number,
): boolean {
  const primaryBounds = readBounds(primary);
  const candidateBounds = readBounds(candidate);
  if (!primaryBounds || !candidateBounds) {
    return false;
  }
  const primaryPriority = estimateTextPriority(primary);
  const candidatePriority = estimateTextPriority(candidate);
  if (candidatePriority < primaryPriority * 0.45) {
    return false;
  }
  const primaryCenterX = primaryBounds.x + primaryBounds.width / 2;
  const primaryCenterY = primaryBounds.y + primaryBounds.height / 2;
  const candidateCenterX = candidateBounds.x + candidateBounds.width / 2;
  const candidateCenterY = candidateBounds.y + candidateBounds.height / 2;
  return (
    Math.abs(candidateCenterX - primaryCenterX) <= canvasWidth * 0.42 &&
    Math.abs(candidateCenterY - primaryCenterY) <= canvasHeight * 0.3
  );
}

function findCompanionSurface(
  textObject: CanvasObject,
  rectObjects: CanvasObject[],
  canvasWidth: number,
): CanvasObject | null {
  const textBounds = readBounds(textObject);
  if (!textBounds) {
    return null;
  }

  const matches = rectObjects
    .map((rect) => ({
      rect,
      bounds: readBounds(rect),
    }))
    .filter(
      (entry): entry is { rect: CanvasObject; bounds: LayoutBounds } =>
        Boolean(entry.bounds),
    )
    .filter(({ bounds }) => {
      const verticalOverlap = overlapRatio(textBounds, bounds);
      if (verticalOverlap < 0.18) {
        return false;
      }
      const widthRatio = bounds.width / Math.max(textBounds.width, 1);
      return widthRatio >= 0.8 && widthRatio <= 2.6 && bounds.width <= canvasWidth * 0.82;
    })
    .sort(
      (left, right) =>
        overlapRatio(textBounds, right.bounds) - overlapRatio(textBounds, left.bounds),
    );

  return matches[0]?.rect ?? null;
}

function selectAtom(
  atoms: CopyAtom[],
  usedAtomIds: Set<string>,
  preferredSlotKeys: Array<CopyAtom["sourceSlotKey"]>,
  ...preferredKinds: Array<CopyAtom["preferredKind"]>
): CopyAtom | null {
  const available = atoms.filter((atom) => !usedAtomIds.has(atom.atomId));
  for (const slotKey of preferredSlotKeys) {
    const found = available.find((atom) => atom.sourceSlotKey === slotKey);
    if (found) {
      return found;
    }
  }
  for (const kind of preferredKinds) {
    const found = available.find((atom) => atom.preferredKind === kind);
    if (found) {
      return found;
    }
  }
  return available[0] ?? null;
}

function selectPrimaryAndEchoDisplayBlocks(
  displayBlocks: ReferenceCompositionBlock[],
): {
  primaryDisplay: ReferenceCompositionBlock | null;
  echoDisplay: ReferenceCompositionBlock | null;
} {
  const ordered = [...displayBlocks].sort(
    (left, right) => right.prominence - left.prominence,
  );
  const primaryDisplay = ordered[0] ?? null;
  const echoDisplay =
    primaryDisplay && ordered[1] && isDisplayBlockPair(primaryDisplay, ordered[1])
      ? ordered[1]
      : null;
  return { primaryDisplay, echoDisplay };
}

function isDisplayBlockPair(
  primary: ReferenceCompositionBlock,
  candidate: ReferenceCompositionBlock,
): boolean {
  const primaryCenterX = primary.bounds.x + primary.bounds.width / 2;
  const primaryCenterY = primary.bounds.y + primary.bounds.height / 2;
  const candidateCenterX = candidate.bounds.x + candidate.bounds.width / 2;
  const candidateCenterY = candidate.bounds.y + candidate.bounds.height / 2;
  return (
    candidate.prominence >= primary.prominence * 0.45 &&
    Math.abs(candidateCenterX - primaryCenterX) <= primary.bounds.width * 1.25 &&
    Math.abs(candidateCenterY - primaryCenterY) <= primary.bounds.height * 1.4
  );
}

function splitHeadlineForDisplayPair(
  text: string,
  allowEcho: boolean,
): { primaryText: string; echoText: string | null } {
  const normalized = normalizeText(text);
  if (!allowEcho) {
    return { primaryText: normalized, echoText: null };
  }
  const parts = normalized
    .split(/\n+|,\s*|:\s*|-\s+|[.!?]\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return {
      primaryText: parts[0] ?? normalized,
      echoText: parts.slice(1).join(" ").trim() || null,
    };
  }
  return { primaryText: normalized, echoText: null };
}

function bindingRank(kind: ReferenceCompositionBlockKind): number {
  switch (kind) {
    case "display":
      return 0;
    case "promo_band":
      return 1;
    case "cta":
      return 2;
    case "support":
      return 3;
    case "detail":
      return 4;
    case "decoration":
    default:
      return 5;
  }
}

function scaleBounds(
  bounds: LayoutBounds,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): LayoutBounds {
  return {
    x: Math.round((bounds.x / Math.max(sourceWidth, 1)) * targetWidth),
    y: Math.round((bounds.y / Math.max(sourceHeight, 1)) * targetHeight),
    width: Math.max(
      1,
      Math.round((bounds.width / Math.max(sourceWidth, 1)) * targetWidth),
    ),
    height: Math.max(
      1,
      Math.round((bounds.height / Math.max(sourceHeight, 1)) * targetHeight),
    ),
  };
}

function scaleFontSize(
  fontSize: number | null,
  sourceWidth: number,
  targetWidth: number,
  kind: ReferenceCompositionBlockKind,
): number {
  const scaled =
    (fontSize ?? (kind === "display" ? 92 : kind === "promo_band" ? 40 : 28)) *
    (targetWidth / Math.max(sourceWidth, 1));
  if (kind === "display") {
    return Math.max(56, Math.min(160, Math.round(scaled)));
  }
  if (kind === "detail") {
    return Math.max(16, Math.min(24, Math.round(scaled)));
  }
  return Math.max(22, Math.min(54, Math.round(scaled)));
}

function determineClusterZone(
  bounds: LayoutBounds,
  canvasWidth: number,
  canvasHeight: number,
): ConcreteLayoutClusterZone {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  if (centerY >= canvasHeight * 0.78) {
    return "bottom_strip";
  }
  if (centerX >= canvasWidth * 0.74 && centerY <= canvasHeight * 0.34) {
    return "top_corner";
  }
  if (centerX >= canvasWidth * 0.62) {
    return "right_cluster";
  }
  return "center_cluster";
}

function inferDecorationRole(block: ReferenceCompositionBlock): string {
  if (block.clusterZone === "top_corner" || block.clusterZone === "bottom_strip") {
    return "freeform_accent_circle";
  }
  return "freeform_accent_blob";
}

function inferDecorationRadius(block: ReferenceCompositionBlock): number {
  const ratio = block.bounds.width / Math.max(block.bounds.height, 1);
  if (ratio >= 0.85 && ratio <= 1.15) {
    return Math.round(Math.min(block.bounds.width, block.bounds.height) / 2);
  }
  return Math.round(Math.min(block.bounds.width, block.bounds.height) * 0.24);
}

function isDecorativeBandLike(
  bounds: LayoutBounds,
  canvasHeight: number,
): boolean {
  return (
    bounds.width / Math.max(bounds.height, 1) >= 4 &&
    bounds.height <= canvasHeight * 0.18
  );
}

function isSameHorizontalStrip(
  left: LayoutBounds,
  right: LayoutBounds,
): boolean {
  const leftCenterY = left.y + left.height / 2;
  const rightCenterY = right.y + right.height / 2;
  const verticalClose =
    Math.abs(leftCenterY - rightCenterY) <= Math.max(left.height, right.height);
  const horizontalOverlap =
    Math.max(
      0,
      Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
    ) / Math.max(Math.min(left.width, right.width), 1);
  return verticalClose && horizontalOverlap >= 0.25;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function isVeryDarkColor(color: string | null): boolean {
  if (!color || !/^#?[0-9a-f]{6}$/iu.test(color)) {
    return false;
  }
  const normalized = color.startsWith("#") ? color.slice(1) : color;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return red + green + blue <= 72;
}

function readFirstParsedPage(
  document: TemplatePriorBundle["candidates"][number]["fetchedDocument"] | null,
): Record<string, unknown> | null {
  const firstPage = document?.pages[0]?.parsed;
  return firstPage && typeof firstPage === "object"
    ? (firstPage as Record<string, unknown>)
    : null;
}

function readObjectArray(value: unknown): CanvasObject[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is CanvasObject => Boolean(entry) && typeof entry === "object",
      )
    : [];
}

function flattenObjects(objects: CanvasObject[]): CanvasObject[] {
  const flattened: CanvasObject[] = [];
  for (const object of objects) {
    flattened.push(object);
    const children = readObjectArray(object.objects);
    if (children.length > 0) {
      flattened.push(...flattenObjects(children));
    }
  }
  return flattened;
}

function readType(object: CanvasObject): string {
  return typeof object.type === "string" ? object.type : "unknown";
}

function isTextLikeObject(object: CanvasObject): boolean {
  return ["text", "textbox", "i-text"].includes(readType(object));
}

function isRectLikeObject(object: CanvasObject): boolean {
  return readType(object) === "rect";
}

function readText(object: CanvasObject): string {
  return typeof object.text === "string" ? object.text.trim() : "";
}

function readTextAlign(
  object: CanvasObject,
): "left" | "center" | "right" | null {
  if (
    object.textAlign === "left" ||
    object.textAlign === "center" ||
    object.textAlign === "right"
  ) {
    return object.textAlign;
  }
  return null;
}

function readBounds(object: CanvasObject): LayoutBounds | null {
  const width = estimateWidth(object);
  const height = estimateHeight(object);
  const x = resolveOriginAdjustedCoordinate(
    asNumber(object.left_from_zero) ?? asNumber(object.left) ?? null,
    width,
    typeof object.originX === "string" ? object.originX : null,
  );
  const y = resolveOriginAdjustedCoordinate(
    asNumber(object.top_from_zero) ?? asNumber(object.top) ?? null,
    height,
    typeof object.originY === "string" ? object.originY : null,
  );
  if (x === null || y === null || width <= 0 || height <= 0) {
    return null;
  }
  return { x, y, width, height };
}

function resolveSourceCanvasWidth(
  document: TemplatePriorBundle["candidates"][number]["fetchedDocument"] | null,
  page: Record<string, unknown>,
): number {
  return (
    asNumber(document?.metaData.width) ??
    asNumber(document?.canvas.width) ??
    readClipDimension(page, "width") ??
    asNumber(page.width) ??
    1200
  );
}

function resolveSourceCanvasHeight(
  document: TemplatePriorBundle["candidates"][number]["fetchedDocument"] | null,
  page: Record<string, unknown>,
): number {
  return (
    asNumber(document?.metaData.height) ??
    asNumber(document?.canvas.height) ??
    readClipDimension(page, "height") ??
    asNumber(page.height) ??
    628
  );
}

function readClipDimension(
  page: Record<string, unknown>,
  dimension: "width" | "height",
): number | null {
  const clipPath =
    page.clipPath && typeof page.clipPath === "object"
      ? (page.clipPath as Record<string, unknown>)
      : null;
  return clipPath ? asNumber(clipPath[dimension]) : null;
}

function resolveOriginAdjustedCoordinate(
  rawValue: number | null,
  size: number,
  origin: string | null,
): number | null {
  if (rawValue === null) {
    return null;
  }
  switch (origin) {
    case "center":
      return rawValue - size / 2;
    case "right":
    case "bottom":
      return rawValue - size;
    default:
      return rawValue;
  }
}

function estimateWidth(object: CanvasObject): number {
  return (asNumber(object.width) ?? 0) * (asNumber(object.scaleX) ?? 1);
}

function estimateHeight(object: CanvasObject): number {
  return (asNumber(object.height) ?? 0) * (asNumber(object.scaleY) ?? 1);
}

function estimateTextPriority(object: CanvasObject): number {
  const fontSize = asNumber(object.fontSize) ?? 0;
  const fontWeight = asNumber(object.fontWeight) ?? 400;
  return fontSize * Math.max(fontWeight / 400, 1) + estimateWidth(object) * estimateHeight(object) * 0.001;
}

function overlapRatio(bounds: LayoutBounds, other: LayoutBounds): number {
  const overlapWidth = Math.max(
    0,
    Math.min(bounds.x + bounds.width, other.x + other.width) -
      Math.max(bounds.x, other.x),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(bounds.y + bounds.height, other.y + other.height) -
      Math.max(bounds.y, other.y),
  );
  if (overlapWidth <= 0 || overlapHeight <= 0) {
    return 0;
  }
  const overlapArea = overlapWidth * overlapHeight;
  return overlapArea / Math.max(bounds.width * bounds.height, 1);
}

function readColor(object: CanvasObject): string | null {
  const candidates = [
    typeof object.fill === "string" ? object.fill : null,
    typeof object.stroke === "string" ? object.stroke : null,
    typeof object.backgroundColor === "string" ? object.backgroundColor : null,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeColor(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function readGradientColors(
  object: CanvasObject,
): { primary: string | null; secondary: string | null } | null {
  const fill = object.fill;
  if (!fill || typeof fill !== "object") {
    return null;
  }
  const colorStops = Array.isArray((fill as Record<string, unknown>).colorStops)
    ? ((fill as Record<string, unknown>).colorStops as Array<Record<string, unknown>>)
    : [];
  if (colorStops.length < 2) {
    return null;
  }
  const firstStop = colorStops[0];
  const lastStop = colorStops[colorStops.length - 1];
  const first = normalizeColor(
    firstStop && typeof firstStop.color === "string" ? firstStop.color : null,
  );
  const last = normalizeColor(
    lastStop && typeof lastStop.color === "string" ? lastStop.color : null,
  );
  if (!first && !last) {
    return null;
  }
  return {
    primary: last ?? first,
    secondary: first ?? last,
  };
}

function readImageUrl(object: CanvasObject): string | null {
  const candidates = [
    typeof object.src === "string" ? object.src : null,
    typeof object.originSrc === "string" ? object.originSrc : null,
    typeof object.img_org_url === "string" ? object.img_org_url : null,
  ];
  return candidates.find((candidate) => Boolean(candidate && candidate.trim().length > 0)) ?? null;
}

function normalizeColor(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (/^#?[0-9a-f]{6}$/i.test(trimmed)) {
    return `#${trimmed.replace(/^#/, "").toLowerCase()}`;
  }
  if (/^#?[0-9a-f]{3}$/i.test(trimmed)) {
    const raw = trimmed.replace(/^#/, "").toLowerCase();
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
  }
  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([01](?:\.\d+)?))?\s*\)$/i,
  );
  if (!rgbMatch) {
    return null;
  }
  return `#${[rgbMatch[1], rgbMatch[2], rgbMatch[3]]
    .map((channel) =>
      Math.max(0, Math.min(255, Number.parseInt(channel ?? "0", 10)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
  }
  return null;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
