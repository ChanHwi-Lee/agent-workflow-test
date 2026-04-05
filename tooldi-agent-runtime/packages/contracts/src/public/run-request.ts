import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { IdentifierSchema } from "../common.js";

const ReferenceAssetSchema = Type.Object(
  {
    assetId: IdentifierSchema,
    assetKind: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
    slotKey: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
  },
  { additionalProperties: false },
);

const MilestoneTargetsSchema = Type.Object(
  {
    firstVisible: Type.Integer({ minimum: 0 }),
    editableMinimum: Type.Integer({ minimum: 0 }),
    saveStarted: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

const MilestoneDeadlinesSchema = Type.Object(
  {
    planValidated: Type.Integer({ minimum: 0 }),
    firstVisible: Type.Integer({ minimum: 0 }),
    editableMinimum: Type.Integer({ minimum: 0 }),
    mutationCutoff: Type.Integer({ minimum: 0 }),
    hardDeadline: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const StartAgentWorkflowRunRequestSchema = Type.Object(
  {
    clientRequestId: IdentifierSchema,
    editorSessionId: IdentifierSchema,
    surface: Type.String({ minLength: 1 }),
    userInput: Type.Object(
      {
        prompt: Type.String({ minLength: 1 }),
        locale: Type.String({ minLength: 1 }),
        timezone: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
    editorContext: Type.Object(
      {
        documentId: IdentifierSchema,
        pageId: IdentifierSchema,
        canvasState: Type.Literal("empty"),
        canvasWidth: Type.Integer({ minimum: 1 }),
        canvasHeight: Type.Integer({ minimum: 1 }),
        sizeSerial: Type.String({ minLength: 1 }),
        workingTemplateCode: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
        canvasSnapshotRef: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
        selectedLayerIds: Type.Array(IdentifierSchema),
      },
      { additionalProperties: false },
    ),
    brandContext: Type.Object(
      {
        brandName: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
        palette: Type.Array(Type.String({ minLength: 1 })),
        logoAssetId: Type.Union([IdentifierSchema, Type.Null()]),
      },
      { additionalProperties: false },
    ),
    referenceAssets: Type.Array(ReferenceAssetSchema),
    runPolicy: Type.Object(
      {
        mode: Type.Literal("live_commit"),
        approvalMode: Type.Literal("none"),
        timeBudgetMs: Type.Integer({ minimum: 1 }),
        milestoneTargetsMs: MilestoneTargetsSchema,
        milestoneDeadlinesMs: MilestoneDeadlinesSchema,
        requestedOutputCount: Type.Literal(1),
        allowInternalAiPrimitives: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
    clientInfo: Type.Object(
      {
        pagePath: Type.String({ minLength: 1 }),
        viewportWidth: Type.Integer({ minimum: 1 }),
        viewportHeight: Type.Integer({ minimum: 1 }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type StartAgentWorkflowRunRequest = Static<
  typeof StartAgentWorkflowRunRequestSchema
>;
