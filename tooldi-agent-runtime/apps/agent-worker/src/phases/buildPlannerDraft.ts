import type { TemplatePlanner } from "@tooldi/agent-llm";

import type { HydratedPlanningInput } from "../types.js";

import {
  resolvePlannerDraft,
  type ResolvedPlannerDraft,
} from "./resolvePlannerDraft.js";

export async function buildPlannerDraft(
  input: HydratedPlanningInput,
  dependencies?: {
    templatePlanner?: TemplatePlanner;
  },
): Promise<ResolvedPlannerDraft> {
  return resolvePlannerDraft(input, dependencies);
}
