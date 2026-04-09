import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { FormatRegistry } from "@sinclair/typebox/type";
import { Value } from "@sinclair/typebox/value";

import { CanvasMutationEnvelopeSchema } from "../canvas/canvas-mutation.js";
import {
  CompletionStateSchema,
  ErrorSummarySchema,
  IdentifierSchema,
  IsoDateTimeSchema,
  RunStatusSchema,
  TerminalRunStatusSchema,
  WarningItemSchema,
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

const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

if (!FormatRegistry.Has("date-time")) {
  FormatRegistry.Set(
    "date-time",
    (value) => ISO_DATE_TIME_PATTERN.test(value) && !Number.isNaN(Date.parse(value)),
  );
}

export const WorkerHeartbeatRequestSchema = Type.Object(
  {
    traceId: IdentifierSchema,
    attempt: Type.Integer({ minimum: 1 }),
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

const WorkerAppendEventSchema = Type.Union([
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
  Type.Object(
    {
      type: Type.Literal("mutation.proposed"),
      mutationId: IdentifierSchema,
      dependsOnSeq: Type.Optional(Type.Integer({ minimum: 1 })),
      rollbackGroupId: IdentifierSchema,
      expectedBaseRevision: Type.Optional(Type.Integer({ minimum: 0 })),
      mutation: CanvasMutationEnvelopeSchema,
    },
    { additionalProperties: false },
  ),
]);

export const WorkerAppendEventRequestSchema = Type.Object(
  {
    traceId: IdentifierSchema,
    attempt: Type.Integer({ minimum: 1 }),
    queueJobId: IdentifierSchema,
    event: WorkerAppendEventSchema,
  },
  { additionalProperties: false },
);

export const WorkerAppendEventResponseSchema = Type.Object(
  {
    accepted: Type.Boolean(),
    cancelRequested: Type.Boolean(),
    assignedSeq: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);

export const WaitMutationAckQuerySchema = Type.Object(
  {
    waitMs: Type.Optional(Type.Integer({ minimum: 0, maximum: 15000 })),
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
    attempt: Type.Integer({ minimum: 1 }),
    queueJobId: IdentifierSchema,
    finalStatus: TerminalRunStatusSchema,
    completionState: Type.Optional(CompletionStateSchema),
    draftId: Type.Optional(IdentifierSchema),
    finalRevision: Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
    lastAckedSeq: Type.Integer({ minimum: 0 }),
    latestSaveReceiptId: Type.Optional(Type.Union([IdentifierSchema, Type.Null()])),
    outputTemplateCode: Type.Optional(
      Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    ),
    normalizedIntentRef: Type.Optional(IdentifierSchema),
    normalizedIntentDraftRef: Type.Optional(IdentifierSchema),
    intentNormalizationReportRef: Type.Optional(IdentifierSchema),
    templatePriorSummaryRef: Type.Optional(IdentifierSchema),
    searchProfileRef: Type.Optional(IdentifierSchema),
    executablePlanRef: Type.Optional(IdentifierSchema),
    candidateSetRef: Type.Optional(IdentifierSchema),
    sourceSearchSummaryRef: Type.Optional(IdentifierSchema),
    retrievalStageRef: Type.Optional(IdentifierSchema),
    selectionDecisionRef: Type.Optional(IdentifierSchema),
    typographyDecisionRef: Type.Optional(IdentifierSchema),
    ruleJudgeVerdictRef: Type.Optional(IdentifierSchema),
    sourceMutationRange: Type.Optional(
      Type.Object(
        {
          firstSeq: Type.Integer({ minimum: 1 }),
          lastSeq: Type.Integer({ minimum: 1 }),
          reconciledThroughSeq: Type.Integer({ minimum: 0 }),
        },
        { additionalProperties: false },
      ),
    ),
    createdLayerIds: Type.Array(IdentifierSchema),
    updatedLayerIds: Type.Array(IdentifierSchema),
    deletedLayerIds: Type.Array(IdentifierSchema),
    fallbackCount: Type.Integer({ minimum: 0 }),
    warnings: Type.Optional(Type.Array(WarningItemSchema)),
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
export type WorkerAppendEventRequest = Static<typeof WorkerAppendEventRequestSchema>;
export type WorkerAppendEventResponse = Static<typeof WorkerAppendEventResponseSchema>;
export type WaitMutationAckQuery = Static<typeof WaitMutationAckQuerySchema>;
export type WaitMutationAckResponse = Static<typeof WaitMutationAckResponseSchema>;
export type RunFinalizeRequest = Static<typeof RunFinalizeRequestSchema>;
export type WorkerFinalizeResponse = Static<typeof WorkerFinalizeResponseSchema>;

export function isWorkerHeartbeatResponse(
  value: unknown,
): value is WorkerHeartbeatResponse {
  return Value.Check(WorkerHeartbeatResponseSchema, value);
}

export function firstWorkerHeartbeatResponseError(value: unknown): string | null {
  const issue = Value.Errors(WorkerHeartbeatResponseSchema, value).First();
  if (!issue) {
    return null;
  }

  const path = issue.path.length > 0 ? issue.path : "$";
  return `${path}: ${issue.message}`;
}

export function isWorkerAppendEventRequest(
  value: unknown,
): value is WorkerAppendEventRequest {
  return Value.Check(WorkerAppendEventRequestSchema, value);
}

export function firstWorkerAppendEventRequestError(
  value: unknown,
): string | null {
  const issue = Value.Errors(WorkerAppendEventRequestSchema, value).First();
  if (!issue) {
    return null;
  }

  const path = issue.path.length > 0 ? issue.path : "$";
  return `${path}: ${issue.message}`;
}

export function isWorkerAppendEventResponse(
  value: unknown,
): value is WorkerAppendEventResponse {
  return Value.Check(WorkerAppendEventResponseSchema, value);
}

export function firstWorkerAppendEventResponseError(
  value: unknown,
): string | null {
  const issue = Value.Errors(WorkerAppendEventResponseSchema, value).First();
  if (!issue) {
    return null;
  }

  const path = issue.path.length > 0 ? issue.path : "$";
  return `${path}: ${issue.message}`;
}

export function isWaitMutationAckResponse(
  value: unknown,
): value is WaitMutationAckResponse {
  return Value.Check(WaitMutationAckResponseSchema, value);
}

export function firstWaitMutationAckResponseError(value: unknown): string | null {
  const issue = Value.Errors(WaitMutationAckResponseSchema, value).First();
  if (!issue) {
    return null;
  }

  const path = issue.path.length > 0 ? issue.path : "$";
  return `${path}: ${issue.message}`;
}

export function isWorkerFinalizeResponse(
  value: unknown,
): value is WorkerFinalizeResponse {
  return Value.Check(WorkerFinalizeResponseSchema, value);
}

export function firstWorkerFinalizeResponseError(value: unknown): string | null {
  const issue = Value.Errors(WorkerFinalizeResponseSchema, value).First();
  if (!issue) {
    return null;
  }

  const path = issue.path.length > 0 ? issue.path : "$";
  return `${path}: ${issue.message}`;
}
