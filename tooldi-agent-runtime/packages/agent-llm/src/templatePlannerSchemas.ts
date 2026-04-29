import { z } from "zod";

export const legacyTemplateAssetPolicies = [
  "graphic_allowed_photo_optional",
  "photo_preferred_graphic_allowed",
] as const;
export type LegacyTemplateAssetPolicy =
  (typeof legacyTemplateAssetPolicies)[number];

export const templateAssetFamilies = [
  "background",
  "graphic",
  "photo",
] as const;
export type TemplateAssetFamily = (typeof templateAssetFamilies)[number];

export const templatePrimaryVisualPolicies = [
  "graphic_preferred",
  "photo_preferred",
  "balanced",
] as const;
export type TemplatePrimaryVisualPolicy =
  (typeof templatePrimaryVisualPolicies)[number];

export const templateSubjectBindings = [
  "subjectless",
  "domain_anchored",
  "product_anchored",
  "venue_anchored",
] as const;
export type TemplateSubjectBinding = (typeof templateSubjectBindings)[number];

export const templateOfferIntents = [
  "sale",
  "launch",
  "announcement",
  "evergreen",
] as const;
export type TemplateOfferIntent = (typeof templateOfferIntents)[number];

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

export const TemplateSemanticBriefDraftSchema = z.object({
  goalSummary: z.string().min(1).max(80),
  templateKind: z.enum(["promo_banner", "seasonal_sale_banner"]),
  domain: z.enum(["restaurant", "cafe", "fashion_retail", "general_marketing"]),
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
  subjectBinding: z.enum(templateSubjectBindings).optional(),
  offerIntent: z.enum(templateOfferIntents).optional(),
  layoutIntent: z.enum(["copy_focused", "hero_focused", "badge_led"]),
  tone: z.enum(["bright_playful"]),
  backgroundColorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  assetPolicy: TemplateAssetPolicyBoundarySchema,
  typographyHint: z.string().nullable(),
  searchKeywords: z.array(z.string().min(1).max(20)).min(1).max(5).optional(),
  facets: z.object({
    seasonality: z.enum(["spring"]).nullable(),
    menuType: z.enum(["food_menu", "drink_menu"]).nullable(),
    promotionStyle: z
      .enum([
        "seasonal_menu_launch",
        "new_product_promo",
        "sale_campaign",
        "general_campaign",
      ])
      .optional(),
    offerSpecificity: z.enum(["single_product", "multi_item", "broad_offer"]),
  }),
});

export type TemplateSemanticBriefDraft = z.infer<
  typeof TemplateSemanticBriefDraftSchema
>;

export interface TemplateSemanticBriefContext {
  goalSummary: string;
  canvasPreset: string;
  templateKind: "promo_banner" | "seasonal_sale_banner";
  domain: "restaurant" | "cafe" | "fashion_retail" | "general_marketing";
  audience:
    | "walk_in_customers"
    | "local_visitors"
    | "sale_shoppers"
    | "general_consumers";
  campaignGoal:
    | "menu_discovery"
    | "product_trial"
    | "sale_conversion"
    | "promotion_awareness";
  subjectBinding: TemplateSubjectBinding;
  offerIntent: TemplateOfferIntent;
  layoutIntent: "copy_focused" | "hero_focused" | "badge_led";
  tone: "bright_playful";
  backgroundColorHex?: string | null;
  assetPolicy: TemplateAssetPolicy;
  searchKeywords: string[];
  facets: {
    seasonality: "spring" | null;
    menuType: "food_menu" | "drink_menu" | null;
    promotionStyle:
      | "seasonal_menu_launch"
      | "new_product_promo"
      | "sale_campaign"
      | "general_campaign";
    offerSpecificity: "single_product" | "multi_item" | "broad_offer";
  };
  brandConstraints: {
    palette: string[];
    typographyHint: string | null;
    forbiddenStyles: string[];
  };
  primaryVisualPolicy: TemplatePrimaryVisualPolicy;
}

export function parseTemplateSemanticBriefDraft(
  value: unknown,
): TemplateSemanticBriefDraft {
  return TemplateSemanticBriefDraftSchema.parse(value);
}

// Transitional compile-time aliases while worker internals are renamed to brief-native types.
export const TemplateIntentDraftSchema = TemplateSemanticBriefDraftSchema;
export type TemplateIntentDraft = TemplateSemanticBriefDraft;

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
