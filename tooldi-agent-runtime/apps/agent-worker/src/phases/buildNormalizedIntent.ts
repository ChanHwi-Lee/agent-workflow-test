import { createRequestId } from "@tooldi/agent-domain";

import type { HydratedPlanningInput, NormalizedIntent } from "../types.js";

export async function buildNormalizedIntent(
  input: HydratedPlanningInput,
): Promise<NormalizedIntent> {
  const operationFamily =
    input.request.editorContext.canvasState === "empty"
      ? "create_template"
      : "update_layer";

  return {
    intentId: createRequestId(),
    runId: input.job.runId,
    traceId: input.job.traceId,
    operationFamily,
    artifactType: "LiveDraftArtifactBundle",
    goalSummary: input.request.userInput.prompt,
    requestedOutputCount: input.request.runPolicy.requestedOutputCount,
    supportedInV1: operationFamily === "create_template",
    futureCapableOperations: [
      "create_template",
      "update_layer",
      "delete_layer",
    ],
  };
}
