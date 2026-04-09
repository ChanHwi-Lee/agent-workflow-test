import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import {
  CompletionStateSchema,
  DurabilityStateSchema,
  ErrorSummarySchema,
  IdentifierSchema,
  IsoDateTimeSchema,
  TerminalRunStatusSchema,
  WarningItemSchema,
} from "../common.js";

export const AgentRunResultSummarySchema = Type.Object(
  {
    finalStatus: TerminalRunStatusSchema,
    draftId: Type.Union([IdentifierSchema, Type.Null()]),
    finalRevision: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    durabilityState: DurabilityStateSchema,
    latestSaveReceiptId: Type.Union([IdentifierSchema, Type.Null()]),
    warningCount: Type.Integer({ minimum: 0 }),
    fallbackCount: Type.Integer({ minimum: 0 }),
    warnings: Type.Array(WarningItemSchema),
    errorSummary: Type.Union([ErrorSummarySchema, Type.Null()]),
  },
  { additionalProperties: false },
);

export const RunCompletionSnapshotSchema = Type.Object(
  {
    draftId: IdentifierSchema,
    completionState: CompletionStateSchema,
    terminalStatus: TerminalRunStatusSchema,
    minimumDraftSatisfied: Type.Boolean(),
    warnings: Type.Array(WarningItemSchema),
    completedAt: IsoDateTimeSchema,
    finalRevision: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  },
  { additionalProperties: false },
);

export const RunResultSchema = Type.Object(
  {
    finalStatus: TerminalRunStatusSchema,
    draftId: Type.Union([IdentifierSchema, Type.Null()]),
    finalRevision: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    createdLayerIds: Type.Array(IdentifierSchema),
    updatedLayerIds: Type.Array(IdentifierSchema),
    deletedLayerIds: Type.Array(IdentifierSchema),
    fallbackCount: Type.Integer({ minimum: 0 }),
    durabilityState: DurabilityStateSchema,
    saveReceiptId: Type.Union([IdentifierSchema, Type.Null()]),
    authoritativeCanvasFinalStateRef: Type.String({ minLength: 1 }),
    errorSummary: Type.Union([ErrorSummarySchema, Type.Null()]),
    warningSummary: Type.Array(WarningItemSchema),
    traceId: IdentifierSchema,
  },
  { additionalProperties: false },
);

export const RunCompletionRecordSchema = Type.Object(
  {
    completionRecordId: IdentifierSchema,
    completionSchemaVersion: Type.Literal("v1"),
    eventSequence: Type.Integer({ minimum: 1 }),
    runId: IdentifierSchema,
    canonicalRunId: IdentifierSchema,
    traceId: IdentifierSchema,
    draftId: IdentifierSchema,
    pageId: IdentifierSchema,
    bundleId: IdentifierSchema,
    parentBundleRef: IdentifierSchema,
    commitPayloadId: IdentifierSchema,
    canonicalArtifactKind: Type.Literal("LiveDraftArtifactBundle"),
    terminalStatus: TerminalRunStatusSchema,
    completionState: CompletionStateSchema,
    durabilityState: DurabilityStateSchema,
    minimumDraftSatisfied: Type.Boolean(),
    sourceMutationRange: Type.Object(
      {
        firstSeq: Type.Integer({ minimum: 1 }),
        lastSeq: Type.Integer({ minimum: 1 }),
        reconciledThroughSeq: Type.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
    finalRevision: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    latestSaveReceiptId: Type.Union([IdentifierSchema, Type.Null()]),
    draftGeneratedAt: IsoDateTimeSchema,
    completedAt: IsoDateTimeSchema,
    sourceRefs: Type.Object(
      {
        requestRef: IdentifierSchema,
        snapshotRef: IdentifierSchema,
        normalizedIntentRef: IdentifierSchema,
        normalizedIntentDraftRef: Type.Optional(IdentifierSchema),
        intentNormalizationReportRef: Type.Optional(IdentifierSchema),
        templatePriorSummaryRef: Type.Optional(IdentifierSchema),
        searchProfileRef: Type.Optional(IdentifierSchema),
        executablePlanRef: IdentifierSchema,
        candidateSetRef: Type.Optional(IdentifierSchema),
        sourceSearchSummaryRef: Type.Optional(IdentifierSchema),
        retrievalStageRef: Type.Optional(IdentifierSchema),
        selectionDecisionRef: Type.Optional(IdentifierSchema),
        typographyDecisionRef: Type.Optional(IdentifierSchema),
        ruleJudgeVerdictRef: Type.Optional(IdentifierSchema),
        bundleRef: IdentifierSchema,
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type AgentRunResultSummary = Static<typeof AgentRunResultSummarySchema>;
export type RunCompletionSnapshot = Static<typeof RunCompletionSnapshotSchema>;
export type RunResult = Static<typeof RunResultSchema>;
export type RunCompletionRecord = Static<typeof RunCompletionRecordSchema>;
