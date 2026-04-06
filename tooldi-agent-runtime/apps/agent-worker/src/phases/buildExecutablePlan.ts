import type { ExecutablePlan } from "@tooldi/agent-contracts";
import { createRequestId } from "@tooldi/agent-domain";
import type { ToolRegistry } from "@tooldi/tool-registry";

import type { HydratedPlanningInput, NormalizedIntent } from "../types.js";

export interface BuildExecutablePlanDependencies {
  toolRegistry: ToolRegistry;
}

export async function buildExecutablePlan(
  input: HydratedPlanningInput,
  normalizedIntent: NormalizedIntent,
  dependencies: BuildExecutablePlanDependencies,
): Promise<ExecutablePlan> {
  const primaryTool =
    dependencies.toolRegistry.listEnabledTools()[0] ?? {
      toolName: "text-layout",
      toolVersion: "v1-stub",
      kind: "analysis" as const,
      description: "fallback stub",
    };

  return {
    planId: createRequestId(),
    planVersion: 1,
    planSchemaVersion: "v1-stub",
    runId: input.job.runId,
    traceId: input.job.traceId,
    attemptSeq: input.job.attemptSeq,
    intent: {
      operationFamily: normalizedIntent.operationFamily,
      artifactType: normalizedIntent.artifactType,
    },
    constraintsRef: `constraints_ref_${input.job.runId}`,
    actions: [
      {
        actionId: createRequestId(),
        kind: "canvas_mutation",
        operation: "emit_skeleton_create_layer",
        toolName: primaryTool.toolName,
        toolVersion: primaryTool.toolVersion,
        commitGroup: createRequestId(),
        liveCommit: true,
        idempotencyKey: `plan_${input.job.runId}_${input.job.attemptSeq}`,
        dependsOn: [],
        targetRef: {
          documentId: input.request.editorContext.documentId,
          pageId: input.request.editorContext.pageId,
          layerId: null,
          slotKey: "headline",
        },
        inputs: {
          goalSummary: normalizedIntent.goalSummary,
          requestedOutputCount: normalizedIntent.requestedOutputCount,
        },
        rollback: {
          strategy: "delete_created_layers",
        },
      },
    ],
  };
}
