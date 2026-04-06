import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { IdentifierSchema } from "../common.js";

export const RunRecoveryStateSchema = Type.Union(
  [
    "idle",
    "auto_retrying",
    "resuming_from_checkpoint",
    "checkpoint_restore_in_progress",
    "awaiting_manual_retry",
    "finalize_only",
    "not_retryable",
  ].map((value) => Type.Literal(value)),
);

export const RunRecoveryRetryModeSchema = Type.Union(
  ["auto_same_run", "manual_same_run", "none"].map((value) => Type.Literal(value)),
);

export const RunRecoveryResumeModeSchema = Type.Union(
  ["fresh", "last_known_good_checkpoint", "finalize_only"].map((value) =>
    Type.Literal(value),
  ),
);

export const RunRecoveryRestoreTargetKindSchema = Type.Union(
  ["run_start_snapshot", "latest_saved_revision"].map((value) =>
    Type.Literal(value),
  ),
);

export const RunRecoveryProjectionSchema = Type.Object(
  {
    state: RunRecoveryStateSchema,
    retryMode: RunRecoveryRetryModeSchema,
    resumeMode: Type.Union([RunRecoveryResumeModeSchema, Type.Null()]),
    retryable: Type.Boolean(),
    lastKnownGoodCheckpointId: Type.Union([IdentifierSchema, Type.Null()]),
    restoreTargetKind: Type.Union([RunRecoveryRestoreTargetKindSchema, Type.Null()]),
    failedPlanStepId: Type.Union([IdentifierSchema, Type.Null()]),
    resumeFromSeq: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    userMessage: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  },
  { additionalProperties: false },
);

export const RunRepairContextSchema = Type.Object(
  {
    source: Type.Union(
      [
        "backend_retry_watchdog",
        "backend_failure_watchdog",
        "backend_finalize_watchdog",
      ].map((value) => Type.Literal(value)),
    ),
    reasonCode: Type.String({ minLength: 1 }),
    recovery: RunRecoveryProjectionSchema,
  },
  { additionalProperties: false },
);

export type RunRecoveryProjection = Static<typeof RunRecoveryProjectionSchema>;
export type RunRepairContext = Static<typeof RunRepairContextSchema>;
