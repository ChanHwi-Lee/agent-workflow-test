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
  type TemplatePlannerProvider,
} from "@tooldi/agent-llm";
import type {
  AdaptiveCompositionDecision,
  CopyPlan,
  ProjectedObjectGraph,
  SpatialZone,
} from "../types.js";

// ---------------------------------------------------------------------------
// Addable Vocabulary Registry (SSOT Section 5)
// ---------------------------------------------------------------------------

export interface AddableVocabularyEntry {
  id: string;
  nodeType: "text" | "shape" | "group" | "image";
  description: string;
  requiredContent: "text" | "none";
  defaultPlacementZone: SpatialZone;
}

const ADDABLE_VOCABULARY: AddableVocabularyEntry[] = [
  {
    id: "cta_button",
    nodeType: "group",
    description: "행동 유도 버튼 (예: '지금 주문하기', '자세히 보기')",
    requiredContent: "text",
    defaultPlacementZone: "bottom",
  },
  {
    id: "footer_text",
    nodeType: "text",
    description: "하단 부가 정보 텍스트 (날짜, 조건, 유의사항 등)",
    requiredContent: "text",
    defaultPlacementZone: "bottom",
  },
  {
    id: "badge_chip",
    nodeType: "group",
    description: "소형 뱃지/태그 (예: 'NEW', '한정', '50% OFF')",
    requiredContent: "text",
    defaultPlacementZone: "top-right",
  },
  {
    id: "accent_shape",
    nodeType: "shape",
    description: "장식용 강조 도형",
    requiredContent: "none",
    defaultPlacementZone: "center",
  },
];

export function getAddableVocabulary(): AddableVocabularyEntry[] {
  return ADDABLE_VOCABULARY;
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
  newFillColor: z
    .string()
    .nullable()
    .describe("modify일 때 교체할 색상(hex). 변경 없으면 null"),
  reason: z.string().max(120).describe("결정 이유 (한국어)"),
});

const AddDecisionSchema = z.object({
  vocabularyId: z
    .enum(["cta_button", "footer_text", "badge_chip", "accent_shape"])
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
  reason: z.string().max(120).describe("추가 이유 (한국어)"),
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
    if (obj.compositeHint) parts.push(`| [${obj.compositeHint}]`);
    return parts.join(" ");
  });
  return header + lines.join("\n");
}

function serializeMessageAtoms(copyPlan: CopyPlan): string {
  return copyPlan.slots
    .map((slot) => {
      const required = slot.required ? "required" : "optional";
      return `[${slot.key}] "${slot.text}" (${required}, ${slot.priority})`;
    })
    .join("\n");
}

function serializeAddableVocabulary(): string {
  return ADDABLE_VOCABULARY.map(
    (entry) =>
      `- ${entry.id}: ${entry.description} (${entry.requiredContent === "text" ? "텍스트 필수" : "텍스트 없음"})`,
  ).join("\n");
}

function buildSystemPrompt(): string {
  return `You are an adaptive composition decision maker for a Korean promotional banner design system.

Your task: Given a template's object graph and message content, decide how to compose the final design.

For EACH template object, decide one of:
- retain: Keep as-is. Use for background images, decorative elements that fit the new design.
- modify: Keep the object but replace its text or color. Use for text objects that should show new content.
- remove: Delete the object. Use for elements that conflict with the new design intent.

You may also ADD new elements from the addable vocabulary (only if the template lacks a suitable object).

Rules:
1. Default is retain. Only modify or remove when there's a clear reason.
2. For text objects: prefer modify (replace text with message atom content) over remove + add.
3. Background/decorative images: usually retain.
4. Place primary message into the dominant text object via modify.
5. Place CTA text into a secondary/button-like object if one exists, otherwise add cta_button.
6. Only add elements when truly needed — the template already has a good layout.
7. Do NOT specify exact coordinates for added elements. Just specify a zone.
8. Return decisions in Korean (reason, compositionSummary).
9. Every text object should be either modified with relevant content or removed — do not retain template placeholder text.`;
}

function buildUserPrompt(
  graph: ProjectedObjectGraph,
  copyPlan: CopyPlan,
  palette: string[],
): string {
  const graphStr = serializeProjectedGraphCompact(graph);
  const atomsStr = serializeMessageAtoms(copyPlan);
  const vocabStr = serializeAddableVocabulary();
  const paletteStr =
    palette.length > 0 ? palette.join(", ") : "지정 없음 (템플릿 색상 유지)";

  return `## Template Object Graph

${graphStr}

## Message Atoms (배치할 텍스트 콘텐츠)

${atomsStr}

## Brand Palette

${paletteStr}

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
  copyPlan: CopyPlan;
  palette: string[];
  provider: TemplatePlannerProvider;
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

  const result = await structuredModel.invoke([
    { role: "system", content: buildSystemPrompt() },
    {
      role: "user",
      content: buildUserPrompt(
        input.projectedGraph,
        input.copyPlan,
        input.palette,
      ),
    },
  ]);

  const decisionId = `acd_${input.runId}_${Date.now()}`;

  return {
    decisionId,
    runId: input.runId,
    traceId: input.traceId,
    templateCode: input.projectedGraph.templateCode,
    projectedGraphId: input.projectedGraph.graphId,
    elementDecisions: result.elementDecisions.map((d) => ({
      objectId: d.objectId,
      operation: d.operation,
      newText: d.newText ?? null,
      newFillColor: d.newFillColor ?? null,
      reason: d.reason,
    })),
    addDecisions: result.addDecisions.map((d) => ({
      vocabularyId: d.vocabularyId,
      text: d.text ?? null,
      placementZone: d.placementZone as SpatialZone,
      reason: d.reason,
    })),
    compositionSummary: result.compositionSummary,
  };
}
