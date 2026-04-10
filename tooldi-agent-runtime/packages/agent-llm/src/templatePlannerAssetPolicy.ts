import type {
  LegacyTemplateAssetPolicy,
  TemplateAssetFamily,
  TemplateAssetPolicy,
  TemplateAssetPolicyInput,
  TemplatePrimaryVisualPolicy,
} from "./templatePlannerSchemas.js";
import { resolvePrimaryVisualFamily } from "./templatePlannerSchemas.js";

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
