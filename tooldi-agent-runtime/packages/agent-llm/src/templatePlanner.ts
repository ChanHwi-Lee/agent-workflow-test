import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import type { AgentWorkerEnv } from "@tooldi/agent-config";
import type { Logger } from "@tooldi/agent-observability";
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

const TemplateAssetPolicyCompatibilitySchema = z.object({
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

const legacyTemplateAssetPolicyMap: Record<
  LegacyTemplateAssetPolicy,
  TemplateAssetPolicy
> = {
  graphic_allowed_photo_optional: {
    allowedFamilies: ["background", "graphic", "photo"],
    preferredFamilies: ["graphic"],
    primaryVisualPolicy: "graphic_preferred",
    avoidFamilies: [],
  },
  photo_preferred_graphic_allowed: {
    allowedFamilies: ["background", "photo", "graphic"],
    preferredFamilies: ["photo", "graphic"],
    primaryVisualPolicy: "photo_preferred",
    avoidFamilies: [],
  },
};

const balancedTemplateAssetPolicy: TemplateAssetPolicy = {
  allowedFamilies: ["background", "graphic", "photo"],
  preferredFamilies: ["graphic", "photo"],
  primaryVisualPolicy: "balanced",
  avoidFamilies: [],
};

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

interface StructuredOutputModel<TSchema extends z.ZodTypeAny> {
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

export function createTemplatePlanner(
  env: Pick<
    AgentWorkerEnv,
    | "templatePlannerMode"
    | "templatePlannerProvider"
    | "templatePlannerModel"
    | "templatePlannerTemperature"
  >,
  logger: Logger,
): TemplatePlanner {
  if (env.templatePlannerMode === "heuristic") {
    return createHeuristicTemplatePlanner();
  }

  const provider = env.templatePlannerProvider;
  const modelName = env.templatePlannerModel;
  if (!provider || !modelName) {
    throw new Error(
      "TEMPLATE_PLANNER_MODE=langchain requires TEMPLATE_PLANNER_PROVIDER and TEMPLATE_PLANNER_MODEL",
    );
  }

  logger.info("LangChain template planner configured", {
    provider,
    model: modelName,
    temperature: env.templatePlannerTemperature,
  });

  return createLangChainTemplatePlanner({
    provider,
    modelName,
    temperature: env.templatePlannerTemperature,
  });
}

export function createHeuristicTemplatePlanner(): TemplatePlanner {
  return {
    mode: "heuristic",
    async plan(input) {
      const prompt = input.prompt.trim();
      const domain = inferDomain(prompt);
      const promotionStyle = inferPromotionStyle(prompt, domain);
      const menuType = inferMenuType(prompt, domain);
      const campaignGoal = inferCampaignGoal(promotionStyle);
      return {
        goalSummary: prompt,
        templateKind:
          promotionStyle === "sale_campaign"
            ? "seasonal_sale_banner"
            : "promo_banner",
        domain,
        audience: inferAudience(domain),
        campaignGoal,
        layoutIntent:
          prompt.includes("뱃지") || prompt.includes("쿠폰")
            ? "badge_led"
            : domain === "cafe" || promotionStyle === "new_product_promo"
              ? "hero_focused"
              : "copy_focused",
        tone: "bright_playful",
        assetPolicy: normalizeTemplateAssetPolicy(
          domain === "cafe" || menuType !== null
            ? "photo_preferred_graphic_allowed"
            : "graphic_allowed_photo_optional",
        ),
        searchKeywords: inferSearchKeywords(prompt, domain, promotionStyle, menuType),
        typographyHint:
          domain === "fashion_retail"
            ? "세련된 고딕 계열로 명확한 가격/혜택 강조"
            : domain === "cafe"
              ? "가독성이 높은 둥근 고딕 계열"
              : null,
        facets: {
          seasonality: prompt.includes("봄") ? "spring" : null,
          menuType,
          promotionStyle,
          offerSpecificity:
            promotionStyle === "sale_campaign"
              ? "broad_offer"
              : menuType === null
                ? "multi_item"
                : "single_product",
        },
      };
    },
  };
}

export function createLangChainTemplatePlanner(config: {
  provider: TemplatePlannerProvider;
  modelName: string;
  temperature: number;
  modelOverride?: StructuredOutputModel<typeof TemplateIntentDraftSchema>;
}): TemplatePlanner {
  const model =
    config.modelOverride ??
    createStructuredOutputModel(
      config.provider,
      config.modelName,
      config.temperature,
    );
  const structuredModel = model.withStructuredOutput(TemplateIntentDraftSchema);

  return {
    mode: "langchain",
    async plan(input) {
      const result = await structuredModel.invoke([
        {
          role: "system",
          content:
            "You are a template-planning assistant for Tooldi's current create-template slice. " +
            "Return a concise Korean design brief. " +
            "Choose only supported enum values. " +
            "Until generic retrieval lands, include '봄' in searchKeywords. " +
            "Assume the rollout focuses on Korean marketing banners for restaurant, cafe, and fashion retail prompts.",
        },
        {
          role: "user",
          content:
            `Prompt: ${input.prompt}\n` +
            `Canvas preset: ${input.canvasPreset}\n` +
            `Brand palette: ${input.palette.join(", ") || "none"}\n` +
            "Return a structured planning draft for the current spring template workflow.",
        },
      ]);

      return {
        ...result,
        assetPolicy: normalizeTemplateAssetPolicy(result.assetPolicy),
        searchKeywords: result.searchKeywords.includes("봄")
          ? result.searchKeywords
          : ["봄", ...result.searchKeywords].slice(0, 5),
      };
    },
  };
}

function createStructuredOutputModel(
  provider: TemplatePlannerProvider,
  modelName: string,
  temperature: number,
): StructuredOutputModel<typeof TemplateIntentDraftSchema> {
  if (provider === "openai") {
    return new ChatOpenAI({
      model: modelName,
      temperature,
    }) as StructuredOutputModel<typeof TemplateIntentDraftSchema>;
  }

  if (provider === "anthropic") {
    return new ChatAnthropic({
      model: modelName,
      temperature,
    }) as StructuredOutputModel<typeof TemplateIntentDraftSchema>;
  }

  return new ChatGoogleGenerativeAI({
    model: modelName,
    temperature,
  }) as StructuredOutputModel<typeof TemplateIntentDraftSchema>;
}

export function normalizeTemplateAssetPolicy(
  value: TemplateAssetPolicyInput | null | undefined,
): TemplateAssetPolicy {
  if (value === null || value === undefined) {
    return cloneTemplateAssetPolicy(
      legacyTemplateAssetPolicyMap.graphic_allowed_photo_optional,
    );
  }

  if (typeof value === "string") {
    return cloneTemplateAssetPolicy(legacyTemplateAssetPolicyMap[value]);
  }

  const defaultPolicy = resolveTemplateAssetPolicyDefaults(value);
  const allowedFamilies = uniqueAssetFamilies(
    ensureBackgroundFamily(
      value.allowedFamilies && value.allowedFamilies.length > 0
        ? value.allowedFamilies
        : defaultPolicy.allowedFamilies,
    ),
  );
  const avoidFamilies = uniqueAssetFamilies(
    value.avoidFamilies ?? defaultPolicy.avoidFamilies,
  );
  const preferredFamilies = uniqueAssetFamilies(
    (value.preferredFamilies && value.preferredFamilies.length > 0
      ? value.preferredFamilies
      : defaultPolicy.preferredFamilies
    ).filter(
      (family) => allowedFamilies.includes(family),
    ),
  );
  const primaryVisualPolicy = resolveCompatiblePrimaryVisualPolicy(
    value,
    allowedFamilies,
    defaultPolicy,
  );
  const primaryFamily = resolvePrimaryVisualFamily(primaryVisualPolicy);

  return {
    allowedFamilies,
    preferredFamilies:
      primaryFamily !== null && allowedFamilies.includes(primaryFamily)
        ? [
            primaryFamily,
            ...preferredFamilies.filter((family) => family !== primaryFamily),
          ]
        : preferredFamilies,
    primaryVisualPolicy,
    avoidFamilies,
  };
}

export function parseTemplateIntentDraft(value: unknown): TemplateIntentDraft {
  return TemplateIntentDraftSchema.parse(value);
}

export function templateAssetPolicyAllowsFamily(
  assetPolicy: TemplateAssetPolicyInput | TemplateAssetPolicy | null | undefined,
  family: TemplateAssetFamily,
): boolean {
  const normalizedAssetPolicy = normalizeTemplateAssetPolicy(assetPolicy);
  return normalizedAssetPolicy.allowedFamilies.includes(family);
}

export function templateAssetPolicyPrefersPhoto(
  assetPolicy: TemplateAssetPolicyInput | TemplateAssetPolicy | null | undefined,
): boolean {
  const normalizedAssetPolicy = normalizeTemplateAssetPolicy(assetPolicy);
  return (
    normalizedAssetPolicy.primaryVisualPolicy === "photo_preferred" &&
    normalizedAssetPolicy.allowedFamilies.includes("photo")
  );
}

export function templateAssetPolicyPenaltyForFamily(
  assetPolicy: TemplateAssetPolicyInput | TemplateAssetPolicy | null | undefined,
  family: TemplateAssetFamily,
): number {
  const normalizedAssetPolicy = normalizeTemplateAssetPolicy(assetPolicy);
  return normalizedAssetPolicy.avoidFamilies.includes(family) ? 0.08 : 0;
}

function inferDomain(
  prompt: string,
): TemplateIntentDraft["domain"] {
  if (prompt.includes("식당") || prompt.includes("레스토랑")) {
    return "restaurant";
  }
  if (prompt.includes("카페")) {
    return "cafe";
  }
  if (prompt.includes("패션") || prompt.includes("리테일") || prompt.includes("의류")) {
    return "fashion_retail";
  }
  return "general_marketing";
}

function inferPromotionStyle(
  prompt: string,
  domain: TemplateIntentDraft["domain"],
): TemplateIntentDraft["facets"]["promotionStyle"] {
  if (prompt.includes("세일") || prompt.includes("할인")) {
    return "sale_campaign";
  }
  if (
    prompt.includes("신메뉴") ||
    prompt.includes("신상") ||
    prompt.includes("계절메뉴")
  ) {
    return domain === "cafe" || domain === "restaurant"
      ? "seasonal_menu_launch"
      : "new_product_promo";
  }
  if (prompt.includes("출시") || prompt.includes("홍보")) {
    return "new_product_promo";
  }
  return "general_campaign";
}

function inferMenuType(
  prompt: string,
  domain: TemplateIntentDraft["domain"],
): TemplateIntentDraft["facets"]["menuType"] {
  if (prompt.includes("음료") || prompt.includes("커피")) {
    return "drink_menu";
  }
  if (
    domain === "restaurant" ||
    prompt.includes("메뉴") ||
    prompt.includes("요리")
  ) {
    return "food_menu";
  }
  return null;
}

function inferCampaignGoal(
  promotionStyle: TemplateIntentDraft["facets"]["promotionStyle"],
): TemplateIntentDraft["campaignGoal"] {
  switch (promotionStyle) {
    case "seasonal_menu_launch":
      return "menu_discovery";
    case "new_product_promo":
      return "product_trial";
    case "sale_campaign":
      return "sale_conversion";
    case "general_campaign":
      return "promotion_awareness";
  }
}

function inferAudience(
  domain: TemplateIntentDraft["domain"],
): TemplateIntentDraft["audience"] {
  switch (domain) {
    case "restaurant":
      return "walk_in_customers";
    case "cafe":
      return "local_visitors";
    case "fashion_retail":
      return "sale_shoppers";
    case "general_marketing":
      return "general_consumers";
  }
}

function inferSearchKeywords(
  prompt: string,
  domain: TemplateIntentDraft["domain"],
  promotionStyle: TemplateIntentDraft["facets"]["promotionStyle"],
  menuType: TemplateIntentDraft["facets"]["menuType"],
): string[] {
  const keywords = new Set<string>();
  keywords.add("봄");

  switch (domain) {
    case "restaurant":
      keywords.add("식당");
      break;
    case "cafe":
      keywords.add("카페");
      break;
    case "fashion_retail":
      keywords.add("패션");
      break;
    default:
      keywords.add("프로모션");
      break;
  }

  if (menuType === "food_menu") {
    keywords.add("메뉴");
  }
  if (menuType === "drink_menu") {
    keywords.add("음료");
  }

  if (promotionStyle === "seasonal_menu_launch") {
    keywords.add("신메뉴");
  } else if (promotionStyle === "new_product_promo") {
    keywords.add("프로모션");
  } else if (promotionStyle === "sale_campaign") {
    keywords.add("세일");
  }

  for (const token of prompt.split(/\s+/)) {
    const normalized = token.trim().replace(/[^\p{L}\p{N}]/gu, "");
    if (!normalized) {
      continue;
    }
    if (normalized.length >= 2) {
      keywords.add(normalized);
    }
    if (keywords.size >= 5) {
      break;
    }
  }

  return [...keywords].slice(0, 5);
}

function resolvePrimaryVisualFamily(
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

function resolveTemplateAssetPolicyDefaults(
  value: Exclude<TemplateAssetPolicyInput, LegacyTemplateAssetPolicy>,
): TemplateAssetPolicy {
  if (value.primaryVisualPolicy === "balanced") {
    return cloneTemplateAssetPolicy(balancedTemplateAssetPolicy);
  }
  if (value.primaryVisualPolicy === "photo_preferred") {
    return cloneTemplateAssetPolicy(
      legacyTemplateAssetPolicyMap.photo_preferred_graphic_allowed,
    );
  }
  if (value.primaryVisualPolicy === "graphic_preferred") {
    return cloneTemplateAssetPolicy(
      legacyTemplateAssetPolicyMap.graphic_allowed_photo_optional,
    );
  }
  if (value.preferredFamilies?.[0] === "photo") {
    return cloneTemplateAssetPolicy(
      legacyTemplateAssetPolicyMap.photo_preferred_graphic_allowed,
    );
  }
  if (value.preferredFamilies?.[0] === "graphic") {
    return cloneTemplateAssetPolicy(
      legacyTemplateAssetPolicyMap.graphic_allowed_photo_optional,
    );
  }
  if (
    value.preferredFamilies?.includes("graphic") &&
    value.preferredFamilies?.includes("photo")
  ) {
    return cloneTemplateAssetPolicy(balancedTemplateAssetPolicy);
  }
  if (
    value.allowedFamilies?.[0] === "photo" &&
    value.allowedFamilies.includes("graphic")
  ) {
    return cloneTemplateAssetPolicy(
      legacyTemplateAssetPolicyMap.photo_preferred_graphic_allowed,
    );
  }
  return cloneTemplateAssetPolicy(
    legacyTemplateAssetPolicyMap.graphic_allowed_photo_optional,
  );
}

function resolveCompatiblePrimaryVisualPolicy(
  value: Exclude<TemplateAssetPolicyInput, LegacyTemplateAssetPolicy>,
  allowedFamilies: TemplateAssetFamily[],
  defaultPolicy: TemplateAssetPolicy,
): TemplatePrimaryVisualPolicy {
  if (value.primaryVisualPolicy) {
    const primaryFamily = resolvePrimaryVisualFamily(value.primaryVisualPolicy);
    if (primaryFamily === null || allowedFamilies.includes(primaryFamily)) {
      return value.primaryVisualPolicy;
    }
  }

  const preferredFamilies = (
    value.preferredFamilies && value.preferredFamilies.length > 0
      ? value.preferredFamilies
      : defaultPolicy.preferredFamilies
  ).filter((family) => allowedFamilies.includes(family));
  if (
    preferredFamilies.includes("graphic") &&
    preferredFamilies.includes("photo")
  ) {
    return "balanced";
  }
  if (preferredFamilies[0] === "photo") {
    return "photo_preferred";
  }
  if (preferredFamilies[0] === "graphic") {
    return "graphic_preferred";
  }

  const fallbackFamily = allowedFamilies.find((family) => family !== "background");
  if (fallbackFamily) {
    return fallbackFamily === "photo" ? "photo_preferred" : "graphic_preferred";
  }

  return defaultPolicy.primaryVisualPolicy;
}

function cloneTemplateAssetPolicy(
  policy: TemplateAssetPolicy,
): TemplateAssetPolicy {
  return {
    allowedFamilies: [...policy.allowedFamilies],
    preferredFamilies: [...policy.preferredFamilies],
    primaryVisualPolicy: policy.primaryVisualPolicy,
    avoidFamilies: [...policy.avoidFamilies],
  };
}

function uniqueAssetFamilies(
  families: TemplateAssetFamily[],
): TemplateAssetFamily[] {
  return [...new Set(families)];
}

function ensureBackgroundFamily(
  families: TemplateAssetFamily[],
): TemplateAssetFamily[] {
  return families.includes("background")
    ? families
    : ["background", ...families];
}
