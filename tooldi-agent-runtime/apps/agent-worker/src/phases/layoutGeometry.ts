import type {
  AbstractLayoutDensity,
  AbstractLayoutFamily,
  ConcreteLayoutAnchorZone,
  ConcreteLayoutClusterZone,
  CopyPlanSlotKey,
  GraphicCompositionRole,
  LayoutBounds,
  SelectionDecision,
} from "../types.js";

export type LayoutMode = SelectionDecision["layoutMode"];
export type DecorationMode = SelectionDecision["decorationMode"];

type LayoutGeometry = {
  background: LayoutBounds;
  heroPanel: LayoutBounds;
  badge: LayoutBounds;
  ribbon: LayoutBounds;
  headline: LayoutBounds;
  supportingCopy: LayoutBounds;
  priceCallout: LayoutBounds;
  heroCaption: LayoutBounds;
  cta: LayoutBounds;
  decoration: LayoutBounds;
  secondaryAccent: LayoutBounds;
  cornerAccent: LayoutBounds;
  frame: LayoutBounds;
  underlineBar: LayoutBounds;
  footerNote: LayoutBounds;
};

export function createGeometryPresets(
  canvasWidth: number,
  canvasHeight: number,
  layoutProfile: AbstractLayoutFamily,
  layoutMode: LayoutMode,
  decorationMode: DecorationMode,
  headlineHeight: number,
  spacingIntent: AbstractLayoutDensity,
) {
  return {
    current: createLayoutGeometry(
      canvasWidth,
      canvasHeight,
      layoutProfile,
      layoutMode,
      decorationMode,
      headlineHeight,
      spacingIntent,
    ),
    split: createLayoutGeometry(
      canvasWidth,
      canvasHeight,
      "promo_split",
      "left_copy_right_graphic",
      decorationMode,
      headlineHeight,
      spacingIntent,
    ),
    center: createLayoutGeometry(
      canvasWidth,
      canvasHeight,
      "promo_center",
      "center_stack_promo",
      decorationMode,
      headlineHeight,
      spacingIntent,
    ),
    badge: createLayoutGeometry(
      canvasWidth,
      canvasHeight,
      "promo_badge",
      "badge_promo_stack",
      decorationMode,
      headlineHeight,
      spacingIntent,
    ),
    framed: createLayoutGeometry(
      canvasWidth,
      canvasHeight,
      "promo_frame",
      "framed_promo",
      decorationMode,
      headlineHeight,
      spacingIntent,
    ),
    hero: createLayoutGeometry(
      canvasWidth,
      canvasHeight,
      "subject_hero",
      "copy_left_with_right_photo",
      decorationMode,
      headlineHeight,
      spacingIntent,
    ),
  };
}

export function resolveCopySlotBounds(
  presets: ReturnType<typeof createGeometryPresets>,
  slotAnchors: Partial<Record<CopyPlanSlotKey, ConcreteLayoutAnchorZone>>,
): Record<
  "headline" | "subheadline" | "offer_line" | "cta" | "footer_note" | "badge_text",
  LayoutBounds
> {
  return {
    headline: resolveBoundsForAnchor(
      slotAnchors.headline ?? "left_copy_column",
      "headline",
      presets,
    ),
    subheadline: resolveBoundsForAnchor(
      slotAnchors.subheadline ?? slotAnchors.headline ?? "left_copy_column",
      "subheadline",
      presets,
    ),
    offer_line: resolveBoundsForAnchor(
      slotAnchors.offer_line ?? slotAnchors.headline ?? "left_copy_column",
      "offer_line",
      presets,
    ),
    cta: resolveBoundsForAnchor(
      slotAnchors.cta ?? "bottom_center",
      "cta",
      presets,
    ),
    footer_note: resolveBoundsForAnchor("footer_strip", "footer_note", presets),
    badge_text: resolveBoundsForAnchor(
      slotAnchors.badge_text ?? "top_badge_band",
      "badge_text",
      presets,
    ),
  };
}

export function resolveBoundsForAnchor(
  anchor: ConcreteLayoutAnchorZone,
  slot:
    | "headline"
    | "subheadline"
    | "offer_line"
    | "cta"
    | "footer_note"
    | "badge_text",
  presets: ReturnType<typeof createGeometryPresets>,
): LayoutBounds {
  switch (anchor) {
    case "center_copy_stack":
      return resolveCenterPresetBounds(slot, presets.center);
    case "framed_copy_column":
      return resolveLeftPresetBounds(slot, presets.framed);
    case "bottom_center":
      return slot === "cta"
        ? presets.center.cta
        : resolveCenterPresetBounds(slot, presets.center);
    case "top_badge_band":
      return presets.badge.badge;
    case "footer_strip":
      return presets.current.footerNote;
    default:
      return resolveLeftPresetBounds(slot, presets.split);
  }
}

export function createClusterZoneBounds(
  geometryPresets: ReturnType<typeof createGeometryPresets>,
  clusterZones: ConcreteLayoutClusterZone[],
): Record<ConcreteLayoutClusterZone, LayoutBounds> {
  const fallback = geometryPresets.current.decoration;
  return {
    hero_panel: clusterZones.includes("hero_panel")
      ? geometryPresets.hero.heroPanel
      : fallback,
    right_cluster: clusterZones.includes("right_cluster")
      ? geometryPresets.split.decoration
      : fallback,
    center_cluster: clusterZones.includes("center_cluster")
      ? geometryPresets.center.decoration
      : fallback,
    top_corner: clusterZones.includes("top_corner")
      ? geometryPresets.current.cornerAccent
      : fallback,
    bottom_strip: clusterZones.includes("bottom_strip")
      ? geometryPresets.current.ribbon
      : fallback,
    frame: clusterZones.includes("frame")
      ? geometryPresets.framed.frame
      : fallback,
  };
}

export function resolveGraphicBindingBounds(
  role: GraphicCompositionRole,
  zone: ConcreteLayoutClusterZone,
  zoneBounds: Record<ConcreteLayoutClusterZone, LayoutBounds>,
  copySlotBounds: ReturnType<typeof resolveCopySlotBounds>,
): LayoutBounds {
  if (role === "cta_container") {
    const ctaBounds = copySlotBounds.cta;
    return {
      x: Math.max(0, ctaBounds.x - 12),
      y: Math.max(0, ctaBounds.y - 6),
      width: ctaBounds.width + 24,
      height: ctaBounds.height + 12,
    };
  }

  return zoneBounds[zone];
}

function resolveLeftPresetBounds(
  slot:
    | "headline"
    | "subheadline"
    | "offer_line"
    | "cta"
    | "footer_note"
    | "badge_text",
  geometry: LayoutGeometry,
): LayoutBounds {
  switch (slot) {
    case "headline":
      return geometry.headline;
    case "subheadline":
      return geometry.supportingCopy;
    case "offer_line":
      return geometry.priceCallout;
    case "cta":
      return geometry.cta;
    case "footer_note":
      return geometry.footerNote;
    case "badge_text":
      return geometry.badge;
  }
}

function resolveCenterPresetBounds(
  slot:
    | "headline"
    | "subheadline"
    | "offer_line"
    | "cta"
    | "footer_note"
    | "badge_text",
  geometry: LayoutGeometry,
): LayoutBounds {
  switch (slot) {
    case "headline":
      return geometry.headline;
    case "subheadline":
      return geometry.supportingCopy;
    case "offer_line":
      return geometry.priceCallout;
    case "cta":
      return geometry.cta;
    case "footer_note":
      return geometry.footerNote;
    case "badge_text":
      return geometry.badge;
  }
}

function createLayoutGeometry(
  canvasWidth: number,
  canvasHeight: number,
  layoutProfile: AbstractLayoutFamily,
  layoutMode: LayoutMode,
  decorationMode: DecorationMode,
  headlineHeight: number,
  spacingIntent: AbstractLayoutDensity,
): LayoutGeometry {
  const centered = layoutProfile === "promo_center";
  const badgeLed = layoutProfile === "promo_badge";
  const photoLayout = layoutProfile === "subject_hero";
  const promoCenterLayout =
    layoutProfile === "promo_center" || layoutProfile === "promo_badge";
  const graphicHeavyWideLayout =
    layoutProfile === "promo_split" || layoutProfile === "promo_frame";
  const verticalGapAdjust =
    spacingIntent === "airy" ? 18 : spacingIntent === "dense" ? -14 : 0;
  const ctaOffsetAdjust =
    spacingIntent === "airy" ? 16 : spacingIntent === "dense" ? -10 : 0;
  const clusterShiftAdjust =
    spacingIntent === "airy" ? -8 : spacingIntent === "dense" ? 10 : 0;
  const accentSizeAdjust =
    spacingIntent === "airy" ? -10 : spacingIntent === "dense" ? 14 : 0;
  const marginX = Math.max(48, Math.round(canvasWidth * 0.07));
  const topY = Math.max(40, Math.round(canvasHeight * 0.12));
  const footerY = canvasHeight - 44;
  const leftColumnWidth = Math.min(
    Math.max(340, Math.round(canvasWidth * 0.38)),
    canvasWidth - marginX * 2 - 220,
  );
  const rightColumnWidth = Math.min(
    Math.max(200, Math.round(canvasWidth * 0.28)),
    canvasWidth - marginX * 2 - 200,
  );
  const rightColumnX = canvasWidth - marginX - rightColumnWidth;
  const centerWidth = Math.min(canvasWidth - marginX * 2, 700);
  const badgeWidth = Math.min(220, canvasWidth - marginX * 2);
  const badgeX = centered
    ? Math.round((canvasWidth - badgeWidth) / 2)
    : marginX;

  const geometry: LayoutGeometry =
    centered || promoCenterLayout
      ? {
          background: fitBounds(canvasWidth, canvasHeight, {
            x: 0,
            y: 0,
            width: canvasWidth,
            height: canvasHeight,
          }),
          heroPanel: fitBounds(canvasWidth, canvasHeight, {
            x: Math.round((canvasWidth - 280) / 2),
            y: topY,
            width: Math.min(280, canvasWidth - marginX * 2),
            height: Math.min(112, Math.round(canvasHeight * 0.18)),
          }),
          badge: fitBounds(canvasWidth, canvasHeight, {
            x: badgeX,
            y: topY + 10,
            width: badgeWidth,
            height: 36,
          }),
          ribbon: fitBounds(canvasWidth, canvasHeight, {
            x: Math.round((canvasWidth - 180) / 2),
            y: canvasHeight - 86,
            width: 180,
            height: 18,
          }),
          headline: fitBounds(canvasWidth, canvasHeight, {
            x: Math.round((canvasWidth - centerWidth) / 2),
            y: topY + (promoCenterLayout ? 82 : 96),
            width: centerWidth,
            height: Math.max(72, headlineHeight),
          }),
          supportingCopy: fitBounds(canvasWidth, canvasHeight, {
            x: Math.round(
              (canvasWidth - Math.min(centerWidth, canvasWidth - 180)) / 2,
            ),
            y: topY + (promoCenterLayout ? 176 : 190) + verticalGapAdjust,
            width: Math.min(centerWidth, canvasWidth - 180),
            height: 72,
          }),
          priceCallout: fitBounds(canvasWidth, canvasHeight, {
            x: Math.round((canvasWidth - 280) / 2),
            y: topY + (promoCenterLayout ? 292 : 280) + verticalGapAdjust,
            width: 280,
            height: 52,
          }),
          heroCaption: fitBounds(canvasWidth, canvasHeight, {
            x: Math.round((canvasWidth - 260) / 2),
            y: topY + (promoCenterLayout ? 364 : 342) + verticalGapAdjust,
            width: 260,
            height: 32,
          }),
          cta: fitBounds(canvasWidth, canvasHeight, {
            x: Math.round((canvasWidth - 240) / 2),
            y:
              topY +
              (promoCenterLayout ? 430 : 360) +
              verticalGapAdjust +
              ctaOffsetAdjust,
            width: 240,
            height: 64,
          }),
          decoration: fitBounds(canvasWidth, canvasHeight, {
            x: canvasWidth - marginX - (promoCenterLayout ? 130 : 110),
            y: topY + (promoCenterLayout ? 8 : 0) + clusterShiftAdjust,
            width:
              (promoCenterLayout
                ? 130
                : decorationMode === "ribbon_badge"
                  ? 96
                  : 110) + accentSizeAdjust,
            height:
              (promoCenterLayout
                ? 130
                : decorationMode === "ribbon_badge"
                  ? 96
                  : 110) + accentSizeAdjust,
          }),
          secondaryAccent: fitBounds(canvasWidth, canvasHeight, {
            x: marginX,
            y: topY + 18 + clusterShiftAdjust,
            width: (promoCenterLayout ? 92 : 80) + accentSizeAdjust,
            height: (promoCenterLayout ? 92 : 80) + accentSizeAdjust,
          }),
          cornerAccent: fitBounds(canvasWidth, canvasHeight, {
            x: canvasWidth - marginX - 74,
            y: footerY - 118,
            width: 74 + Math.round(accentSizeAdjust / 2),
            height: 74 + Math.round(accentSizeAdjust / 2),
          }),
          frame: fitBounds(canvasWidth, canvasHeight, {
            x: Math.round(
              (canvasWidth - Math.min(centerWidth + 120, canvasWidth - marginX)) /
                2,
            ),
            y: topY + 52,
            width: Math.min(centerWidth + 120, canvasWidth - marginX),
            height: Math.min(440, canvasHeight - topY - 120),
          }),
          underlineBar: fitBounds(canvasWidth, canvasHeight, {
            x: Math.round((canvasWidth - 130) / 2),
            y: topY + (promoCenterLayout ? 404 : 346),
            width: 130,
            height: 8,
          }),
          footerNote: fitBounds(canvasWidth, canvasHeight, {
            x: Math.round((canvasWidth - Math.min(360, canvasWidth - 120)) / 2),
            y: footerY,
            width: Math.min(360, canvasWidth - 120),
            height: 24,
          }),
        }
      : {
          background: fitBounds(canvasWidth, canvasHeight, {
            x: 0,
            y: 0,
            width: canvasWidth,
            height: canvasHeight,
          }),
          heroPanel: fitBounds(canvasWidth, canvasHeight, {
            x: rightColumnX,
            y: topY,
            width: photoLayout
              ? Math.min(
                  Math.max(280, Math.round(canvasWidth * 0.3)),
                  rightColumnWidth + 40,
                )
              : graphicHeavyWideLayout
                ? Math.min(
                    Math.max(280, Math.round(canvasWidth * 0.3)),
                    rightColumnWidth + 64,
                  )
                : rightColumnWidth,
            height: photoLayout
              ? Math.min(324, Math.round(canvasHeight * 0.62))
              : graphicHeavyWideLayout
                ? Math.min(340, Math.round(canvasHeight * 0.56))
                : Math.min(264, Math.round(canvasHeight * 0.42)),
          }),
          badge: fitBounds(canvasWidth, canvasHeight, {
            x: badgeX,
            y: topY,
            width: badgeWidth,
            height: 36,
          }),
          ribbon: fitBounds(canvasWidth, canvasHeight, {
            x: marginX,
            y: footerY - 22,
            width: 180,
            height: 18,
          }),
          headline: fitBounds(canvasWidth, canvasHeight, {
            x: marginX,
            y: topY + 42,
            width: leftColumnWidth,
            height: Math.max(72, headlineHeight),
          }),
          supportingCopy: fitBounds(canvasWidth, canvasHeight, {
            x: marginX,
            y: topY + (graphicHeavyWideLayout ? 166 : 148) + verticalGapAdjust,
            width: leftColumnWidth + 24,
            height: 70,
          }),
          priceCallout: fitBounds(canvasWidth, canvasHeight, {
            x: marginX,
            y: topY + (graphicHeavyWideLayout ? 278 : 238) + verticalGapAdjust,
            width: Math.min(320, leftColumnWidth),
            height: 48,
          }),
          heroCaption: fitBounds(canvasWidth, canvasHeight, {
            x: rightColumnX + 20,
            y:
              topY +
              Math.min(
                photoLayout ? 348 : 284,
                Math.round(canvasHeight * (photoLayout ? 0.58 : 0.46)),
              ) +
              verticalGapAdjust,
            width: Math.max(160, rightColumnWidth - 40),
            height: 30,
          }),
          cta: fitBounds(canvasWidth, canvasHeight, {
            x: marginX,
            y:
              topY +
              (graphicHeavyWideLayout ? 392 : 320) +
              verticalGapAdjust +
              ctaOffsetAdjust,
            width: 230,
            height: 64,
          }),
          decoration: fitBounds(canvasWidth, canvasHeight, {
            x: photoLayout
              ? rightColumnX + 12
              : graphicHeavyWideLayout
                ? rightColumnX + Math.max(6, Math.round(rightColumnWidth * 0.05))
                : rightColumnX + Math.max(12, Math.round(rightColumnWidth * 0.16)),
            y:
              (photoLayout
                ? topY + Math.min(356, Math.round(canvasHeight * 0.58))
                : graphicHeavyWideLayout
                  ? topY + 18
                  : topY + Math.min(312, Math.round(canvasHeight * 0.5))) +
              clusterShiftAdjust,
            width:
              decorationMode === "ribbon_badge"
                ? Math.min(150, rightColumnWidth - 24)
                : graphicHeavyWideLayout
                  ? Math.min(220, rightColumnWidth - 16)
                  : Math.min(photoLayout ? 120 : 180, rightColumnWidth - 24),
            height:
              (decorationMode === "ribbon_badge"
                ? Math.min(90, canvasHeight - topY - 120)
                : graphicHeavyWideLayout
                  ? Math.min(220, canvasHeight - topY - 180)
                  : Math.min(photoLayout ? 92 : 140, canvasHeight - topY - 120)) +
              accentSizeAdjust,
          }),
          secondaryAccent: fitBounds(canvasWidth, canvasHeight, {
            x: rightColumnX + Math.max(24, Math.round(rightColumnWidth * 0.24)),
            y:
              topY +
              Math.min(286, Math.round(canvasHeight * 0.48)) +
              clusterShiftAdjust,
            width: Math.min(96, rightColumnWidth - 48) + accentSizeAdjust,
            height: 96 + accentSizeAdjust,
          }),
          cornerAccent: fitBounds(canvasWidth, canvasHeight, {
            x: canvasWidth - marginX - 82,
            y: topY - 6,
            width: 82 + Math.round(accentSizeAdjust / 2),
            height: 82 + Math.round(accentSizeAdjust / 2),
          }),
          frame: fitBounds(canvasWidth, canvasHeight, {
            x: marginX - 12,
            y: topY + 8,
            width: canvasWidth - marginX * 2 + 24,
            height: Math.min(430, canvasHeight - topY - 98),
          }),
          underlineBar: fitBounds(canvasWidth, canvasHeight, {
            x: marginX,
            y: topY + (graphicHeavyWideLayout ? 366 : 298),
            width: 130,
            height: 8,
          }),
          footerNote: fitBounds(canvasWidth, canvasHeight, {
            x: marginX,
            y: footerY,
            width: Math.min(360, canvasWidth - marginX * 2),
            height: 24,
          }),
        };

  if (badgeLed || layoutMode === "badge_led") {
    geometry.badge = fitBounds(canvasWidth, canvasHeight, {
      x: centered ? badgeX : marginX,
      y: topY - 4,
      width: badgeWidth,
      height: 40,
    });
    geometry.cta = fitBounds(canvasWidth, canvasHeight, {
      x: geometry.cta.x,
      y: geometry.cta.y - 24,
      width: geometry.cta.width,
      height: geometry.cta.height,
    });
  }

  if (layoutMode === "framed_promo") {
    geometry.cta = fitBounds(canvasWidth, canvasHeight, {
      x: geometry.cta.x,
      y: geometry.cta.y + 12,
      width: geometry.cta.width,
      height: geometry.cta.height,
    });
  }

  return geometry;
}

function fitBounds(
  canvasWidth: number,
  canvasHeight: number,
  bounds: LayoutBounds,
): LayoutBounds {
  const width = Math.max(1, Math.min(bounds.width, canvasWidth));
  const height = Math.max(1, Math.min(bounds.height, canvasHeight));
  const x = Math.max(0, Math.min(bounds.x, canvasWidth - width));
  const y = Math.max(0, Math.min(bounds.y, canvasHeight - height));

  return { x, y, width, height };
}
