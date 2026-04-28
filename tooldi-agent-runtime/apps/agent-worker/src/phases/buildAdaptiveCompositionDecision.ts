/**
 * buildAdaptiveCompositionDecision.ts
 *
 * SSOT: template-aware adaptive composition — Layer 3 (LLM Decision)
 *
 * Takes a projected template object graph + message atoms + style context,
 * calls an LLM with structured output, and returns retain/modify/remove/add
 * decisions for each object.
 */

import { z } from "zod";

import {
  createStructuredOutputModel,
  type StructuredOutputProvider,
} from "@tooldi/agent-llm";

import type {
  AdaptiveCompositionDecision,
  MessageAtomPlan,
  ProjectedObjectGraph,
  SceneStylePlan,
  SpatialZone,
} from "../types.js";
import {
  ADAPTIVE_VOCABULARY_IDS,
  listAdaptiveVocabulary,
} from "./adaptiveVocabularyRegistry.js";

export function getAddableVocabulary() {
  return listAdaptiveVocabulary();
}

// ---------------------------------------------------------------------------
// Zod schema for LLM structured output
// ---------------------------------------------------------------------------

const ElementDecisionSchema = z.object({
  objectId: z.string().describe("projected graph의 오브젝트 ID (예: obj-001)"),
  operation: z
    .enum(["retain", "modify", "remove"])
    .describe("retain=유지, modify=내용변경, remove=제거"),
  newText: z
    .string()
    .max(80)
    .nullable()
    .describe("modify일 때 교체할 텍스트. retain/remove면 null"),
  carriesAtomIds: z
    .array(z.string())
    .describe(
      "이 오브젝트가 carry하는 message atom의 id 목록. retain: 기존 sourceText가 atom을 이미 표현하고 있으면 해당 atom id를 선언. modify: 새 텍스트가 carry할 atom id. remove와 text-bearing이 아닌 object(shape/image)는 반드시 []",
    ),
  reason: z.string().max(120).describe("결정 이유 (한국어)"),
});

const AddDecisionSchema = z.object({
  vocabularyId: z
    .enum(ADAPTIVE_VOCABULARY_IDS)
    .describe("추가할 요소의 vocabulary ID"),
  text: z
    .string()
    .max(80)
    .nullable()
    .describe("요소에 들어갈 텍스트. accent_shape이면 null"),
  placementZone: z
    .enum([
      "center",
      "top",
      "bottom",
      "left",
      "right",
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
    ])
    .describe("배치 영역 힌트. 정확한 좌표는 코드가 결정한다."),
  carriesAtomIds: z
    .array(z.string())
    .describe(
      "이 새 요소가 carry하는 message atom의 id 목록. accent_shape은 반드시 []",
    ),
  reason: z.string().max(120).describe("추가 이유 (한국어)"),
}).superRefine((value, context) => {
  if (value.vocabularyId !== "accent_shape" && (!value.text || value.text.trim().length === 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["text"],
      message: `${value.vocabularyId} requires non-empty text content`,
    });
  }
});

const AdaptiveCompositionDecisionSchema = z.object({
  elementDecisions: z
    .array(ElementDecisionSchema)
    .describe(
      "template graph의 각 오브젝트에 대한 결정. 언급하지 않은 오브젝트는 retain으로 간주.",
    ),
  addDecisions: z
    .array(AddDecisionSchema)
    .describe(
      "템플릿에 없지만 새로 추가할 요소. addable vocabulary에서만 선택 가능.",
    ),
  compositionSummary: z
    .string()
    .max(200)
    .describe("전체 구성 결정에 대한 요약 (한국어)"),
});

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function serializeProjectedGraphCompact(graph: ProjectedObjectGraph): string {
  const header = `Template: "${graph.templateTitle}" (${graph.canvasWidth}x${graph.canvasHeight})\n`;
  const lines = graph.objects.map((obj) => {
    const parts: string[] = [`[${obj.objectId}]`, obj.layerType];
    parts.push(`| ${obj.visualWeight}`);
    parts.push(`| ${obj.zone}`);
    if (obj.sourceText) {
      const text =
        obj.sourceText.length > 40
          ? obj.sourceText.substring(0, 40) + "…"
          : obj.sourceText;
      parts.push(`| "${text.replace(/\n/g, "\\n")}"`);
    }
    if (obj.fontSize) parts.push(`| fs:${obj.fontSize}`);
    if (obj.fillColorHex) parts.push(`| fill:${obj.fillColorHex}`);
    parts.push(
      `| bounds:${Math.round(obj.bounds.x)},${Math.round(obj.bounds.y)},${Math.round(obj.bounds.width)},${Math.round(obj.bounds.height)}`,
    );
    if (obj.backingSurfaceColorHex) parts.push(`| surface:${obj.backingSurfaceColorHex}`);
    if (obj.compositeHint) parts.push(`| [${obj.compositeHint}]`);
    return parts.join(" ");
  });
  return header + lines.join("\n");
}

function serializeMessageAtoms(messageAtomPlan: MessageAtomPlan): string {
  return messageAtomPlan.atoms
    .filter((atom) => atom.text.trim().length > 0)
    .map((atom) => {
      const atomKind =
        atom.kind === "primary"
          ? "primary_message"
          : atom.kind === "cta"
            ? "action_text"
            : atom.kind === "offer"
              ? "promo_message"
              : atom.kind === "detail"
                ? "detail_note"
                : "supporting_message";
      return `${atom.atomId}: "${atom.text}" (${atomKind}, ${atom.optional ? "optional" : "required"})`;
    })
    .join("\n");
}

function serializeAddableVocabulary(): string {
  return listAdaptiveVocabulary().map(
    (entry) =>
      `- ${entry.id}: ${entry.description} (${entry.requiredContent === "text" ? "텍스트 필수" : "텍스트 없음"})`,
  ).join("\n");
}

function buildSystemPrompt(): string {
  return `You are an adaptive composition decision maker for a Korean promotional banner design system.

Your task: Given a template's object graph and message content, decide how to compose the final design.

For EACH template object, decide one of:
- retain: Keep as-is. Use for background images, decorative elements that fit the new design.
- modify: Keep the object but replace its text. Use for text objects that should show new content.
- remove: Delete the object. Use for elements that conflict with the new design intent.

You may also ADD new elements from the addable vocabulary (only if the template lacks a suitable object).

Rules:
1. Default is retain. Only modify or remove when there's a clear reason.
2. For text objects: prefer modify (replace text with message atom content) over remove + add.
3. Background/decorative images: usually retain.
4. Use observed bounds, visual weight, zone, and local surfaces to decide which objects can carry which message atoms.
5. If an existing visually suitable object can carry action text, prefer modify over add.
6. Only add elements when truly needed — the template already has a good layout.
7. Do NOT specify exact coordinates for added elements. Just specify a zone.
8. Return decisions in Korean (reason, compositionSummary).
9. Retain remains a valid outcome when an existing text object is already suitable or decorative.
10. Do NOT specify colors. Text/surface colors are decided by code from palette + readability policy.

Atom carriage contract (every required atom must be carried by exactly the union of declared carriesAtomIds):
- retain + carriesAtomIds: existing sourceText already represents those atom ids (e.g. template text matches an atom).
- modify + carriesAtomIds: the replacement newText carries those atom ids.
- remove: carriesAtomIds must be [] (removed objects cannot carry content).
- text-bearing shape/image/group retain/remove/modify: carriesAtomIds must be [] unless the object is of layerType "text". Only layerType "text" objects can carry atoms.
- add text-bearing vocabulary (cta_button, footer_text, badge_chip): carriesAtomIds lists the atom ids this new element represents.
- add accent_shape: carriesAtomIds must be [] (shape has no text).
- carriesAtomIds must use atom ids from the "Message Atoms" list below. Do not invent ids.
- Do not repeat the same atom id inside one decision's carriesAtomIds.
- Every required (non-optional) atom must appear in the carriesAtomIds of exactly one or more decisions across the entire output.`;
}

function buildUserPrompt(
  graph: ProjectedObjectGraph,
  messageAtomPlan: MessageAtomPlan,
  sceneStylePlan: SceneStylePlan | null | undefined,
  palette: string[],
): string {
  const graphStr = serializeProjectedGraphCompact(graph);
  const atomsStr = serializeMessageAtoms(messageAtomPlan);
  const vocabStr = serializeAddableVocabulary();
  const paletteStr =
    palette.length > 0 ? palette.join(", ") : "지정 없음 (템플릿 색상 유지)";
  const typographyStr = sceneStylePlan
    ? [
        `template_font_family: ${sceneStylePlan.typographyPolicy.templateFontFamily ?? "unspecified"}`,
        `display_weight_target: ${sceneStylePlan.typographyPolicy.displayWeightTarget}`,
        `body_weight_target: ${sceneStylePlan.typographyPolicy.bodyWeightTarget}`,
      ].join("\n")
    : "지정 없음";

  return `## Template Object Graph

${graphStr}

## Message Atoms (배치할 텍스트 콘텐츠)

${atomsStr}

## Brand Palette

${paletteStr}

## Typography Preference

${typographyStr}

## Addable Vocabulary (add로 추가 가능한 요소)

${vocabStr}

위 template graph의 각 오브젝트에 대해 retain/modify/remove 결정을 내리고,
필요하면 addable vocabulary에서 요소를 추가하세요.`;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export interface BuildAdaptiveCompositionDecisionInput {
  runId: string;
  traceId: string;
  projectedGraph: ProjectedObjectGraph;
  messageAtomPlan: MessageAtomPlan;
  sceneStylePlan?: SceneStylePlan | null;
  palette: string[];
  provider: StructuredOutputProvider;
  modelName: string;
  temperature: number;
}

export async function buildAdaptiveCompositionDecision(
  input: BuildAdaptiveCompositionDecisionInput,
): Promise<AdaptiveCompositionDecision> {
  const model = createStructuredOutputModel<
    typeof AdaptiveCompositionDecisionSchema
  >(input.provider, input.modelName, input.temperature);
  const structuredModel = model.withStructuredOutput(
    AdaptiveCompositionDecisionSchema,
  );

  const baseUserPrompt = buildUserPrompt(
    input.projectedGraph,
    input.messageAtomPlan,
    input.sceneStylePlan,
    input.palette,
  );

  const invoker: AdaptiveCompositionInvoker = async (userPrompt) =>
    structuredModel.invoke([
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: userPrompt },
    ]);

  return runAdaptiveCompositionDecisionWithRetry(invoker, baseUserPrompt, {
    runId: input.runId,
    traceId: input.traceId,
    projectedGraph: input.projectedGraph,
    messageAtomPlan: input.messageAtomPlan,
  });
}

// ---------------------------------------------------------------------------
// Coverage contract — every `layerType === "text"` object with non-null
// sourceText MUST receive an explicit retain/modify/remove decision. On
// omission, finalize throws `AdaptiveCompositionCoverageError`; the planner
// gets exactly one augmented-prompt retry, and a terminal omission surfaces
// as the dedicated `decision_coverage_incomplete` error code (distinct from
// executionNodes' `adaptive_batch_missing`).
// ---------------------------------------------------------------------------

export const ADAPTIVE_COMPOSITION_COVERAGE_ERROR_CODE =
  "decision_coverage_incomplete" as const;

export class AdaptiveCompositionCoverageError extends Error {
  readonly code = ADAPTIVE_COMPOSITION_COVERAGE_ERROR_CODE;
  readonly missingObjectIds: string[];
  constructor(missingObjectIds: string[]) {
    super(
      `Adaptive composition omitted decisions for required text objects: ${missingObjectIds.join(", ")}`,
    );
    this.name = "AdaptiveCompositionCoverageError";
    this.missingObjectIds = [...missingObjectIds];
  }
}

export type AdaptiveCompositionInvoker = (
  userPrompt: string,
) => Promise<z.infer<typeof AdaptiveCompositionDecisionSchema>>;

export async function runAdaptiveCompositionDecisionWithRetry(
  invoker: AdaptiveCompositionInvoker,
  baseUserPrompt: string,
  context: FinalizeAdaptiveCompositionDecisionContext,
): Promise<AdaptiveCompositionDecision> {
  const firstResult = await invoker(baseUserPrompt);
  try {
    return finalizeAdaptiveCompositionDecision(firstResult, context);
  } catch (err) {
    if (!(err instanceof AdaptiveCompositionCoverageError)) throw err;
    const retryPrompt = buildCoverageRetryUserPrompt(
      baseUserPrompt,
      context.projectedGraph,
      err.missingObjectIds,
    );
    const retryResult = await invoker(retryPrompt);
    return finalizeAdaptiveCompositionDecision(retryResult, context);
  }
}

function buildCoverageRetryUserPrompt(
  baseUserPrompt: string,
  projectedGraph: ProjectedObjectGraph,
  missingObjectIds: string[],
): string {
  const lookup = new Map(
    projectedGraph.objects.map((obj) => [obj.objectId, obj.sourceText ?? ""]),
  );
  const missingLines = missingObjectIds
    .map((objectId) => {
      const text = (lookup.get(objectId) ?? "").replace(/\n/g, "\\n");
      return `- ${objectId}: "${text}"`;
    })
    .join("\n");
  return `${baseUserPrompt}

## Retry Instruction — Decision Coverage Incomplete

The previous response omitted explicit decisions for the following text
objects that have non-null sourceText. Every such text object MUST receive
exactly one elementDecision with operation ∈ {retain, modify, remove}.
Re-emit the FULL decision set (do not drop previously covered objects) and
include a decision for each of these:

${missingLines}`;
}

export interface FinalizeAdaptiveCompositionDecisionContext {
  runId: string;
  traceId: string;
  projectedGraph: ProjectedObjectGraph;
  messageAtomPlan: MessageAtomPlan;
}

export function finalizeAdaptiveCompositionDecision(
  rawResult: z.infer<typeof AdaptiveCompositionDecisionSchema>,
  context: FinalizeAdaptiveCompositionDecisionContext,
): AdaptiveCompositionDecision {
  const decisionId = `acd_${context.runId}_${Date.now()}`;
  const dedupedElementDecisions = new Map(
    rawResult.elementDecisions.map((decision) => [decision.objectId, decision]),
  );
  const objectMap = new Map(
    context.projectedGraph.objects.map((object) => [object.objectId, object]),
  );
  const invalidObjectIds = [...dedupedElementDecisions.keys()].filter(
    (objectId) => !objectMap.has(objectId),
  );
  if (invalidObjectIds.length > 0) {
    throw new Error(
      `Adaptive composition returned unknown object ids: ${invalidObjectIds.join(", ")}`,
    );
  }

  // SSOT A2 + §4.2: every text object with non-null sourceText MUST receive an
  // explicit retain/modify/remove decision. Non-text objects default to
  // implicit retain (A2 leaves "how" to the executor). Omission surfaces as
  // AdaptiveCompositionCoverageError so the planner can be retried exactly
  // once with an augmented prompt; a terminal omission becomes the dedicated
  // decision_coverage_incomplete error code.
  const missingCoverageObjectIds = context.projectedGraph.objects
    .filter((obj) => obj.layerType === "text" && obj.sourceText !== null)
    .map((obj) => obj.objectId)
    .filter((objectId) => !dedupedElementDecisions.has(objectId));
  if (missingCoverageObjectIds.length > 0) {
    throw new AdaptiveCompositionCoverageError(missingCoverageObjectIds);
  }

  const atomIdSet = new Set(
    context.messageAtomPlan.atoms.map((atom) => atom.atomId),
  );

  for (const decision of dedupedElementDecisions.values()) {
    const unknownAtomIds = decision.carriesAtomIds.filter(
      (atomId) => !atomIdSet.has(atomId),
    );
    if (unknownAtomIds.length > 0) {
      throw new Error(
        `ElementDecision ${decision.objectId} declared unknown atom ids in carriesAtomIds: ${unknownAtomIds.join(", ")}`,
      );
    }
    if (
      new Set(decision.carriesAtomIds).size !== decision.carriesAtomIds.length
    ) {
      throw new Error(
        `ElementDecision ${decision.objectId} has duplicate atom ids in carriesAtomIds`,
      );
    }
    if (
      decision.operation === "remove" &&
      decision.carriesAtomIds.length > 0
    ) {
      throw new Error(
        `ElementDecision ${decision.objectId} is remove but carriesAtomIds is non-empty`,
      );
    }
    const targetLayerType = objectMap.get(decision.objectId)?.layerType;
    if (targetLayerType !== "text" && decision.carriesAtomIds.length > 0) {
      throw new Error(
        `ElementDecision ${decision.objectId} has layerType=${targetLayerType ?? "unknown"} but carriesAtomIds is non-empty; only text-bearing objects can carry atoms`,
      );
    }
  }

  for (const addDecision of rawResult.addDecisions) {
    const unknownAtomIds = addDecision.carriesAtomIds.filter(
      (atomId) => !atomIdSet.has(atomId),
    );
    if (unknownAtomIds.length > 0) {
      throw new Error(
        `AddDecision ${addDecision.vocabularyId} declared unknown atom ids in carriesAtomIds: ${unknownAtomIds.join(", ")}`,
      );
    }
    if (
      new Set(addDecision.carriesAtomIds).size !==
      addDecision.carriesAtomIds.length
    ) {
      throw new Error(
        `AddDecision ${addDecision.vocabularyId} has duplicate atom ids in carriesAtomIds`,
      );
    }
    if (
      addDecision.vocabularyId === "accent_shape" &&
      addDecision.carriesAtomIds.length > 0
    ) {
      throw new Error(
        `AddDecision accent_shape cannot carry atoms; carriesAtomIds must be []`,
      );
    }
  }

  const carriedAtomIds = new Set<string>();
  for (const decision of dedupedElementDecisions.values()) {
    for (const atomId of decision.carriesAtomIds) {
      carriedAtomIds.add(atomId);
    }
  }
  for (const addDecision of rawResult.addDecisions) {
    for (const atomId of addDecision.carriesAtomIds) {
      carriedAtomIds.add(atomId);
    }
  }

  const missingRequiredAtoms = context.messageAtomPlan.atoms.filter(
    (atom) => !atom.optional && !carriedAtomIds.has(atom.atomId),
  );
  if (missingRequiredAtoms.length > 0) {
    throw new Error(
      `Adaptive composition omitted required atoms: ${missingRequiredAtoms.map((atom) => atom.atomId).join(", ")}`,
    );
  }

  return {
    decisionId,
    runId: context.runId,
    traceId: context.traceId,
    templateCode: context.projectedGraph.templateCode,
    projectedGraphId: context.projectedGraph.graphId,
    elementDecisions: [...dedupedElementDecisions.values()].map((d) => ({
      objectId: d.objectId,
      operation: d.operation,
      newText: d.newText ?? null,
      carriesAtomIds: d.carriesAtomIds,
      reason: d.reason,
    })),
    addDecisions: rawResult.addDecisions.map((d) => ({
      vocabularyId: d.vocabularyId,
      text: d.text ?? null,
      placementZone: d.placementZone as SpatialZone,
      carriesAtomIds: d.carriesAtomIds,
      reason: d.reason,
    })),
    compositionSummary: rawResult.compositionSummary,
  };
}
