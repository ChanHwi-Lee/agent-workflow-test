import type { ExecutablePlan } from "@tooldi/agent-contracts";
import { createRequestId } from "@tooldi/agent-domain";
import type { TextLayoutHelper } from "@tooldi/tool-adapters";

import type {
  HydratedPlanningInput,
  NormalizedIntent,
  SkeletonMutationBatch,
} from "../types.js";

export interface EmitSkeletonMutationsDependencies {
  textLayoutHelper: TextLayoutHelper;
}

export async function emitSkeletonMutations(
  input: HydratedPlanningInput,
  normalizedIntent: NormalizedIntent,
  plan: ExecutablePlan,
  dependencies: EmitSkeletonMutationsDependencies,
): Promise<SkeletonMutationBatch> {
  const headline = normalizedIntent.goalSummary.slice(0, 48);
  const layout = await dependencies.textLayoutHelper.estimate({
    text: headline,
    maxWidth: Math.max(320, input.request.editorContext.canvasWidth - 160),
  });

  const mutationId = createRequestId();
  const rollbackGroupId = createRequestId();
  const commitGroup = plan.actions[0]?.commitGroup ?? createRequestId();

  return {
    commitGroup,
    proposals: [
      {
        mutationId,
        rollbackGroupId,
        mutation: {
          mutationId,
          mutationVersion: "v1",
          traceId: input.job.traceId,
          runId: input.job.runId,
          draftId: `draft_${input.job.runId}`,
          documentId: input.request.editorContext.documentId,
          pageId: input.request.editorContext.pageId,
          seq: 1,
          commitGroup,
          idempotencyKey: `mutation_${mutationId}`,
          expectedBaseRevision: 0,
          ownershipScope: "draft_only",
          commands: [
            {
              commandId: createRequestId(),
              op: "createLayer",
              slotKey: "background",
              clientLayerKey: `background_${input.job.runId}`,
              targetRef: {
                layerId: null,
                clientLayerKey: `background_${input.job.runId}`,
                slotKey: "background",
              },
              targetLayerVersion: null,
              parentRef: {
                position: "append",
              },
              expectedLayerType: null,
              allowNoop: false,
              metadataTags: {
                source: "agent-worker-skeleton",
              },
              layerBlueprint: {
                layerType: "shape",
                bounds: {
                  x: 0,
                  y: 0,
                  width: input.request.editorContext.canvasWidth,
                  height: input.request.editorContext.canvasHeight,
                },
                metadata: {
                  role: "background",
                },
              },
              editable: true,
            },
            {
              commandId: createRequestId(),
              op: "createLayer",
              slotKey: "headline",
              clientLayerKey: `headline_${input.job.runId}`,
              targetRef: {
                layerId: null,
                clientLayerKey: `headline_${input.job.runId}`,
                slotKey: "headline",
              },
              targetLayerVersion: null,
              parentRef: {
                position: "append",
              },
              expectedLayerType: null,
              allowNoop: false,
              metadataTags: {
                source: "agent-worker-skeleton",
              },
              layerBlueprint: {
                layerType: "text",
                bounds: {
                  x: 80,
                  y: 120,
                  width: layout.width,
                  height: layout.height,
                },
                metadata: {
                  estimatedLineCount: layout.estimatedLineCount,
                },
              },
              editable: true,
            },
            {
              commandId: createRequestId(),
              op: "createLayer",
              slotKey: "supporting_copy",
              clientLayerKey: `supporting_copy_${input.job.runId}`,
              targetRef: {
                layerId: null,
                clientLayerKey: `supporting_copy_${input.job.runId}`,
                slotKey: "supporting_copy",
              },
              targetLayerVersion: null,
              parentRef: {
                position: "append",
              },
              expectedLayerType: null,
              allowNoop: false,
              metadataTags: {
                source: "agent-worker-skeleton",
              },
              layerBlueprint: {
                layerType: "text",
                bounds: {
                  x: 80,
                  y: 280,
                  width: Math.max(320, input.request.editorContext.canvasWidth - 160),
                  height: 80,
                },
                metadata: {
                  textRole: "supporting_copy",
                },
              },
              editable: true,
            },
            {
              commandId: createRequestId(),
              op: "createLayer",
              slotKey: "cta",
              clientLayerKey: `cta_${input.job.runId}`,
              targetRef: {
                layerId: null,
                clientLayerKey: `cta_${input.job.runId}`,
                slotKey: "cta",
              },
              targetLayerVersion: null,
              parentRef: {
                position: "append",
              },
              expectedLayerType: null,
              allowNoop: false,
              metadataTags: {
                source: "agent-worker-skeleton",
              },
              layerBlueprint: {
                layerType: "group",
                bounds: {
                  x: 80,
                  y: 420,
                  width: 220,
                  height: 72,
                },
                metadata: {
                  role: "cta",
                },
              },
              editable: true,
            },
            {
              commandId: createRequestId(),
              op: "createLayer",
              slotKey: "decoration",
              clientLayerKey: `decoration_${input.job.runId}`,
              targetRef: {
                layerId: null,
                clientLayerKey: `decoration_${input.job.runId}`,
                slotKey: "decoration",
              },
              targetLayerVersion: null,
              parentRef: {
                position: "append",
              },
              expectedLayerType: null,
              allowNoop: false,
              metadataTags: {
                source: "agent-worker-skeleton",
              },
              layerBlueprint: {
                layerType: "shape",
                bounds: {
                  x: input.request.editorContext.canvasWidth - 220,
                  y: 60,
                  width: 140,
                  height: 140,
                },
                metadata: {
                  role: "decoration",
                },
              },
              editable: true,
            },
          ],
          rollbackHint: {
            rollbackGroupId,
            strategy: "delete_created_layers",
          },
          emittedAt: new Date().toISOString(),
          deliveryDeadlineAt: new Date(Date.now() + 10000).toISOString(),
        },
      },
    ],
  };
}
