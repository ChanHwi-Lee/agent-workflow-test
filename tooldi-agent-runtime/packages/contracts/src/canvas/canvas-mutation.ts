import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import {
  IdentifierSchema,
  IsoDateTimeSchema,
  JsonObjectSchema,
  LayerTypeSchema,
  PrimitiveMetadataRecordSchema,
  SlotKeySchema,
} from "../common.js";

const CanvasLayerTypeOrNullSchema = Type.Union([LayerTypeSchema, Type.Null()]);

const BoundsSchema = Type.Object(
  {
    x: Type.Number(),
    y: Type.Number(),
    width: Type.Number({ exclusiveMinimum: 0 }),
    height: Type.Number({ exclusiveMinimum: 0 }),
  },
  { additionalProperties: false },
);

const CanvasLayerRefSchema = Type.Object(
  {
    layerId: Type.Optional(IdentifierSchema),
    clientLayerKey: Type.Optional(IdentifierSchema),
    slotKey: Type.Optional(SlotKeySchema),
  },
  { additionalProperties: false },
);

const CreateLayerCommandSchema = Type.Object(
  {
    commandId: IdentifierSchema,
    op: Type.Literal("createLayer"),
    slotKey: Type.Union([SlotKeySchema, Type.Null()]),
    clientLayerKey: IdentifierSchema,
    targetRef: Type.Object(
      {
        layerId: Type.Null(),
        clientLayerKey: IdentifierSchema,
        slotKey: Type.Optional(SlotKeySchema),
      },
      { additionalProperties: false },
    ),
    targetLayerVersion: Type.Null(),
    desiredLayerId: Type.Optional(Type.Union([IdentifierSchema, Type.Null()])),
    parentRef: Type.Object(
      {
        layerId: Type.Optional(IdentifierSchema),
        clientLayerKey: Type.Optional(IdentifierSchema),
        position: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
    expectedLayerType: CanvasLayerTypeOrNullSchema,
    allowNoop: Type.Boolean(),
    metadataTags: PrimitiveMetadataRecordSchema,
    layerBlueprint: Type.Object(
      {
        layerType: Type.Union(
          ["group", "shape", "text", "image", "sticker"].map((value) =>
            Type.Literal(value),
          ),
        ),
        bounds: BoundsSchema,
        transform: Type.Optional(JsonObjectSchema),
        styleTokens: Type.Optional(JsonObjectSchema),
        assetBinding: Type.Optional(
          Type.Union([
            Type.Object(
              {
                assetId: IdentifierSchema,
                fitMode: Type.Optional(Type.String({ minLength: 1 })),
              },
              { additionalProperties: false },
            ),
            Type.Null(),
          ]),
        ),
        textBindingRef: Type.Optional(Type.Union([IdentifierSchema, Type.Null()])),
        metadata: PrimitiveMetadataRecordSchema,
      },
      { additionalProperties: false },
    ),
    editable: Type.Boolean(),
  },
  { additionalProperties: false },
);

const UpdateLayerCommandSchema = Type.Object(
  {
    commandId: IdentifierSchema,
    op: Type.Literal("updateLayer"),
    slotKey: Type.Union([SlotKeySchema, Type.Null()]),
    clientLayerKey: Type.Optional(Type.Union([IdentifierSchema, Type.Null()])),
    targetRef: CanvasLayerRefSchema,
    targetLayerVersion: Type.Integer({ minimum: 0 }),
    expectedLayerType: CanvasLayerTypeOrNullSchema,
    allowNoop: Type.Boolean(),
    metadataTags: PrimitiveMetadataRecordSchema,
    patchMask: Type.Array(
      Type.Union(
        [
          "bounds",
          "transform",
          "styleTokens",
          "assetBinding",
          "metadata",
          "zOrder",
          "parentRef",
          "visibility",
        ].map((value) => Type.Literal(value)),
      ),
    ),
    patch: JsonObjectSchema,
    ifMatch: Type.Optional(
      Type.Object(
        {
          expectedRevision: Type.Optional(Type.Integer({ minimum: 0 })),
          expectedContentHash: Type.Optional(Type.String({ minLength: 1 })),
          expectedAssetId: Type.Optional(IdentifierSchema),
          expectedLayerType: Type.Optional(Type.String({ minLength: 1 })),
        },
        { additionalProperties: false },
      ),
    ),
    preserveLayerId: Type.Literal(true),
  },
  { additionalProperties: false },
);

const DeleteLayerCommandSchema = Type.Object(
  {
    commandId: IdentifierSchema,
    op: Type.Literal("deleteLayer"),
    slotKey: Type.Union([SlotKeySchema, Type.Null()]),
    clientLayerKey: Type.Optional(Type.Union([IdentifierSchema, Type.Null()])),
    targetRef: CanvasLayerRefSchema,
    targetLayerVersion: Type.Integer({ minimum: 0 }),
    expectedLayerType: CanvasLayerTypeOrNullSchema,
    allowNoop: Type.Boolean(),
    metadataTags: PrimitiveMetadataRecordSchema,
    cascadeMode: Type.Union(
      ["delete_subtree", "reject_if_has_children"].map((value) => Type.Literal(value)),
    ),
    deleteReason: Type.Union(
      [
        "cleanup_placeholder",
        "replace_with_final",
        "rollback",
        "user_visible_trim",
        "compensation",
      ].map((value) => Type.Literal(value)),
    ),
    tombstone: Type.Object(
      {
        keepTombstoneRecord: Type.Boolean(),
        tombstoneKey: IdentifierSchema,
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

const SaveTemplateCommandSchema = Type.Object(
  {
    commandId: IdentifierSchema,
    op: Type.Literal("saveTemplate"),
    slotKey: Type.Null(),
    clientLayerKey: Type.Optional(Type.Null()),
    targetRef: CanvasLayerRefSchema,
    targetLayerVersion: Type.Null(),
    allowNoop: Type.Boolean(),
    metadataTags: PrimitiveMetadataRecordSchema,
    reason: Type.Union(
      ["milestone_first_editable", "run_completed"].map((value) =>
        Type.Literal(value),
      ),
    ),
  },
  { additionalProperties: false },
);

export const CanvasMutationCommandSchema = Type.Union([
  CreateLayerCommandSchema,
  UpdateLayerCommandSchema,
  DeleteLayerCommandSchema,
  SaveTemplateCommandSchema,
]);

export const CanvasMutationEnvelopeSchema = Type.Object(
  {
    mutationId: IdentifierSchema,
    mutationVersion: Type.String({ minLength: 1 }),
    traceId: IdentifierSchema,
    runId: IdentifierSchema,
    draftId: IdentifierSchema,
    documentId: IdentifierSchema,
    pageId: IdentifierSchema,
    seq: Type.Integer({ minimum: 1 }),
    commitGroup: IdentifierSchema,
    dependsOnSeq: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
    idempotencyKey: Type.String({ minLength: 1 }),
    expectedBaseRevision: Type.Integer({ minimum: 0 }),
    ownershipScope: Type.Union(
      ["draft_only", "draft_and_descendants"].map((value) => Type.Literal(value)),
    ),
    commands: Type.Array(CanvasMutationCommandSchema, { minItems: 1 }),
    rollbackHint: Type.Object(
      {
        rollbackGroupId: IdentifierSchema,
        strategy: Type.Union(
          ["inverse_patch", "delete_created_layers", "restore_snapshot"].map(
            (value) => Type.Literal(value),
          ),
        ),
        restoreSnapshotRef: Type.Optional(IdentifierSchema),
      },
      { additionalProperties: false },
    ),
    emittedAt: IsoDateTimeSchema,
    deliveryDeadlineAt: IsoDateTimeSchema,
  },
  { additionalProperties: false },
);

export type CanvasMutationCommand = Static<typeof CanvasMutationCommandSchema>;
export type CanvasMutationEnvelope = Static<typeof CanvasMutationEnvelopeSchema>;
