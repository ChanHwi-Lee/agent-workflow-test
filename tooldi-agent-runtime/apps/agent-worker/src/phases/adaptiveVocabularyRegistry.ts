import type { ExecutionSlotKey } from "@tooldi/agent-contracts";

import type { LayoutBounds, SpatialZone } from "../types.js";

export const ADAPTIVE_VOCABULARY_IDS = [
  "cta_button",
  "footer_text",
  "badge_chip",
  "accent_shape",
] as const;

export type AdaptiveVocabularyId =
  (typeof ADAPTIVE_VOCABULARY_IDS)[number];

export interface AdaptiveVocabularyEntry {
  id: AdaptiveVocabularyId;
  nodeType: "text" | "shape" | "group" | "image";
  description: string;
  requiredContent: "text" | "none";
  defaultPlacementZone: SpatialZone;
  executionSlotKey: ExecutionSlotKey | null;
  layerType: "text" | "shape" | "group";
  fontRole: "display" | "body" | undefined;
  defaultBounds: (
    canvasWidth: number,
    canvasHeight: number,
  ) => LayoutBounds;
}

export const ADAPTIVE_VOCABULARY_REGISTRY: Record<
  AdaptiveVocabularyId,
  AdaptiveVocabularyEntry
> = {
  cta_button: {
    id: "cta_button",
    nodeType: "group",
    description: "행동 유도 버튼 (예: '지금 주문하기', '자세히 보기')",
    requiredContent: "text",
    defaultPlacementZone: "bottom",
    executionSlotKey: "cta",
    layerType: "group",
    fontRole: "display",
    defaultBounds: (canvasWidth, canvasHeight) => ({
      x: canvasWidth * 0.2,
      y: canvasHeight * 0.78,
      width: canvasWidth * 0.6,
      height: Math.min(60, canvasHeight * 0.08),
    }),
  },
  footer_text: {
    id: "footer_text",
    nodeType: "text",
    description: "하단 부가 정보 텍스트 (날짜, 조건, 유의사항 등)",
    requiredContent: "text",
    defaultPlacementZone: "bottom",
    executionSlotKey: "footer_note",
    layerType: "text",
    fontRole: "body",
    defaultBounds: (canvasWidth, canvasHeight) => ({
      x: canvasWidth * 0.1,
      y: canvasHeight * 0.92,
      width: canvasWidth * 0.8,
      height: 24,
    }),
  },
  badge_chip: {
    id: "badge_chip",
    nodeType: "group",
    description: "소형 뱃지/태그 (예: 'NEW', '한정', '50% OFF')",
    requiredContent: "text",
    defaultPlacementZone: "top-right",
    executionSlotKey: "badge_text",
    layerType: "group",
    fontRole: "body",
    defaultBounds: (canvasWidth, canvasHeight) => ({
      x: canvasWidth * 0.7,
      y: canvasHeight * 0.04,
      width: Math.min(120, canvasWidth * 0.2),
      height: 36,
    }),
  },
  accent_shape: {
    id: "accent_shape",
    nodeType: "shape",
    description: "장식용 강조 도형",
    requiredContent: "none",
    defaultPlacementZone: "center",
    executionSlotKey: null,
    layerType: "shape",
    fontRole: undefined,
    defaultBounds: (canvasWidth, canvasHeight) => ({
      x: canvasWidth * 0.4,
      y: canvasHeight * 0.4,
      width: canvasWidth * 0.2,
      height: canvasHeight * 0.2,
    }),
  },
};

export function listAdaptiveVocabulary(): AdaptiveVocabularyEntry[] {
  return ADAPTIVE_VOCABULARY_IDS.map(
    (id) => ADAPTIVE_VOCABULARY_REGISTRY[id],
  );
}

export function getAdaptiveVocabularyEntry(
  vocabularyId: AdaptiveVocabularyId,
): AdaptiveVocabularyEntry {
  return ADAPTIVE_VOCABULARY_REGISTRY[vocabularyId];
}
