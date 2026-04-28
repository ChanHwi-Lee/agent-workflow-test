import type { CanvasMutationCommand } from "@tooldi/agent-contracts";
import { createRequestId } from "@tooldi/agent-domain";

export function buildSaveTemplateCommand(
  stage: string,
  reason: "milestone_first_editable" | "run_completed",
): Extract<CanvasMutationCommand, { op: "saveTemplate" }> {
  return {
    commandId: createRequestId(),
    op: "saveTemplate",
    targetRef: {},
    targetLayerVersion: null,
    allowNoop: false,
    metadataTags: {
      source: "agent-worker-spring-template",
      stage,
    },
    reason,
  } satisfies CanvasMutationCommand;
}
