import type { ExecutablePlan } from "@tooldi/agent-contracts";
import { createRequestId } from "@tooldi/agent-domain";
import type { TextLayoutHelper } from "@tooldi/tool-adapters";

import type {
  HydratedPlanningInput,
  MutationProposalDraft,
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

  const commitGroup = plan.actions[0]?.commitGroup ?? createRequestId();
  const draftId = `draft_${input.job.runId}`;
  const documentId = input.request.editorContext.documentId;
  const pageId = input.request.editorContext.pageId;
  const canvasWidth = input.request.editorContext.canvasWidth;
  const canvasHeight = input.request.editorContext.canvasHeight;

  const createProposal = (options: {
    seq: number;
    stageLabel: string;
    stageDescription: string;
    expectedBaseRevision: number;
    dependsOnSeq?: number;
    commands: MutationProposalDraft["mutation"]["commands"];
  }): MutationProposalDraft => {
    const mutationId = createRequestId();
    const rollbackGroupId = createRequestId();

    return {
      mutationId,
      rollbackGroupId,
      stageLabel: options.stageLabel,
      stageDescription: options.stageDescription,
      mutation: {
        mutationId,
        mutationVersion: "v1",
        traceId: input.job.traceId,
        runId: input.job.runId,
        draftId,
        documentId,
        pageId,
        seq: options.seq,
        commitGroup,
        ...(typeof options.dependsOnSeq === "number"
          ? { dependsOnSeq: options.dependsOnSeq }
          : {}),
        idempotencyKey: `mutation_${options.stageLabel}_${input.job.runId}`,
        expectedBaseRevision: options.expectedBaseRevision,
        ownershipScope: "draft_only",
        commands: options.commands,
        rollbackHint: {
          rollbackGroupId,
          strategy: "delete_created_layers",
        },
        emittedAt: new Date().toISOString(),
        deliveryDeadlineAt: new Date(Date.now() + 10000).toISOString(),
      },
    };
  };

  return {
    commitGroup,
    proposals: [
      createProposal({
        seq: 1,
        stageLabel: "foundation",
        stageDescription: "Create the base composition and hero frame",
        expectedBaseRevision: 0,
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
              stage: "foundation",
            },
            layerBlueprint: {
              layerType: "shape",
              bounds: {
                x: 0,
                y: 0,
                width: canvasWidth,
                height: canvasHeight,
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
            slotKey: "hero_image",
            clientLayerKey: `hero_panel_${input.job.runId}`,
            targetRef: {
              layerId: null,
              clientLayerKey: `hero_panel_${input.job.runId}`,
              slotKey: "hero_image",
            },
            targetLayerVersion: null,
            parentRef: {
              position: "append",
            },
            expectedLayerType: null,
            allowNoop: false,
            metadataTags: {
              source: "agent-worker-skeleton",
              stage: "foundation",
            },
            layerBlueprint: {
              layerType: "shape",
              bounds: {
                x: 560,
                y: 80,
                width: 440,
                height: 420,
              },
              metadata: {
                role: "hero_panel",
              },
            },
            editable: true,
          },
          {
            commandId: createRequestId(),
            op: "createLayer",
            slotKey: "badge",
            clientLayerKey: `badge_${input.job.runId}`,
            targetRef: {
              layerId: null,
              clientLayerKey: `badge_${input.job.runId}`,
              slotKey: "badge",
            },
            targetLayerVersion: null,
            parentRef: {
              position: "append",
            },
            expectedLayerType: null,
            allowNoop: false,
            metadataTags: {
              source: "agent-worker-skeleton",
              stage: "foundation",
            },
            layerBlueprint: {
              layerType: "text",
              bounds: {
                x: 80,
                y: 86,
                width: 220,
                height: 36,
              },
              metadata: {
                role: "badge",
              },
            },
            editable: true,
          },
          {
            commandId: createRequestId(),
            op: "createLayer",
            slotKey: null,
            clientLayerKey: `ribbon_strip_${input.job.runId}`,
            targetRef: {
              layerId: null,
              clientLayerKey: `ribbon_strip_${input.job.runId}`,
            },
            targetLayerVersion: null,
            parentRef: {
              position: "append",
            },
            expectedLayerType: null,
            allowNoop: false,
            metadataTags: {
              source: "agent-worker-skeleton",
              stage: "foundation",
            },
            layerBlueprint: {
              layerType: "shape",
              bounds: {
                x: 80,
                y: 540,
                width: 180,
                height: 20,
              },
              metadata: {
                role: "ribbon_strip",
              },
            },
            editable: true,
          },
        ],
      }),
      createProposal({
        seq: 2,
        stageLabel: "copy",
        stageDescription: "Add primary copy and promotional text",
        expectedBaseRevision: 1,
        dependsOnSeq: 1,
        commands: [
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
              stage: "copy",
            },
            layerBlueprint: {
              layerType: "text",
              bounds: {
                x: 80,
                y: 140,
                width: layout.width,
                height: layout.height,
              },
              metadata: {
                role: "headline",
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
              stage: "copy",
            },
            layerBlueprint: {
              layerType: "text",
              bounds: {
                x: 80,
                y: 280,
                width: Math.max(320, canvasWidth - 160),
                height: 80,
              },
              metadata: {
                role: "supporting_copy",
              },
            },
            editable: true,
          },
          {
            commandId: createRequestId(),
            op: "createLayer",
            slotKey: null,
            clientLayerKey: `price_callout_${input.job.runId}`,
            targetRef: {
              layerId: null,
              clientLayerKey: `price_callout_${input.job.runId}`,
            },
            targetLayerVersion: null,
            parentRef: {
              position: "append",
            },
            expectedLayerType: null,
            allowNoop: false,
            metadataTags: {
              source: "agent-worker-skeleton",
              stage: "copy",
            },
            layerBlueprint: {
              layerType: "text",
              bounds: {
                x: 80,
                y: 390,
                width: 340,
                height: 56,
              },
              metadata: {
                role: "price_callout",
              },
            },
            editable: true,
          },
          {
            commandId: createRequestId(),
            op: "createLayer",
            slotKey: null,
            clientLayerKey: `hero_caption_${input.job.runId}`,
            targetRef: {
              layerId: null,
              clientLayerKey: `hero_caption_${input.job.runId}`,
            },
            targetLayerVersion: null,
            parentRef: {
              position: "append",
            },
            expectedLayerType: null,
            allowNoop: false,
            metadataTags: {
              source: "agent-worker-skeleton",
              stage: "copy",
            },
            layerBlueprint: {
              layerType: "text",
              bounds: {
                x: 600,
                y: 430,
                width: 340,
                height: 36,
              },
              metadata: {
                role: "hero_caption",
              },
            },
            editable: true,
          },
        ],
      }),
      createProposal({
        seq: 3,
        stageLabel: "polish",
        stageDescription: "Add CTA and finishing decoration",
        expectedBaseRevision: 2,
        dependsOnSeq: 2,
        commands: [
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
              stage: "polish",
            },
            layerBlueprint: {
              layerType: "group",
              bounds: {
                x: 80,
                y: 470,
                width: 240,
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
              stage: "polish",
            },
            layerBlueprint: {
              layerType: "shape",
              bounds: {
                x: 730,
                y: 560,
                width: 270,
                height: 260,
              },
              metadata: {
                role: "spotlight_panel",
              },
            },
            editable: true,
          },
          {
            commandId: createRequestId(),
            op: "createLayer",
            slotKey: null,
            clientLayerKey: `underline_bar_${input.job.runId}`,
            targetRef: {
              layerId: null,
              clientLayerKey: `underline_bar_${input.job.runId}`,
            },
            targetLayerVersion: null,
            parentRef: {
              position: "append",
            },
            expectedLayerType: null,
            allowNoop: false,
            metadataTags: {
              source: "agent-worker-skeleton",
              stage: "polish",
            },
            layerBlueprint: {
              layerType: "shape",
              bounds: {
                x: 80,
                y: 458,
                width: 130,
                height: 10,
              },
              metadata: {
                role: "underline_bar",
              },
            },
            editable: true,
          },
          {
            commandId: createRequestId(),
            op: "createLayer",
            slotKey: null,
            clientLayerKey: `footer_note_${input.job.runId}`,
            targetRef: {
              layerId: null,
              clientLayerKey: `footer_note_${input.job.runId}`,
            },
            targetLayerVersion: null,
            parentRef: {
              position: "append",
            },
            expectedLayerType: null,
            allowNoop: false,
            metadataTags: {
              source: "agent-worker-skeleton",
              stage: "polish",
            },
            layerBlueprint: {
              layerType: "text",
              bounds: {
                x: 80,
                y: 570,
                width: 360,
                height: 28,
              },
              metadata: {
                role: "footer_note",
              },
            },
            editable: true,
          },
        ],
      }),
    ],
  };
}
