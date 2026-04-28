import type { ExecutablePlan } from "@tooldi/agent-contracts";

import type {
  HydratedPlanningInput,
  NormalizedIntent,
  SkeletonMutationBatch,
} from "../types.js";
import { buildV6SkeletonBatch, isV6PlanAction } from "./emitV6Mutations.js";

export async function emitSkeletonMutations(
  input: HydratedPlanningInput,
  _normalizedIntent: NormalizedIntent,
  plan: ExecutablePlan,
): Promise<SkeletonMutationBatch> {
  if (!plan.actions.some(isV6PlanAction)) {
    throw new Error(
      "emitSkeletonMutations requires a v6 (object_native_v1) plan action",
    );
  }
  return buildV6SkeletonBatch(input, plan);
}
