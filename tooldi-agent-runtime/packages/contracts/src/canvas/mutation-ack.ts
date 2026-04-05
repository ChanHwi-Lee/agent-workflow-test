import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import {
  ErrorSummarySchema,
  IdentifierSchema,
  IsoDateTimeSchema,
  MutationOperationSchema,
  RunStatusSchema,
} from "../common.js";

export const MutationCommandResultSchema = Type.Object(
  {
    commandId: IdentifierSchema,
    op: MutationOperationSchema,
    status: Type.Union(
      ["applied", "noop_already_applied", "rejected"].map((value) =>
        Type.Literal(value),
      ),
    ),
    resolvedLayerId: Type.Optional(IdentifierSchema),
    removedLayerIds: Type.Optional(Type.Array(IdentifierSchema)),
    changedFields: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    targetLayerVersion: Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
    resultingLayerVersion: Type.Optional(
      Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    ),
    tombstoneKey: Type.Optional(IdentifierSchema),
    contentHash: Type.Optional(Type.String({ minLength: 1 })),
    error: Type.Optional(ErrorSummarySchema),
  },
  { additionalProperties: false },
);

export const MutationApplyAckRequestSchema = Type.Object(
  {
    runId: IdentifierSchema,
    traceId: IdentifierSchema,
    mutationId: IdentifierSchema,
    seq: Type.Integer({ minimum: 1 }),
    status: Type.Union(
      ["applied", "noop_already_applied", "rejected"].map((value) =>
        Type.Literal(value),
      ),
    ),
    partialApplyDetected: Type.Optional(Type.Boolean()),
    targetPageId: IdentifierSchema,
    baseRevision: Type.Integer({ minimum: 0 }),
    resultingRevision: Type.Optional(Type.Integer({ minimum: 0 })),
    resolvedLayerIds: Type.Optional(Type.Record(Type.String(), IdentifierSchema)),
    commandResults: Type.Array(MutationCommandResultSchema, { minItems: 1 }),
    error: Type.Optional(ErrorSummarySchema),
    clientObservedAt: IsoDateTimeSchema,
  },
  { additionalProperties: false },
);

export const MutationApplyAckResponseSchema = Type.Object(
  {
    accepted: Type.Boolean(),
    runStatus: RunStatusSchema,
    nextExpectedSeq: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export type MutationCommandResult = Static<typeof MutationCommandResultSchema>;
export type MutationApplyAckRequest = Static<typeof MutationApplyAckRequestSchema>;
export type MutationApplyAckResponse = Static<typeof MutationApplyAckResponseSchema>;
