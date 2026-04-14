import type {
  ExecutionSlotKey,
  PersistedPlanAction,
} from "@tooldi/agent-contracts";

import type {
  AbstractLayoutDensity,
  AbstractLayoutFamily,
  AssetExecutionEligibility,
  ConcreteLayoutAnchorZone,
  ConcreteLayoutClusterZone,
  CopyPlanSlotKey,
  FreeformRenderableBlock,
  GraphicCompositionRole,
  GraphicCompositionSet,
  GraphicRoleBinding,
  LayoutBounds,
  SceneBindingPlan,
  SceneCtaShapeLanguage,
} from "../types.js";
import type { DecorationMode, LayoutMode } from "./layoutGeometry.js";

export type TypographyMetadata = {
  displayFontFamily: string | null;
  displayFontWeight: number | null;
  bodyFontFamily: string | null;
  bodyFontWeight: number | null;
};

export type PhotoMetadata = {
  selectedPhotoCandidateId: string | null;
  selectedPhotoAssetId: string | null;
  selectedPhotoSerial: string | null;
  selectedPhotoCategory: string | null;
  selectedPhotoUid: string | null;
  selectedPhotoUrl: string | null;
  selectedPhotoWidth: number | null;
  selectedPhotoHeight: number | null;
  selectedPhotoOrientation: "portrait" | "landscape" | "square" | null;
  photoFitMode: "cover";
  photoCropMode: "centered_cover";
};

export type CopySlotTextMap = Partial<Record<CopyPlanSlotKey, string>>;
export type CopySlotAnchorMap = Partial<
  Record<CopyPlanSlotKey, ConcreteLayoutAnchorZone>
>;

export type GraphicRolePlacementHints = Array<{
  role: GraphicCompositionRole;
  zone: ConcreteLayoutClusterZone;
}>;

export type StyleMetadata = {
  backgroundColorHex: string;
  secondaryBackgroundColorHex: string | null;
  primaryTextColorHex: string | null;
  secondaryTextColorHex: string | null;
  accentTextColorHex: string | null;
  inverseTextColorHex: string | null;
  ctaSurfaceColorHex: string | null;
  ctaTextColorHex: string | null;
  ctaShapeLanguage: SceneCtaShapeLanguage | null;
  backgroundVisualMode: SceneBindingPlan["backgroundMode"] | null;
};

export type ExecutionMode = "legacy_slots" | "v2_freeform";

export type FoundationInputs = {
  executionMode: ExecutionMode;
  backgroundMode:
    | "spring_pattern"
    | "pastel_gradient"
    | "spring_photo"
    | "generated_solid";
  selectedBackgroundCandidateId: string;
  selectedBackgroundAssetId: string | null;
  selectedBackgroundSerial: string | null;
  selectedBackgroundCategory: string | null;
  backgroundColorHex: string;
  includeHeroPanel: boolean;
  includeBadge: boolean;
  includeRibbon: boolean;
  includeFrame: boolean;
  badgeText: string | null;
  styleMetadata: StyleMetadata | null;
  resolvedSlotBounds: Partial<Record<ExecutionSlotKey, LayoutBounds>>;
  headlineEstimatedHeight: number | null;
};

export type SaveInputs = {
  reason: "run_completed";
};

export type CopyInputs = {
  executionMode: ExecutionMode;
  layoutMode: LayoutMode;
  layoutProfile: AbstractLayoutFamily;
  primaryVisualFamily: "graphic" | "photo";
  selectedLayoutCandidateId: string;
  displayFontFamily: string | null;
  displayFontWeight: number | null;
  bodyFontFamily: string | null;
  bodyFontWeight: number | null;
  includeHeroCaption: boolean;
  includeBadge: boolean;
  styleMetadata: StyleMetadata | null;
  copySlotTexts: CopySlotTextMap;
  copySlotAnchors: CopySlotAnchorMap;
  resolvedSlotBounds: Partial<Record<ExecutionSlotKey, LayoutBounds>>;
  clusterZones: ConcreteLayoutClusterZone[];
  spacingIntent: AbstractLayoutDensity;
  headlineEstimatedHeight: number | null;
  freeformBlocks: FreeformRenderableBlock[];
};

export type PhotoInputs = PhotoMetadata & {
  layoutProfile: AbstractLayoutFamily;
  resolvedSlotBounds: Partial<Record<ExecutionSlotKey, LayoutBounds>>;
};

export type PolishInputs = {
  executionMode: ExecutionMode;
  decorationMode: DecorationMode;
  layoutProfile: AbstractLayoutFamily;
  primaryVisualFamily: "graphic" | "photo";
  assetExecutionEligibility: AssetExecutionEligibility;
  selectedDecorationCandidateId: string;
  selectedDecorationAssetId: string | null;
  selectedDecorationSerial: string | null;
  selectedDecorationCategory: string | null;
  graphicCompositionSet: GraphicCompositionSet | null;
  graphicRoleBindings: GraphicRoleBinding[];
  includeUnderline: boolean;
  includeRibbon: boolean;
  clusterZones: ConcreteLayoutClusterZone[];
  graphicRolePlacementHints: GraphicRolePlacementHints;
  ctaContainerExpected: boolean;
  spacingIntent: AbstractLayoutDensity;
  styleMetadata: StyleMetadata | null;
  freeformBlocks: FreeformRenderableBlock[];
};

export function readFoundationInputs(
  inputs: PersistedPlanAction["inputs"],
): FoundationInputs {
  const record = inputs as {
    executionMode?: ExecutionMode;
    backgroundMode?: FoundationInputs["backgroundMode"];
    selectedBackgroundCandidateId?: string;
    selectedBackgroundAssetId?: string | null;
    selectedBackgroundSerial?: string | null;
    selectedBackgroundCategory?: string | null;
    backgroundColorHex?: string;
    includeHeroPanel?: boolean;
    includeBadge?: boolean;
    includeRibbon?: boolean;
    includeFrame?: boolean;
    badgeText?: string | null;
    styleMetadata?: Partial<StyleMetadata> | null;
    resolvedSlotBounds?: Partial<Record<ExecutionSlotKey, LayoutBounds>>;
    headlineEstimatedHeight?: number;
  };

  return {
    executionMode: record.executionMode ?? "legacy_slots",
    backgroundMode: record.backgroundMode ?? "spring_pattern",
    selectedBackgroundCandidateId:
      record.selectedBackgroundCandidateId ?? "background_unknown",
    selectedBackgroundAssetId: record.selectedBackgroundAssetId ?? null,
    selectedBackgroundSerial: record.selectedBackgroundSerial ?? null,
    selectedBackgroundCategory: record.selectedBackgroundCategory ?? null,
    backgroundColorHex: record.backgroundColorHex ?? "#ffffff",
    includeHeroPanel: record.includeHeroPanel ?? false,
    includeBadge: record.includeBadge ?? false,
    includeRibbon: record.includeRibbon ?? false,
    includeFrame: record.includeFrame ?? false,
    badgeText: record.badgeText ?? null,
    styleMetadata: normalizeStyleMetadata(record.styleMetadata),
    resolvedSlotBounds: normalizeBoundsRecord(record.resolvedSlotBounds),
    headlineEstimatedHeight: record.headlineEstimatedHeight ?? null,
  };
}

export function readSaveInputs(
  inputs: PersistedPlanAction["inputs"],
): SaveInputs {
  const record = inputs as {
    reason?: "run_completed";
  };

  return {
    reason: record.reason ?? "run_completed",
  };
}

export function readCopyInputs(
  inputs: PersistedPlanAction["inputs"],
): CopyInputs {
  const record = inputs as {
    executionMode?: ExecutionMode;
    layoutMode?: LayoutMode;
    layoutProfile?: AbstractLayoutFamily;
    primaryVisualFamily?: "graphic" | "photo";
    selectedLayoutCandidateId?: string;
    displayFontFamily?: string | null;
    displayFontWeight?: number | null;
    bodyFontFamily?: string | null;
    bodyFontWeight?: number | null;
    includeHeroCaption?: boolean;
    includeBadge?: boolean;
    styleMetadata?: Partial<StyleMetadata> | null;
    copySlotTexts?: CopySlotTextMap;
    copySlotAnchors?: CopySlotAnchorMap;
    resolvedSlotBounds?: Partial<Record<ExecutionSlotKey, LayoutBounds>>;
    clusterZones?: ConcreteLayoutClusterZone[];
    spacingIntent?: AbstractLayoutDensity;
    headlineEstimatedHeight?: number;
    freeformBlocks?: FreeformRenderableBlock[];
  };

  return {
    executionMode: record.executionMode ?? "legacy_slots",
    layoutMode: record.layoutMode ?? "copy_left_with_right_decoration",
    layoutProfile: record.layoutProfile ?? "promo_split",
    primaryVisualFamily: record.primaryVisualFamily ?? "graphic",
    selectedLayoutCandidateId:
      record.selectedLayoutCandidateId ?? "layout_unknown",
    displayFontFamily: record.displayFontFamily ?? null,
    displayFontWeight: record.displayFontWeight ?? null,
    bodyFontFamily: record.bodyFontFamily ?? null,
    bodyFontWeight: record.bodyFontWeight ?? null,
    includeHeroCaption: record.includeHeroCaption ?? false,
    includeBadge: record.includeBadge ?? false,
    styleMetadata: normalizeStyleMetadata(record.styleMetadata),
    copySlotTexts: record.copySlotTexts ?? {},
    copySlotAnchors: record.copySlotAnchors ?? {},
    resolvedSlotBounds: normalizeBoundsRecord(record.resolvedSlotBounds),
    clusterZones: record.clusterZones ?? [],
    spacingIntent: record.spacingIntent ?? "balanced",
    headlineEstimatedHeight: record.headlineEstimatedHeight ?? null,
    freeformBlocks: normalizeFreeformBlocks(record.freeformBlocks),
  };
}

export function readPhotoInputs(
  inputs: PersistedPlanAction["inputs"] | undefined,
): PhotoInputs {
  const record = (inputs ?? {}) as {
    layoutProfile?: AbstractLayoutFamily;
    selectedPhotoCandidateId?: string | null;
    selectedPhotoAssetId?: string | null;
    selectedPhotoSerial?: string | null;
    selectedPhotoCategory?: string | null;
    selectedPhotoUid?: string | null;
    selectedPhotoUrl?: string | null;
    selectedPhotoWidth?: number | null;
    selectedPhotoHeight?: number | null;
    selectedPhotoOrientation?: "portrait" | "landscape" | "square" | null;
    photoFitMode?: "cover";
    photoCropMode?: "centered_cover";
    resolvedSlotBounds?: Partial<Record<ExecutionSlotKey, LayoutBounds>>;
  };

  return {
    layoutProfile: record.layoutProfile ?? "subject_hero",
    selectedPhotoCandidateId: record.selectedPhotoCandidateId ?? null,
    selectedPhotoAssetId: record.selectedPhotoAssetId ?? null,
    selectedPhotoSerial: record.selectedPhotoSerial ?? null,
    selectedPhotoCategory: record.selectedPhotoCategory ?? null,
    selectedPhotoUid: record.selectedPhotoUid ?? null,
    selectedPhotoUrl: record.selectedPhotoUrl ?? null,
    selectedPhotoWidth: record.selectedPhotoWidth ?? null,
    selectedPhotoHeight: record.selectedPhotoHeight ?? null,
    selectedPhotoOrientation: record.selectedPhotoOrientation ?? null,
    photoFitMode: record.photoFitMode ?? "cover",
    photoCropMode: record.photoCropMode ?? "centered_cover",
    resolvedSlotBounds: normalizeBoundsRecord(record.resolvedSlotBounds),
  };
}

export function readPolishInputs(
  inputs: PersistedPlanAction["inputs"],
): PolishInputs {
  const record = inputs as {
    executionMode?: ExecutionMode;
    decorationMode?: DecorationMode;
    layoutProfile?: AbstractLayoutFamily;
    primaryVisualFamily?: "graphic" | "photo";
    assetExecutionEligibility?: AssetExecutionEligibility;
    selectedDecorationCandidateId?: string;
    selectedDecorationAssetId?: string | null;
    selectedDecorationSerial?: string | null;
    selectedDecorationCategory?: string | null;
    graphicCompositionSet?: GraphicCompositionSet | null;
    graphicRoleBindings?: GraphicRoleBinding[];
    includeUnderline?: boolean;
    includeRibbon?: boolean;
    clusterZones?: ConcreteLayoutClusterZone[];
    graphicRolePlacementHints?: GraphicRolePlacementHints;
    ctaContainerExpected?: boolean;
    spacingIntent?: AbstractLayoutDensity;
    styleMetadata?: Partial<StyleMetadata> | null;
    freeformBlocks?: FreeformRenderableBlock[];
  };

  return {
    executionMode: record.executionMode ?? "legacy_slots",
    decorationMode: record.decorationMode ?? "graphic_cluster",
    layoutProfile: record.layoutProfile ?? "promo_split",
    primaryVisualFamily: record.primaryVisualFamily ?? "graphic",
    assetExecutionEligibility:
      record.assetExecutionEligibility ?? {
        canRender: true,
        degraded: false,
        reasons: [],
      },
    selectedDecorationCandidateId:
      record.selectedDecorationCandidateId ?? "decoration_unknown",
    selectedDecorationAssetId: record.selectedDecorationAssetId ?? null,
    selectedDecorationSerial: record.selectedDecorationSerial ?? null,
    selectedDecorationCategory: record.selectedDecorationCategory ?? null,
    graphicCompositionSet: record.graphicCompositionSet ?? null,
    graphicRoleBindings: record.graphicRoleBindings ?? [],
    includeUnderline: record.includeUnderline ?? false,
    includeRibbon: record.includeRibbon ?? false,
    clusterZones: record.clusterZones ?? [],
    graphicRolePlacementHints: record.graphicRolePlacementHints ?? [],
    ctaContainerExpected: record.ctaContainerExpected ?? false,
    spacingIntent: record.spacingIntent ?? "balanced",
    styleMetadata: normalizeStyleMetadata(record.styleMetadata),
    freeformBlocks: normalizeFreeformBlocks(record.freeformBlocks),
  };
}

function normalizeFreeformBlocks(
  value: unknown,
): FreeformRenderableBlock[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is FreeformRenderableBlock =>
          Boolean(entry) && typeof entry === "object",
      )
    : [];
}

function normalizeBoundsRecord(
  value: unknown,
): Partial<Record<ExecutionSlotKey, LayoutBounds>> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const normalized: Partial<Record<ExecutionSlotKey, LayoutBounds>> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (
      candidate &&
      typeof candidate === "object" &&
      typeof (candidate as LayoutBounds).x === "number" &&
      typeof (candidate as LayoutBounds).y === "number" &&
      typeof (candidate as LayoutBounds).width === "number" &&
      typeof (candidate as LayoutBounds).height === "number"
    ) {
      normalized[key as ExecutionSlotKey] = {
        x: (candidate as LayoutBounds).x,
        y: (candidate as LayoutBounds).y,
        width: (candidate as LayoutBounds).width,
        height: (candidate as LayoutBounds).height,
      };
    }
  }

  return normalized;
}

function normalizeStyleMetadata(
  value: Partial<StyleMetadata> | null | undefined,
): StyleMetadata | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    backgroundColorHex: value.backgroundColorHex ?? "#ffffff",
    secondaryBackgroundColorHex: value.secondaryBackgroundColorHex ?? null,
    primaryTextColorHex: value.primaryTextColorHex ?? null,
    secondaryTextColorHex: value.secondaryTextColorHex ?? null,
    accentTextColorHex: value.accentTextColorHex ?? null,
    inverseTextColorHex: value.inverseTextColorHex ?? null,
    ctaSurfaceColorHex: value.ctaSurfaceColorHex ?? null,
    ctaTextColorHex: value.ctaTextColorHex ?? null,
    ctaShapeLanguage: value.ctaShapeLanguage ?? null,
    backgroundVisualMode: value.backgroundVisualMode ?? null,
  };
}
