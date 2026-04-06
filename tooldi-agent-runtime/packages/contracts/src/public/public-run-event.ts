import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { AgentRunResultSummarySchema } from "../artifacts/run-result.js";
import { CanvasMutationEnvelopeSchema } from "../canvas/canvas-mutation.js";
import { IdentifierSchema, IsoDateTimeSchema, RetryableErrorSummarySchema } from "../common.js";
import { RunRecoveryProjectionSchema } from "./run-recovery.js";

const RunPhaseEventSchema = Type.Object(
  {
    type: Type.Literal("run.phase"),
    runId: IdentifierSchema,
    traceId: IdentifierSchema,
    phase: Type.Union(
      ["queued", "planning", "executing", "applying", "saving"].map((value) =>
        Type.Literal(value),
      ),
    ),
    message: Type.String({ minLength: 1 }),
    at: IsoDateTimeSchema,
  },
  { additionalProperties: false },
);

const RunLogEventSchema = Type.Object(
  {
    type: Type.Literal("run.log"),
    runId: IdentifierSchema,
    traceId: IdentifierSchema,
    level: Type.Union(["info", "warn", "error"].map((value) => Type.Literal(value))),
    message: Type.String({ minLength: 1 }),
    at: IsoDateTimeSchema,
  },
  { additionalProperties: false },
);

const RunAcceptedEventSchema = Type.Object(
  {
    type: Type.Literal("run.accepted"),
    runId: IdentifierSchema,
    traceId: IdentifierSchema,
    at: IsoDateTimeSchema,
  },
  { additionalProperties: false },
);

const CanvasMutationEventSchema = Type.Object(
  {
    type: Type.Literal("canvas.mutation"),
    runId: IdentifierSchema,
    traceId: IdentifierSchema,
    draftId: IdentifierSchema,
    pageId: IdentifierSchema,
    seq: Type.Integer({ minimum: 1 }),
    mutation: CanvasMutationEnvelopeSchema,
    at: IsoDateTimeSchema,
  },
  { additionalProperties: false },
);

const CancelRequestedEventSchema = Type.Object(
  {
    type: Type.Literal("run.cancel_requested"),
    runId: IdentifierSchema,
    traceId: IdentifierSchema,
    reason: Type.Optional(Type.String({ minLength: 1 })),
    at: IsoDateTimeSchema,
  },
  { additionalProperties: false },
);

const RunRecoveryEventSchema = Type.Object(
  {
    type: Type.Literal("run.recovery"),
    runId: IdentifierSchema,
    traceId: IdentifierSchema,
    recovery: RunRecoveryProjectionSchema,
    at: IsoDateTimeSchema,
  },
  { additionalProperties: false },
);

const RunCompletedEventSchema = Type.Object(
  {
    type: Type.Literal("run.completed"),
    runId: IdentifierSchema,
    traceId: IdentifierSchema,
    result: AgentRunResultSummarySchema,
    at: IsoDateTimeSchema,
  },
  { additionalProperties: false },
);

const RunFailedEventSchema = Type.Object(
  {
    type: Type.Literal("run.failed"),
    runId: IdentifierSchema,
    traceId: IdentifierSchema,
    error: RetryableErrorSummarySchema,
    at: IsoDateTimeSchema,
  },
  { additionalProperties: false },
);

const RunCancelledEventSchema = Type.Object(
  {
    type: Type.Literal("run.cancelled"),
    runId: IdentifierSchema,
    traceId: IdentifierSchema,
    at: IsoDateTimeSchema,
  },
  { additionalProperties: false },
);

export const PublicRunEventSchema = Type.Union([
  RunAcceptedEventSchema,
  RunPhaseEventSchema,
  RunLogEventSchema,
  RunRecoveryEventSchema,
  CanvasMutationEventSchema,
  CancelRequestedEventSchema,
  RunCompletedEventSchema,
  RunFailedEventSchema,
  RunCancelledEventSchema,
]);

export type PublicRunEvent = Static<typeof PublicRunEventSchema>;
