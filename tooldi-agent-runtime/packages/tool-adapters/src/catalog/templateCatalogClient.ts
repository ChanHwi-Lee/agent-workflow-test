export type TemplateCandidateFamily =
  | "background"
  | "layout"
  | "decoration"
  | "photo";

export type TemplateSourceFamily =
  | "background_source"
  | "graphic_source"
  | "photo_source"
  | "template_source"
  | "derived_policy";

export interface TemplateCandidate {
  candidateId: string;
  family: TemplateCandidateFamily;
  sourceFamily: TemplateSourceFamily;
  sourceAssetId?: string;
  sourceSerial?: string;
  sourceCategory?: string | null;
  sourceUid?: string | null;
  sourceOriginUrl?: string | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  thumbnailUrl?: string | null;
  insertMode?: string | null;
  summary: string;
  fitScore: number;
  selectionReasons: string[];
  riskFlags: string[];
  fallbackIfRejected: string;
  executionAllowed: boolean;
  payload: {
    variantKey: string;
    layoutMode?:
      | "copy_left_with_right_decoration"
      | "copy_left_with_right_photo"
      | "center_stack"
      | "badge_led"
      | "left_copy_right_graphic"
      | "center_stack_promo"
      | "badge_promo_stack"
      | "framed_promo";
    backgroundMode?:
      | "spring_pattern"
      | "pastel_gradient"
      | "spring_photo"
      | "generated_solid";
    backgroundColorHex?: string | null;
    backgroundSourceKind?: "generated_solid";
    decorationMode?:
      | "graphic_cluster"
      | "ribbon_badge"
      | "photo_support"
      | "promo_multi_graphic";
    photoBranchMode?:
      | "not_considered"
      | "graphic_preferred"
      | "photo_selected";
    photoOrientation?: "portrait" | "landscape" | "square";
    themeTokens?: string[];
  };
}

export interface TemplateCandidateSet {
  setId: string;
  family: TemplateCandidateFamily;
  candidates: TemplateCandidate[];
}

export interface TemplateCatalogContext {
  canvasWidth: number;
  canvasHeight: number;
  templateKind: string;
  tone: string;
  assetPolicy: {
    allowedFamilies: Array<"background" | "graphic" | "photo">;
    preferredFamilies: Array<"background" | "graphic" | "photo">;
    primaryVisualPolicy: "graphic_preferred" | "photo_preferred" | "balanced";
    avoidFamilies: Array<"background" | "graphic" | "photo">;
  };
}

export interface BackgroundCatalogClient {
  listBackgroundCandidates(
    context: TemplateCatalogContext,
  ): Promise<TemplateCandidateSet>;
}

export interface GraphicCatalogClient {
  listGraphicCandidates(
    context: TemplateCatalogContext,
  ): Promise<TemplateCandidateSet>;
}

export interface PhotoCatalogClient {
  listPhotoCandidates(
    context: TemplateCatalogContext,
  ): Promise<TemplateCandidateSet>;
}

export interface TemplateCatalogClient
  extends BackgroundCatalogClient,
    GraphicCatalogClient,
    PhotoCatalogClient {}

class PlaceholderTemplateCatalogClient implements TemplateCatalogClient {
  async listBackgroundCandidates(
    context: TemplateCatalogContext,
  ): Promise<TemplateCandidateSet> {
    const wideCanvas = context.canvasWidth >= context.canvasHeight;

    return {
      setId: "background_candidates_spring_v1",
      family: "background",
      candidates: [
        {
          candidateId: "background_spring_pattern_soft_petals",
          family: "background",
          sourceFamily: "background_source",
          summary: "Pastel spring pattern background with a soft petal mood",
          fitScore: wideCanvas ? 0.95 : 0.9,
          selectionReasons: [
            "strong seasonal fit",
            "supports text readability",
            "safe for shape/text/group execution",
          ],
          riskFlags: [],
          fallbackIfRejected: "background_pastel_gradient_with_accent",
          executionAllowed: true,
          payload: {
            variantKey: "spring_pattern_soft_petals",
            backgroundMode: "spring_pattern",
            themeTokens: ["spring", "pastel", "light"],
          },
        },
        {
          candidateId: "background_pastel_gradient_with_accent",
          family: "background",
          sourceFamily: "graphic_source",
          summary: "Pastel gradient with room for decorative graphic accents",
          fitScore: 0.88,
          selectionReasons: [
            "safe fallback when pattern quality is weak",
            "works with graphic-first composition",
          ],
          riskFlags: [],
          fallbackIfRejected: "background_spring_pattern_soft_petals",
          executionAllowed: true,
          payload: {
            variantKey: "pastel_gradient_with_accent",
            backgroundMode: "pastel_gradient",
            themeTokens: ["spring", "gradient", "graphic"],
          },
        },
        {
          candidateId: "background_cherry_blossom_photo",
          family: "background",
          sourceFamily: "photo_source",
          summary: "Cherry blossom photo background candidate",
          fitScore: 0.76,
          selectionReasons: [
            "good seasonal signal",
            "can create strong focal mood",
          ],
          riskFlags: [
            "photo readability risk",
            "not part of immediate v1 execution surface",
          ],
          fallbackIfRejected: "background_spring_pattern_soft_petals",
          executionAllowed: false,
          payload: {
            variantKey: "cherry_blossom_photo",
            backgroundMode: "spring_photo",
            themeTokens: ["spring", "photo", "floral"],
          },
        },
      ],
    };
  }

  async listGraphicCandidates(
    _context: TemplateCatalogContext,
  ): Promise<TemplateCandidateSet> {
    return {
      setId: "graphic_candidates_spring_v1",
      family: "decoration",
      candidates: [
        {
          candidateId: "decoration_floral_graphic_cluster",
          family: "decoration",
          sourceFamily: "graphic_source",
          summary: "Abstract floral cluster using Tooldi-style graphic accents",
          fitScore: 0.93,
          selectionReasons: [
            "graphic-first default",
            "safe within current execution surface",
            "supports spring tone without needing a photo",
          ],
          riskFlags: [],
          fallbackIfRejected: "decoration_ribbon_badge_pair",
          executionAllowed: true,
          payload: {
            variantKey: "floral_graphic_cluster",
            decorationMode: "graphic_cluster",
            themeTokens: ["spring", "graphic", "floral"],
          },
        },
        {
          candidateId: "decoration_ribbon_badge_pair",
          family: "decoration",
          sourceFamily: "graphic_source",
          summary: "Ribbon and badge composition for promotional emphasis",
          fitScore: 0.84,
          selectionReasons: [
            "works well with copy-focused layout",
            "easy to synthesize with shape/group primitives",
          ],
          riskFlags: [],
          fallbackIfRejected: "decoration_floral_graphic_cluster",
          executionAllowed: true,
          payload: {
            variantKey: "ribbon_badge_pair",
            decorationMode: "ribbon_badge",
            themeTokens: ["promo", "badge", "graphic"],
          },
        },
      ],
    };
  }

  async listPhotoCandidates(
    _context: TemplateCatalogContext,
  ): Promise<TemplateCandidateSet> {
    return {
      setId: "photo_candidates_spring_v1",
      family: "photo",
      candidates: [
        {
          candidateId: "photo_spring_hero_support",
          family: "photo",
          sourceFamily: "photo_source",
          summary: "Spring mood support photo for hero-side placement",
          fitScore: 0.78,
          selectionReasons: [
            "can strengthen seasonal mood",
            "useful when a hero focal area exists",
          ],
          riskFlags: [
            "not part of immediate v1 execution surface",
            "photo can reduce copy readability",
          ],
          fallbackIfRejected: "decoration_floral_graphic_cluster",
          executionAllowed: false,
          payload: {
            variantKey: "spring_hero_support",
            decorationMode: "photo_support",
            photoBranchMode: "photo_selected",
            photoOrientation: "landscape",
            themeTokens: ["spring", "photo", "hero"],
          },
        },
      ],
    };
  }
}

export function createTemplateCatalogClient(): TemplateCatalogClient {
  return new PlaceholderTemplateCatalogClient();
}
