import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import {
  IdentifierSchema,
  IsoDateTimeSchema,
  JsonObjectSchema,
  SlotKeySchema,
} from "../common.js";

const OperationFamilySchema = Type.Union(
  ["create_template", "update_layer", "delete_layer", "save_template"].map(
    (value) => Type.Literal(value),
  ),
);

export const RunJobEnvelopeSchema = Type.Object(
  {
    messageVersion: Type.Literal("v1"),
    runId: IdentifierSchema,
    traceId: IdentifierSchema,
    queueJobId: IdentifierSchema,
    attemptSeq: Type.Integer({ minimum: 1 }),
    priority: Type.Literal("interactive"),
    requestRef: IdentifierSchema,
    snapshotRef: IdentifierSchema,
    deadlineAt: IsoDateTimeSchema,
    pageLockToken: IdentifierSchema,
    cancelToken: IdentifierSchema,
  },
  { additionalProperties: false },
);

export const IntentEnvelopeSchema = Type.Object(
  {
    intentId: IdentifierSchema,
    runId: IdentifierSchema,
    operationFamily: OperationFamilySchema,
    artifactType: Type.String({ minLength: 1 }),
    goalSummary: Type.String({ minLength: 1 }),
    requestedOutputCount: Type.Integer({ minimum: 1 }),
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
    supportedInV1: Type.Boolean(),
    blockingReason: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    futureCapableOperations: Type.Array(OperationFamilySchema),
  },
  { additionalProperties: false },
);

export const PlannerEnabledToolSchema = Type.Object(
  {
    toolName: Type.String({ minLength: 1 }),
    toolVersion: Type.String({ minLength: 1 }),
    kind: Type.Union(
      ["canvas_mutation", "asset_prep", "document_commit", "analysis"].map((value) =>
        Type.Literal(value),
      ),
    ),
  },
  { additionalProperties: false },
);

export const PlannerInputEnvelopeSchema = Type.Object(
  {
    plannerInputSchemaVersion: Type.String({ minLength: 1 }),
    runId: IdentifierSchema,
    traceId: IdentifierSchema,
    attemptSeq: Type.Integer({ minimum: 1 }),
    request: Type.Object(
      {
        requestId: IdentifierSchema,
        clientRequestId: IdentifierSchema,
        editorSessionId: IdentifierSchema,
        normalizedPrompt: Type.String({ minLength: 1 }),
        locale: Type.String({ minLength: 1 }),
        timezone: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
    requestSnapshotRef: IdentifierSchema,
    intent: Type.Object(
      {
        intentId: IdentifierSchema,
        operationFamily: OperationFamilySchema,
        artifactType: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
    constraintPackRef: IdentifierSchema,
    registrySnapshot: Type.Object(
      {
        registryVersion: Type.String({ minLength: 1 }),
        enabledTools: Type.Array(PlannerEnabledToolSchema),
      },
      { additionalProperties: false },
    ),
    planningPolicy: Type.Object(
      {
        maxActions: Type.Integer({ minimum: 1 }),
        maxCommitGroups: Type.Integer({ minimum: 1 }),
        maxRepairRounds: Type.Integer({ minimum: 0 }),
        schemaMode: Type.Literal("strict_json_schema_subset"),
        allowToolAliasesInOutput: Type.Boolean(),
        allowNewCorrelationIds: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
    correlation: Type.Object(
      {
        httpRequestId: IdentifierSchema,
        queueJobId: IdentifierSchema,
        plannerSpanId: IdentifierSchema,
        parentSpanId: Type.Union([IdentifierSchema, Type.Null()]),
      },
      { additionalProperties: false },
    ),
    repairContext: Type.Union([JsonObjectSchema, Type.Null()]),
  },
  { additionalProperties: false },
);

export const PlanValidationIssueSchema = Type.Object(
  {
    issueId: IdentifierSchema,
    stage: Type.Union(
      [
        "schema_shape",
        "registry_resolution",
        "semantic_graph",
        "policy_budget",
        "target_integrity",
      ].map((value) => Type.Literal(value)),
    ),
    severity: Type.Union(["error", "warn"].map((value) => Type.Literal(value))),
    code: Type.String({ minLength: 1 }),
    path: Type.String({ minLength: 1 }),
    message: Type.String({ minLength: 1 }),
    repairHint: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    blocking: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const PlannerRepairRequestSchema = Type.Object(
  {
    repairId: IdentifierSchema,
    runId: IdentifierSchema,
    traceId: IdentifierSchema,
    attemptSeq: Type.Integer({ minimum: 1 }),
    plannerSpanId: IdentifierSchema,
    repairRound: Type.Integer({ minimum: 1 }),
    candidatePlanRef: IdentifierSchema,
    issues: Type.Array(PlanValidationIssueSchema, { minItems: 1 }),
    repairBudgetRemaining: Type.Integer({ minimum: 0 }),
    repairDeadlineAt: IsoDateTimeSchema,
  },
  { additionalProperties: false },
);

export const PersistedPlanActionSchema = Type.Object(
  {
    actionId: IdentifierSchema,
    kind: Type.Union(
      ["canvas_mutation", "asset_prep", "document_commit", "analysis"].map((value) =>
        Type.Literal(value),
      ),
    ),
    operation: Type.String({ minLength: 1 }),
    toolName: Type.String({ minLength: 1 }),
    toolVersion: Type.String({ minLength: 1 }),
    commitGroup: IdentifierSchema,
    liveCommit: Type.Boolean(),
    idempotencyKey: Type.String({ minLength: 1 }),
    dependsOn: Type.Array(IdentifierSchema),
    targetRef: Type.Object(
      {
        documentId: IdentifierSchema,
        pageId: IdentifierSchema,
        layerId: Type.Union([IdentifierSchema, Type.Null()]),
        artifactId: Type.Optional(IdentifierSchema),
        slotKey: Type.Optional(SlotKeySchema),
      },
      { additionalProperties: false },
    ),
    inputs: JsonObjectSchema,
    rollback: Type.Object(
      {
        strategy: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const ExecutablePlanSchema = Type.Object(
  {
    planId: IdentifierSchema,
    planVersion: Type.Integer({ minimum: 1 }),
    planSchemaVersion: Type.String({ minLength: 1 }),
    runId: IdentifierSchema,
    traceId: IdentifierSchema,
    attemptSeq: Type.Integer({ minimum: 1 }),
    intent: Type.Object(
      {
        operationFamily: OperationFamilySchema,
        artifactType: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
    constraintsRef: IdentifierSchema,
    actions: Type.Array(PersistedPlanActionSchema, { minItems: 1 }),
  },
  { additionalProperties: false },
);

export type RunJobEnvelope = Static<typeof RunJobEnvelopeSchema>;
export type IntentEnvelope = Static<typeof IntentEnvelopeSchema>;
export type PlannerEnabledTool = Static<typeof PlannerEnabledToolSchema>;
export type PlannerInputEnvelope = Static<typeof PlannerInputEnvelopeSchema>;
export type PlanValidationIssue = Static<typeof PlanValidationIssueSchema>;
export type PlannerRepairRequest = Static<typeof PlannerRepairRequestSchema>;
export type PersistedPlanAction = Static<typeof PersistedPlanActionSchema>;
export type ExecutablePlan = Static<typeof ExecutablePlanSchema>;
