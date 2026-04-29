import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArtifactRefs,
  buildFinalizeOptions,
  buildStageAckRecord,
} from "./graphHelpers.js";

test("graphHelpers는 정의된 artifact ref만 노출한다", () => {
  const refs = buildArtifactRefs({
    canonicalDesignBriefRef:
      "runs/run-1/attempts/1/canonical-design-brief.json",
    briefCompilationReportRef:
      "runs/run-1/attempts/1/brief-compilation-report.json",
    executablePlanRef: "runs/run-1/attempts/1/executable-plan.json",
  });

  assert.deepEqual(refs, {
    canonicalDesignBriefRef:
      "runs/run-1/attempts/1/canonical-design-brief.json",
    briefCompilationReportRef:
      "runs/run-1/attempts/1/brief-compilation-report.json",
    executablePlanRef: "runs/run-1/attempts/1/executable-plan.json",
  });
});

test("graphHelpers는 ack와 proposal을 stage record로 보존한다", () => {
  const record = buildStageAckRecord(
    {
      mutationId: "mutation-1",
      rollbackGroupId: "rollback-1",
      stageLabel: "copy",
      stageDescription: "copy stage",
      mutation: {
        mutationId: "mutation-1",
        mutationVersion: "v1",
        traceId: "trace-1",
        runId: "run-1",
        draftId: "draft-1",
        documentId: "document-1",
        pageId: "page-1",
        seq: 2,
        commitGroup: "group-1",
        idempotencyKey: "idem-1",
        expectedBaseRevision: 1,
        ownershipScope: "draft_only",
        commands: [
          {
            commandId: "command-1",
            op: "createLayer",
            executionSlotKey: "headline",
            clientLayerKey: "headline_1",
            targetRef: {
              layerId: null,
              clientLayerKey: "headline_1",
            },
            targetLayerVersion: null,
            parentRef: {
              position: "append",
            },
            expectedLayerType: null,
            allowNoop: false,
            metadataTags: {
              source: "agent-worker-spring-template",
              stage: "copy",
            },
            layerBlueprint: {
              layerType: "text",
              bounds: {
                x: 100,
                y: 120,
                width: 300,
                height: 80,
              },
              metadata: {
                role: "headline",
              },
            },
            editable: true,
          },
        ],
        rollbackHint: {
          rollbackGroupId: "rollback-1",
          strategy: "delete_created_layers",
        },
        emittedAt: new Date().toISOString(),
        deliveryDeadlineAt: new Date().toISOString(),
      },
    },
    {
      found: true,
      status: "acked",
      seq: 2,
      resultingRevision: 5,
      resolvedLayerIds: {
        headline_1: "layer-1",
      },
    },
  );

  assert.equal(record.stageLabel, "copy");
  assert.equal(record.commands[0]?.executionSlotKey, "headline");
  assert.deepEqual(record.commands[0]?.proposedBounds, {
    x: 100,
    y: 120,
    width: 300,
    height: 80,
  });
  assert.equal(record.resolvedLayerIds?.headline_1, "layer-1");
});
