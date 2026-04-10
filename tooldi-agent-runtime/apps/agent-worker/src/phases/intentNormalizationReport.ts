import { createRequestId } from "@tooldi/agent-domain";

import type {
  HydratedPlanningInput,
  IntentConsistencyFlag,
  IntentNormalizationRepair,
  IntentNormalizationReport,
  NormalizedIntent,
} from "../types.js";

export function createIntentNormalizationReport(input: {
  input: HydratedPlanningInput;
  plannerMode: NormalizedIntent["plannerMode"];
  prompt: string;
  draftAvailable: boolean;
  repairs: IntentNormalizationRepair[];
  intent: NormalizedIntent;
}): IntentNormalizationReport {
  const { input: hydratedInput, plannerMode, prompt, draftAvailable, repairs, intent } =
    input;

  return {
    reportId: createRequestId(),
    runId: hydratedInput.job.runId,
    traceId: hydratedInput.job.traceId,
    plannerMode,
    prompt,
    draftAvailable,
    repairCount: repairs.length,
    appliedRepairs: repairs.map((repair) => ({
      ...repair,
      ...(Array.isArray(repair.before) ? { before: [...repair.before] } : {}),
      ...(Array.isArray(repair.after) ? { after: [...repair.after] } : {}),
    })),
    consistencyFlags: cloneConsistencyFlags(intent.consistencyFlags),
    normalizationNotes: [...intent.normalizationNotes],
  };
}

export function cloneConsistencyFlags(
  flags: IntentConsistencyFlag[],
): IntentConsistencyFlag[] {
  return flags.map((flag) => ({
    ...flag,
    fields: [...flag.fields],
  }));
}
