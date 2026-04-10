import { z } from "zod";

export const templatePlannerModes = ["heuristic", "langchain"] as const;
export type TemplatePlannerMode = (typeof templatePlannerModes)[number];

export const templatePlannerProviders = [
  "openai",
  "anthropic",
  "google",
] as const;
export type TemplatePlannerProvider = (typeof templatePlannerProviders)[number];

export const legacyTemplateAssetPolicies = [
  "graphic_allowed_photo_optional",
  "photo_preferred_graphic_allowed",
] as const;
export type LegacyTemplateAssetPolicy =
  (typeof legacyTemplateAssetPolicies)[number];

export const templateAssetFamilies = ["background", "graphic", "photo"] as const;
export type TemplateAssetFamily = (typeof templateAssetFamilies)[number];

export const templatePrimaryVisualPolicies = [
  "graphic_preferred",
  "photo_preferred",
  "balanced",
] as const;
export type TemplatePrimaryVisualPolicy =
  (typeof templatePrimaryVisualPolicies)[number];

const templateAssetFamilySchema = z.enum(templateAssetFamilies);

export const TemplateAssetPolicySchema = z
  .object({
    allowedFamilies: z.array(templateAssetFamilySchema).min(1).max(3),
    preferredFamilies: z.array(templateAssetFamilySchema).max(3),
    primaryVisualPolicy: z.enum(templatePrimaryVisualPolicies),
    avoidFamilies: z.array(templateAssetFamilySchema).max(3),
  })
  .superRefine((value, ctx) => {
    const allowedFamilies = new Set(value.allowedFamilies);

    for (const family of value.preferredFamilies) {
      if (!allowedFamilies.has(family)) {
        ctx.addIssue({
          code: "custom",
          message: `preferredFamilies must also be present in allowedFamilies: ${family}`,
        });
      }
    }

    const primaryFamily = resolvePrimaryVisualFamily(value.primaryVisualPolicy);
    if (primaryFamily !== null && !allowedFamilies.has(primaryFamily)) {
      ctx.addIssue({
        code: "custom",
        message: "primaryVisualPolicy must resolve to an allowed family",
      });
    }
  });

export const TemplateAssetPolicyCompatibilitySchema = z.object({
  allowedFamilies: z.array(templateAssetFamilySchema).max(3).optional(),
  preferredFamilies: z.array(templateAssetFamilySchema).max(3).optional(),
  primaryVisualPolicy: z.enum(templatePrimaryVisualPolicies).optional(),
  avoidFamilies: z.array(templateAssetFamilySchema).max(3).optional(),
});

export const TemplateAssetPolicyBoundarySchema = z.union([
  z.enum(legacyTemplateAssetPolicies),
  TemplateAssetPolicyCompatibilitySchema,
]);

export type TemplateAssetPolicy = z.infer<typeof TemplateAssetPolicySchema>;
export type TemplateAssetPolicyInput = z.input<
  typeof TemplateAssetPolicyBoundarySchema
>;

export const templateCopyPriorities = [
  "primary",
  "secondary",
  "supporting",
  "utility",
] as const;
export type TemplateCopyPriority = (typeof templateCopyPriorities)[number];

export const templateCopyToneHints = [
  "promotional",
  "informational",
  "urgent",
] as const;
export type TemplateCopyToneHint = (typeof templateCopyToneHints)[number];

export const templateAbstractLayoutFamilies = [
  "promo_split",
  "promo_center",
  "promo_badge",
  "promo_frame",
  "subject_hero",
] as const;
export type TemplateAbstractLayoutFamily =
  (typeof templateAbstractLayoutFamilies)[number];

export const templateCopyAnchors = ["left", "center"] as const;
export type TemplateCopyAnchor = (typeof templateCopyAnchors)[number];

export const templateVisualAnchors = [
  "right",
  "center",
  "background",
] as const;
export type TemplateVisualAnchor = (typeof templateVisualAnchors)[number];

export const templateCtaAnchors = [
  "below_copy",
  "inline_offer",
  "bottom_center",
] as const;
export type TemplateCtaAnchor = (typeof templateCtaAnchors)[number];

export const templateLayoutDensities = ["airy", "balanced", "dense"] as const;
export type TemplateLayoutDensity = (typeof templateLayoutDensities)[number];

export const templateSlotTopologies = [
  "headline_supporting_offer_cta_footer",
  "headline_supporting_cta_footer",
  "badge_headline_offer_cta_footer",
  "hero_headline_supporting_cta_footer",
] as const;
export type TemplateSlotTopology = (typeof templateSlotTopologies)[number];

export const TemplateCopyPlanSlotDraftSchema = z.object({
  text: z.string().min(1).max(80),
  priority: z.enum(templateCopyPriorities),
  required: z.boolean(),
  maxLength: z.number().int().min(4).max(80),
  toneHint: z.enum(templateCopyToneHints).nullable(),
});

export const TemplateCopyPlanDraftSchema = z.object({
  headline: TemplateCopyPlanSlotDraftSchema,
  subheadline: TemplateCopyPlanSlotDraftSchema.nullable(),
  offerLine: TemplateCopyPlanSlotDraftSchema.nullable(),
  cta: TemplateCopyPlanSlotDraftSchema,
  footerNote: TemplateCopyPlanSlotDraftSchema.nullable(),
  badgeText: TemplateCopyPlanSlotDraftSchema.nullable(),
  summary: z.string().min(1).max(160),
});

export type TemplateCopyPlanDraft = z.infer<typeof TemplateCopyPlanDraftSchema>;

export const TemplateAbstractLayoutDraftSchema = z.object({
  layoutFamily: z.enum(templateAbstractLayoutFamilies),
  copyAnchor: z.enum(templateCopyAnchors),
  visualAnchor: z.enum(templateVisualAnchors),
  ctaAnchor: z.enum(templateCtaAnchors),
  density: z.enum(templateLayoutDensities),
  slotTopology: z.enum(templateSlotTopologies),
  summary: z.string().min(1).max(160),
});

export type TemplateAbstractLayoutDraft = z.infer<
  typeof TemplateAbstractLayoutDraftSchema
>;

export const TemplateIntentDraftSchema = z.object({
  goalSummary: z.string().min(1).max(80),
  templateKind: z.enum(["promo_banner", "seasonal_sale_banner"]),
  domain: z.enum([
    "restaurant",
    "cafe",
    "fashion_retail",
    "general_marketing",
  ]),
  audience: z.enum([
    "walk_in_customers",
    "local_visitors",
    "sale_shoppers",
    "general_consumers",
  ]),
  campaignGoal: z.enum([
    "menu_discovery",
    "product_trial",
    "sale_conversion",
    "promotion_awareness",
  ]),
  layoutIntent: z.enum(["copy_focused", "hero_focused", "badge_led"]),
  tone: z.enum(["bright_playful"]),
  backgroundColorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  assetPolicy: TemplateAssetPolicyBoundarySchema,
  searchKeywords: z.array(z.string().min(1).max(20)).min(1).max(5),
  typographyHint: z.string().nullable(),
  facets: z.object({
    seasonality: z.enum(["spring"]).nullable(),
    menuType: z.enum(["food_menu", "drink_menu"]).nullable(),
    promotionStyle: z.enum([
      "seasonal_menu_launch",
      "new_product_promo",
      "sale_campaign",
      "general_campaign",
    ]),
    offerSpecificity: z.enum([
      "single_product",
      "multi_item",
      "broad_offer",
    ]),
  }),
  copyPlanDraft: TemplateCopyPlanDraftSchema.optional(),
  abstractLayoutDraft: TemplateAbstractLayoutDraftSchema.optional(),
});

export type TemplateIntentDraft = z.infer<typeof TemplateIntentDraftSchema>;

export interface TemplatePlannerInput {
  prompt: string;
  canvasPreset: string;
  palette: string[];
}

export interface TemplatePlanner {
  readonly mode: TemplatePlannerMode;
  plan(input: TemplatePlannerInput): Promise<TemplateIntentDraft>;
}

export interface StructuredOutputModel<TSchema extends z.ZodTypeAny> {
  withStructuredOutput(schema: TSchema): {
    invoke(
      input:
        | string
        | Array<{
            role: "system" | "user" | "assistant";
            content: string;
          }>,
    ): Promise<z.infer<TSchema>>;
  };
}

export function parseTemplateIntentDraft(value: unknown): TemplateIntentDraft {
  return TemplateIntentDraftSchema.parse(value);
}

export function resolvePrimaryVisualFamily(
  primaryVisualPolicy: TemplatePrimaryVisualPolicy,
): TemplateAssetFamily | null {
  if (primaryVisualPolicy === "photo_preferred") {
    return "photo";
  }
  if (primaryVisualPolicy === "graphic_preferred") {
    return "graphic";
  }
  return null;
}
