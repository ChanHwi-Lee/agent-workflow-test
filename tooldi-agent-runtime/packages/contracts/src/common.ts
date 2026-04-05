import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

export const IdentifierSchema = Type.String({ minLength: 1 });

export const IsoDateTimeSchema = Type.String({
  format: "date-time",
  minLength: 1,
});

export const UrlOrPathSchema = Type.String({ minLength: 1 });

export const PrimitiveMetadataValueSchema = Type.Union([
  Type.String(),
  Type.Number(),
  Type.Boolean(),
  Type.Null(),
]);

export const PrimitiveMetadataRecordSchema = Type.Record(
  Type.String(),
  PrimitiveMetadataValueSchema,
);

export const JsonValueSchema = Type.Recursive(
  (Self) =>
    Type.Union([
      Type.Null(),
      Type.String(),
      Type.Number(),
      Type.Boolean(),
      Type.Array(Self),
      Type.Record(Type.String(), Self),
    ]),
  { $id: "JsonValue" },
);

export const JsonObjectSchema = Type.Record(Type.String(), JsonValueSchema);

export const SlotKeyValues = [
  "background",
  "headline",
  "supporting_copy",
  "cta",
  "decoration",
  "badge",
  "hero_image",
] as const;

export const SlotKeySchema = Type.Union(
  SlotKeyValues.map((value) => Type.Literal(value)),
);

export const LayerTypeValues = [
  "group",
  "shape",
  "text",
  "image",
  "sticker",
  "unknown",
] as const;

export const LayerTypeSchema = Type.Union(
  LayerTypeValues.map((value) => Type.Literal(value)),
);

export const VisibleLayerTypeSchema = Type.Union(
  ["group", "shape", "text", "image", "sticker"].map((value) =>
    Type.Literal(value),
  ),
);

export const MutationOperationValues = [
  "createLayer",
  "updateLayer",
  "deleteLayer",
  "saveTemplate",
] as const;

export const MutationOperationSchema = Type.Union(
  MutationOperationValues.map((value) => Type.Literal(value)),
);

export const RunStatusValues = [
  "enqueue_pending",
  "planning_queued",
  "planning",
  "plan_ready",
  "executing",
  "awaiting_apply_ack",
  "saving",
  "finalizing",
  "cancel_requested",
  "completed",
  "completed_with_warning",
  "save_failed_after_apply",
  "failed",
  "cancelled",
] as const;

export const RunStatusSchema = Type.Union(
  RunStatusValues.map((value) => Type.Literal(value)),
);

export const TerminalRunStatusValues = [
  "completed",
  "completed_with_warning",
  "save_failed_after_apply",
  "failed",
  "cancelled",
] as const;

export const TerminalRunStatusSchema = Type.Union(
  TerminalRunStatusValues.map((value) => Type.Literal(value)),
);

export const DurabilityStateValues = [
  "no_saved_draft",
  "milestone_saved",
  "final_saved",
  "save_uncertain",
] as const;

export const DurabilityStateSchema = Type.Union(
  DurabilityStateValues.map((value) => Type.Literal(value)),
);

export const CompletionStateValues = [
  "editable_draft_ready",
  "editable_draft_ready_with_warning",
  "save_failed_after_apply",
  "failed",
  "cancelled",
] as const;

export const CompletionStateSchema = Type.Union(
  CompletionStateValues.map((value) => Type.Literal(value)),
);

export const WarningItemSchema = Type.Object(
  {
    code: Type.String({ minLength: 1 }),
    message: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const ErrorSummarySchema = Type.Object(
  {
    code: Type.String({ minLength: 1 }),
    message: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const RetryableErrorSummarySchema = Type.Object(
  {
    code: Type.String({ minLength: 1 }),
    message: Type.String({ minLength: 1 }),
    retryable: Type.Boolean(),
  },
  { additionalProperties: false },
);

export type JsonValue = Static<typeof JsonValueSchema>;
export type ErrorSummary = Static<typeof ErrorSummarySchema>;
export type RetryableErrorSummary = Static<typeof RetryableErrorSummarySchema>;
export type RunStatus = Static<typeof RunStatusSchema>;
export type TerminalRunStatus = Static<typeof TerminalRunStatusSchema>;
export type DurabilityState = Static<typeof DurabilityStateSchema>;
export type CompletionState = Static<typeof CompletionStateSchema>;
