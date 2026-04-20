import type {
  LegacyTemplateAssetPolicy,
  TemplateAssetFamily,
  TemplateAssetPolicy,
  TemplateAssetPolicyInput,
  TemplatePrimaryVisualPolicy,
} from "./templatePlannerSchemas.js";
import { resolvePrimaryVisualFamily } from "./templatePlannerSchemas.js";

const graphicPreferredTemplateAssetPolicy: TemplateAssetPolicy = {
  allowedFamilies: ["background", "graphic", "photo"],
  preferredFamilies: ["graphic"],
  primaryVisualPolicy: "graphic_preferred",
  avoidFamilies: [],
};

const photoPreferredTemplateAssetPolicy: TemplateAssetPolicy = {
  allowedFamilies: ["background", "photo", "graphic"],
  preferredFamilies: ["photo", "graphic"],
  primaryVisualPolicy: "photo_preferred",
  avoidFamilies: [],
};

const balancedTemplateAssetPolicy: TemplateAssetPolicy = {
  allowedFamilies: ["background", "graphic", "photo"],
  preferredFamilies: ["graphic", "photo"],
  primaryVisualPolicy: "balanced",
  avoidFamilies: [],
};

const templateAssetPolicyPresetMap: Record<
  TemplatePrimaryVisualPolicy,
  TemplateAssetPolicy
> = {
  graphic_preferred: graphicPreferredTemplateAssetPolicy,
  photo_preferred: photoPreferredTemplateAssetPolicy,
  balanced: balancedTemplateAssetPolicy,
};

const legacyTemplateAssetPolicyMap: Record<
  LegacyTemplateAssetPolicy,
  TemplatePrimaryVisualPolicy
> = {
  graphic_allowed_photo_optional: "graphic_preferred",
  photo_preferred_graphic_allowed: "photo_preferred",
};

export function createTemplateAssetPolicyPreset(
  primaryVisualPolicy: TemplatePrimaryVisualPolicy,
): TemplateAssetPolicy {
  return cloneTemplateAssetPolicy(
    templateAssetPolicyPresetMap[primaryVisualPolicy],
  );
}

export function normalizeTemplateAssetPolicy(
  value: TemplateAssetPolicyInput | null | undefined,
): TemplateAssetPolicy {
  if (value === null || value === undefined) {
    return createTemplateAssetPolicyPreset("graphic_preferred");
  }

  if (typeof value === "string") {
    return createTemplateAssetPolicyPreset(legacyTemplateAssetPolicyMap[value]);
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
    return createTemplateAssetPolicyPreset("balanced");
  }
  if (value.primaryVisualPolicy === "photo_preferred") {
    return createTemplateAssetPolicyPreset("photo_preferred");
  }
  if (value.primaryVisualPolicy === "graphic_preferred") {
    return createTemplateAssetPolicyPreset("graphic_preferred");
  }
  if (value.preferredFamilies?.[0] === "photo") {
    return createTemplateAssetPolicyPreset("photo_preferred");
  }
  if (value.preferredFamilies?.[0] === "graphic") {
    return createTemplateAssetPolicyPreset("graphic_preferred");
  }
  if (
    value.preferredFamilies?.includes("graphic") &&
    value.preferredFamilies?.includes("photo")
  ) {
    return createTemplateAssetPolicyPreset("balanced");
  }
  if (
    value.allowedFamilies?.[0] === "photo" &&
    value.allowedFamilies.includes("graphic")
  ) {
    return createTemplateAssetPolicyPreset("photo_preferred");
  }
  return createTemplateAssetPolicyPreset("graphic_preferred");
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
