import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { CanvasMutationEnvelopeSchema } from "../canvas/canvas-mutation.js";
import {
  ErrorSummarySchema,
  IdentifierSchema,
  IsoDateTimeSchema,
  RunStatusSchema,
  TerminalRunStatusSchema,
} from "../common.js";

const WorkerPhaseSchema = Type.Union(
  ["planning", "executing", "applying", "saving"].map((value) =>
    Type.Literal(value),
  ),
);

const AttemptStateSchema = Type.Union(
  ["dequeued", "hydrating", "running", "awaiting_ack", "finalizing"].map((value) =>
    Type.Literal(value),
  ),
);

export const WorkerHeartbeatRequestSchema = Type.Object(
  {
    traceId: IdentifierSchema,
    attemptSeq: Type.Integer({ minimum: 1 }),
    queueJobId: IdentifierSchema,
    workerId: IdentifierSchema,
    attemptState: AttemptStateSchema,
    phase: Type.Optional(WorkerPhaseSchema),
    activeActionId: Type.Optional(IdentifierSchema),
    lastAssignedSeq: Type.Optional(Type.Integer({ minimum: 1 })),
    lastAckedSeq: Type.Optional(Type.Integer({ minimum: 0 })),
    resumeFromSeq: Type.Optional(Type.Integer({ minimum: 1 })),
    heartbeatAt: IsoDateTimeSchema,
  },
  { additionalProperties: false },
);

export const WorkerHeartbeatResponseSchema = Type.Object(
  {
    accepted: Type.Boolean(),
    cancelRequested: Type.Boolean(),
    stopAfterCurrentAction: Type.Boolean(),
    runStatus: RunStatusSchema,
    deadlineAt: IsoDateTimeSchema,
  },
  { additionalProperties: false },
);

const WorkerPhaseEventSchema = Type.Union([
  Type.Object(
    {
      type: Type.Literal("phase"),
      phase: WorkerPhaseSchema,
      message: Type.String({ minLength: 1 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal("log"),
      level: Type.Union(["info", "warn", "error"].map((value) => Type.Literal(value))),
      message: Type.String({ minLength: 1 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal("tool.result"),
      toolName: Type.String({ minLength: 1 }),
      durationMs: Type.Integer({ minimum: 0 }),
      status: Type.Union(["succeeded", "failed"].map((value) => Type.Literal(value))),
      retryable: Type.Boolean(),
      usage: Type.Optional(
        Type.Object(
          {
            meteringClass: Type.Union(
              [
                "provider_actual",
                "provider_units_estimated",
                "internal_metered_unpriced",
                "nonbillable",
              ].map((value) => Type.Literal(value)),
            ),
            costState: Type.Union(
              ["estimated", "final", "unpriced", "unknown"].map((value) =>
                Type.Literal(value),
              ),
            ),
            pricingVersion: Type.Optional(Type.String({ minLength: 1 })),
            invocationCount: Type.Integer({ minimum: 1 }),
            inputTokens: Type.Optional(Type.Integer({ minimum: 0 })),
            outputTokens: Type.Optional(Type.Integer({ minimum: 0 })),
            cachedInputTokens: Type.Optional(Type.Integer({ minimum: 0 })),
            reasoningTokens: Type.Optional(Type.Integer({ minimum: 0 })),
            generatedImageCount: Type.Optional(Type.Integer({ minimum: 0 })),
            generatedImagePixels: Type.Optional(Type.Integer({ minimum: 0 })),
            inputBytes: Type.Optional(Type.Integer({ minimum: 0 })),
            outputBytes: Type.Optional(Type.Integer({ minimum: 0 })),
            usd: Type.Optional(Type.Union([Type.Number({ minimum: 0 }), Type.Null()])),
          },
          { additionalProperties: false },
        ),
      ),
    },
    { additionalProperties: false },
  ),
]);

export const WorkerPhaseReportRequestSchema = Type.Object(
  {
    traceId: IdentifierSchema,
    attemptSeq: Type.Integer({ minimum: 1 }),
    queueJobId: IdentifierSchema,
    event: WorkerPhaseEventSchema,
  },
  { additionalProperties: false },
);

export const WorkerPhaseReportResponseSchema = Type.Object(
  {
    accepted: Type.Boolean(),
    cancelRequested: Type.Boolean(),
    runStatus: RunStatusSchema,
  },
  { additionalProperties: false },
);

const WorkerMutationProposalSchema = Type.Object(
  {
    mutationId: IdentifierSchema,
    dependsOnSeq: Type.Optional(Type.Integer({ minimum: 1 })),
    rollbackGroupId: IdentifierSchema,
    expectedBaseRevision: Type.Optional(Type.Integer({ minimum: 0 })),
    mutation: CanvasMutationEnvelopeSchema,
  },
  { additionalProperties: false },
);

export const WorkerMutationBatchRequestSchema = Type.Object(
  {
    traceId: IdentifierSchema,
    attemptSeq: Type.Integer({ minimum: 1 }),
    queueJobId: IdentifierSchema,
    proposals: Type.Array(WorkerMutationProposalSchema, { minItems: 1 }),
  },
  { additionalProperties: false },
);

export const WorkerMutationBatchResponseSchema = Type.Object(
  {
    accepted: Type.Boolean(),
    cancelRequested: Type.Boolean(),
    assignments: Type.Array(
      Type.Object(
        {
          mutationId: IdentifierSchema,
          assignedSeq: Type.Integer({ minimum: 1 }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const WaitMutationAckResponseSchema = Type.Object(
  {
    found: Type.Boolean(),
    status: Type.Union(
      ["dispatched", "acked", "rejected", "cancelled", "timed_out"].map((value) =>
        Type.Literal(value),
      ),
    ),
    seq: Type.Optional(Type.Integer({ minimum: 1 })),
    resultingRevision: Type.Optional(Type.Integer({ minimum: 0 })),
    resolvedLayerIds: Type.Optional(Type.Record(Type.String(), IdentifierSchema)),
    error: Type.Optional(ErrorSummarySchema),
  },
  { additionalProperties: false },
);

export const RunFinalizeRequestSchema = Type.Object(
  {
    traceId: IdentifierSchema,
    attemptSeq: Type.Integer({ minimum: 1 }),
    queueJobId: IdentifierSchema,
    finalStatus: TerminalRunStatusSchema,
    finalRevision: Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
    lastAckedSeq: Type.Integer({ minimum: 0 }),
    latestSaveReceiptId: Type.Optional(Type.Union([IdentifierSchema, Type.Null()])),
    createdLayerIds: Type.Array(IdentifierSchema),
    updatedLayerIds: Type.Array(IdentifierSchema),
    deletedLayerIds: Type.Array(IdentifierSchema),
    fallbackCount: Type.Integer({ minimum: 0 }),
    errorSummary: Type.Optional(ErrorSummarySchema),
    costSummary: Type.Optional(
      Type.Object(
        {
          costState: Type.Union(
            ["estimated", "final", "mixed", "unknown"].map((value) =>
              Type.Literal(value),
            ),
          ),
          pricingVersion: Type.String({ minLength: 1 }),
          toolCallCount: Type.Integer({ minimum: 0 }),
          modelCallCount: Type.Integer({ minimum: 0 }),
          inputTokens: Type.Integer({ minimum: 0 }),
          outputTokens: Type.Integer({ minimum: 0 }),
          cachedInputTokens: Type.Integer({ minimum: 0 }),
          reasoningTokens: Type.Integer({ minimum: 0 }),
          generatedImageCount: Type.Integer({ minimum: 0 }),
          generatedImagePixels: Type.Integer({ minimum: 0 }),
          billableExternalUsd: Type.Number({ minimum: 0 }),
          recoveryOverheadUsd: Type.Number({ minimum: 0 }),
          internalUnpricedToolCalls: Type.Integer({ minimum: 0 }),
          attemptBreakdown: Type.Array(
            Type.Object(
              {
                attemptSeq: Type.Integer({ minimum: 1 }),
                queueJobId: IdentifierSchema,
                usd: Type.Number({ minimum: 0 }),
                toolCallCount: Type.Integer({ minimum: 0 }),
              },
              { additionalProperties: false },
            ),
          ),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const WorkerFinalizeResponseSchema = Type.Object(
  {
    accepted: Type.Boolean(),
    runStatus: RunStatusSchema,
    completionRecordRef: Type.Optional(IdentifierSchema),
  },
  { additionalProperties: false },
);

export type WorkerHeartbeatRequest = Static<typeof WorkerHeartbeatRequestSchema>;
export type WorkerHeartbeatResponse = Static<typeof WorkerHeartbeatResponseSchema>;
export type WorkerPhaseReportRequest = Static<typeof WorkerPhaseReportRequestSchema>;
export type WorkerPhaseReportResponse = Static<typeof WorkerPhaseReportResponseSchema>;
export type WorkerMutationBatchRequest = Static<typeof WorkerMutationBatchRequestSchema>;
export type WorkerMutationBatchResponse = Static<typeof WorkerMutationBatchResponseSchema>;
export type WaitMutationAckResponse = Static<typeof WaitMutationAckResponseSchema>;
export type RunFinalizeRequest = Static<typeof RunFinalizeRequestSchema>;
export type WorkerFinalizeResponse = Static<typeof WorkerFinalizeResponseSchema>;
