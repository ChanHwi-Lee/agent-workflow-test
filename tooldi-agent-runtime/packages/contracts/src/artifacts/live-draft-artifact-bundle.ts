import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { CanvasMutationEnvelopeSchema } from "../canvas/canvas-mutation.js";
import { TemplateSaveReceiptSchema } from "../canvas/template-save-receipt.js";
import {
  DurabilityStateSchema,
  IdentifierSchema,
  IsoDateTimeSchema,
  JsonObjectSchema,
  SlotKeySchema,
} from "../common.js";
import { RunCompletionSnapshotSchema } from "./run-result.js";

const RequiredSlotSchema = Type.Union(
  ["background", "headline", "supporting_copy", "cta", "decoration"].map((value) =>
    Type.Literal(value),
  ),
);

const SlotBindingStatusSchema = Type.Union(
  ["ready", "fallback_ready", "placeholder"].map((value) => Type.Literal(value)),
);

const StoredAssetDescriptorSchema = Type.Object(
  {
    assetId: IdentifierSchema,
    assetRefKey: IdentifierSchema,
    storageKey: Type.String({ minLength: 1 }),
    slotKey: Type.Union([SlotKeySchema, Type.Null()]),
    sourceKind: Type.Union(
      ["generated", "edited", "uploaded", "fallback_graphic"].map((value) =>
        Type.Literal(value),
      ),
    ),
    mimeType: Type.String({ minLength: 1 }),
    width: Type.Integer({ minimum: 1 }),
    height: Type.Integer({ minimum: 1 }),
    checksumSha256: Type.String({ minLength: 1 }),
    provenance: JsonObjectSchema,
    placementDefaults: JsonObjectSchema,
  },
  { additionalProperties: false },
);

const DraftManifestSchema = Type.Object(
  {
    draftId: IdentifierSchema,
    runId: IdentifierSchema,
    traceId: IdentifierSchema,
    pageId: IdentifierSchema,
    rootLayerIds: Type.Array(IdentifierSchema),
    editableLayerIds: Type.Array(IdentifierSchema),
    slotBindings: Type.Array(
      Type.Object(
        {
          slotKey: SlotKeySchema,
          primaryLayerId: IdentifierSchema,
          layerIds: Type.Array(IdentifierSchema),
          layerType: Type.Union(
            ["shape", "text", "group", "image"].map((value) => Type.Literal(value)),
          ),
          status: SlotBindingStatusSchema,
          editable: Type.Boolean(),
          textValue: Type.Optional(Type.String({ minLength: 1 })),
          assetRefKey: Type.Optional(IdentifierSchema),
          assetId: Type.Optional(IdentifierSchema),
        },
        { additionalProperties: false },
      ),
    ),
    finalRevision: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  },
  { additionalProperties: false },
);

const EditableBannerDraftCommitPayloadSchema = Type.Object(
  {
    commitPayloadId: IdentifierSchema,
    commitPayloadVersion: Type.Literal("v1"),
    eventSequence: Type.Integer({ minimum: 1 }),
    runId: IdentifierSchema,
    canonicalRunId: IdentifierSchema,
    parentMutationRangeRef: IdentifierSchema,
    traceId: IdentifierSchema,
    draftId: IdentifierSchema,
    pageId: IdentifierSchema,
    commitMode: Type.Literal("apply_immediately"),
    requiredSlots: Type.Array(RequiredSlotSchema, { minItems: 1 }),
    firstRenderableSeq: Type.Integer({ minimum: 1 }),
    reconciledThroughSeq: Type.Integer({ minimum: 0 }),
    mutations: Type.Array(CanvasMutationEnvelopeSchema, { minItems: 1 }),
    manifest: Type.Object(
      {
        rootLayerIds: Type.Array(IdentifierSchema),
        editableLayerIds: Type.Array(IdentifierSchema),
        slotBindings: DraftManifestSchema.properties.slotBindings,
        expectedFinalRevision: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
      },
      { additionalProperties: false },
    ),
    savePlan: Type.Object(
      {
        milestoneReason: Type.Literal("milestone_first_editable"),
        finalReason: Type.Literal("run_completed"),
        saveRequired: Type.Literal(true),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

const MutationLedgerEntrySchema = Type.Object(
  {
    seq: Type.Integer({ minimum: 1 }),
    mutationId: IdentifierSchema,
    eventSequence: Type.Integer({ minimum: 1 }),
    batchId: IdentifierSchema,
    planStepId: IdentifierSchema,
    commandOps: Type.Array(
      Type.Union(
        ["createLayer", "updateLayer", "deleteLayer", "saveTemplate"].map((value) =>
          Type.Literal(value),
        ),
      ),
      { minItems: 1 },
    ),
    clientLayerKeys: Type.Array(IdentifierSchema),
    targetLayerIds: Type.Array(IdentifierSchema),
    baseRevision: Type.Integer({ minimum: 0 }),
    ackRevision: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    applyStatus: Type.Union(
      ["pending", "applied", "compensated", "failed"].map((value) =>
        Type.Literal(value),
      ),
    ),
    compensatesMutationId: Type.Optional(Type.Union([IdentifierSchema, Type.Null()])),
    rollbackGroupId: IdentifierSchema,
    emittedAt: IsoDateTimeSchema,
    appliedAt: Type.Optional(Type.Union([IsoDateTimeSchema, Type.Null()])),
  },
  { additionalProperties: false },
);

const LastKnownGoodCheckpointSchema = Type.Object(
  {
    checkpointId: IdentifierSchema,
    checkpointSeq: Type.Integer({ minimum: 1 }),
    eventSequence: Type.Integer({ minimum: 1 }),
    runId: IdentifierSchema,
    traceId: IdentifierSchema,
    draftId: IdentifierSchema,
    attemptSeq: Type.Integer({ minimum: 1 }),
    planStepId: Type.Optional(Type.Union([IdentifierSchema, Type.Null()])),
    planStepOrder: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
    stepKey: Type.Union(
      [
        "worker_hydrated",
        "intent_normalized",
        "plan_validated",
        "skeleton_emitted",
        "first_visible_ack",
        "refinement_emitted",
        "editable_milestone_saved",
        "latest_saved_revision",
        "bundle_finalized",
      ].map((value) => Type.Literal(value)),
    ),
    checkpointClass: Type.Union(
      ["baseline", "decision", "resume_only", "visible_unsaved", "durable_saved", "terminal_ready"].map(
        (value) => Type.Literal(value),
      ),
    ),
    createdAt: IsoDateTimeSchema,
    sourceRefs: Type.Object(
      {
        requestRef: IdentifierSchema,
        snapshotRef: IdentifierSchema,
        normalizedIntentRef: Type.Optional(Type.Union([IdentifierSchema, Type.Null()])),
        executablePlanRef: Type.Optional(Type.Union([IdentifierSchema, Type.Null()])),
        latestSaveReceiptId: Type.Optional(Type.Union([IdentifierSchema, Type.Null()])),
        bundleRef: Type.Optional(Type.Union([IdentifierSchema, Type.Null()])),
      },
      { additionalProperties: false },
    ),
    ledgerBoundary: Type.Object(
      {
        latestEmittedSeq: Type.Integer({ minimum: 0 }),
        latestAckedSeq: Type.Integer({ minimum: 0 }),
        reconciledThroughSeq: Type.Integer({ minimum: 0 }),
        openPlanStepIds: Type.Array(IdentifierSchema),
      },
      { additionalProperties: false },
    ),
    bundleSnapshot: Type.Object(
      {
        bundleSnapshotRef: IdentifierSchema,
        snapshotArtifactType: Type.Literal("LiveDraftArtifactBundle"),
        snapshotArtifactVersion: Type.Literal("v1"),
        checkpointRevision: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
        rootLayerIds: Type.Array(IdentifierSchema),
        editableLayerIds: Type.Array(IdentifierSchema),
        referencedAssetIds: Type.Array(IdentifierSchema),
        slotStatuses: Type.Array(
          Type.Object(
            {
              slotKey: SlotKeySchema,
              status: Type.Union(
                ["not_started", "visible_placeholder", "ready", "fallback_ready"].map(
                  (value) => Type.Literal(value),
                ),
              ),
              primaryLayerId: Type.Optional(Type.Union([IdentifierSchema, Type.Null()])),
            },
            { additionalProperties: false },
          ),
        ),
      },
      { additionalProperties: false },
    ),
    recoveryBase: Type.Object(
      {
        restoreTargetKind: Type.Union(
          ["run_start_snapshot", "latest_saved_revision"].map((value) =>
            Type.Literal(value),
          ),
        ),
        restoreTargetRevision: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
        restoreTargetCheckpointId: Type.Optional(Type.Union([IdentifierSchema, Type.Null()])),
        durabilityState: DurabilityStateSchema,
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

const MutationLedgerSchema = Type.Object(
  {
    runId: IdentifierSchema,
    traceId: IdentifierSchema,
    draftId: IdentifierSchema,
    orderedEntries: Type.Array(MutationLedgerEntrySchema),
    checkpoints: Type.Array(LastKnownGoodCheckpointSchema),
    lastKnownGoodCheckpointId: Type.Union([IdentifierSchema, Type.Null()]),
    reconciledThroughSeq: Type.Integer({ minimum: 0 }),
    lastKnownGoodRevision: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  },
  { additionalProperties: false },
);

export const LiveDraftArtifactBundleSchema = Type.Object(
  {
    bundleId: IdentifierSchema,
    artifactType: Type.Literal("LiveDraftArtifactBundle"),
    artifactVersion: Type.Literal("v1"),
    eventSequence: Type.Integer({ minimum: 1 }),
    runId: IdentifierSchema,
    canonicalRunId: IdentifierSchema,
    parentCommitPayloadRef: IdentifierSchema,
    traceId: IdentifierSchema,
    draftId: IdentifierSchema,
    editableCanvasState: Type.Object(
      {
        commitPayload: EditableBannerDraftCommitPayloadSchema,
        draftManifest: DraftManifestSchema,
      },
      { additionalProperties: false },
    ),
    referencedStoredAssets: Type.Array(StoredAssetDescriptorSchema),
    mutationLedger: MutationLedgerSchema,
    saveMetadata: Type.Object(
      {
        latestSaveReceipt: Type.Union([TemplateSaveReceiptSchema, Type.Null()]),
        completionSnapshot: RunCompletionSnapshotSchema,
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type StoredAssetDescriptor = Static<typeof StoredAssetDescriptorSchema>;
export type DraftManifest = Static<typeof DraftManifestSchema>;
export type EditableBannerDraftCommitPayload = Static<
  typeof EditableBannerDraftCommitPayloadSchema
>;
export type MutationLedgerEntry = Static<typeof MutationLedgerEntrySchema>;
export type LastKnownGoodCheckpoint = Static<typeof LastKnownGoodCheckpointSchema>;
export type MutationLedger = Static<typeof MutationLedgerSchema>;
export type LiveDraftArtifactBundle = Static<typeof LiveDraftArtifactBundleSchema>;
