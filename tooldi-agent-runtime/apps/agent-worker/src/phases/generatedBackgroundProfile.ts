import type { NormalizedIntent, SearchProfileArtifact } from "../types.js";

export function createGeneratedBackgroundProfile(
  intent: NormalizedIntent,
): SearchProfileArtifact["background"] {
  return {
    objective: "seasonal_backdrop",
    rationale:
      "Background is generated as a solid color for the current generic-promo representative path, and the planner-chosen hex remains the canonical backdrop input.",
    sourceMode: "generated_solid",
    colorHex: intent.backgroundColorHex ?? "#ffffff",
    queries: [],
  };
}
