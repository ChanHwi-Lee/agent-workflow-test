import type { CanvasMutationEnvelope } from "@tooldi/agent-contracts";

export function createFakeMutationEnvelope(input: {
  runId: string;
  traceId: string;
  mutationId: string;
  seq?: number;
  draftId?: string;
  documentId?: string;
  pageId?: string;
}): CanvasMutationEnvelope {
  return {
    mutationId: input.mutationId,
    mutationVersion: "v1",
    traceId: input.traceId,
    runId: input.runId,
    draftId: input.draftId ?? "draft-1",
    documentId: input.documentId ?? "document-1",
    pageId: input.pageId ?? "page-1",
    seq: input.seq ?? 1,
    commitGroup: "commit-group-1",
    idempotencyKey: `idempotency-${input.mutationId}`,
    expectedBaseRevision: 0,
    ownershipScope: "draft_only",
    commands: [
      {
        commandId: "command-1",
        op: "createLayer",
        slotKey: "headline",
        clientLayerKey: "headline-layer",
        targetRef: {
          layerId: null,
          clientLayerKey: "headline-layer",
        },
        targetLayerVersion: null,
        parentRef: {
          position: "append",
        },
        expectedLayerType: null,
        allowNoop: false,
        metadataTags: {},
        layerBlueprint: {
          layerType: "text",
          bounds: {
            x: 100,
            y: 120,
            width: 720,
            height: 160,
          },
          metadata: {},
        },
        editable: true,
      },
    ],
    rollbackHint: {
      rollbackGroupId: "rollback-group-1",
      strategy: "delete_created_layers",
    },
    emittedAt: new Date().toISOString(),
    deliveryDeadlineAt: new Date(Date.now() + 10000).toISOString(),
  };
}
