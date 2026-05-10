import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { IdentifierSchema } from "../common.js";

export const V6AssetCandidateSchema = Type.Object(
  {
    rank: Type.Integer(),
    qdrantScore: Type.Number(),
    originKey: IdentifierSchema,
    srcUrl: Type.String(),
    selected: Type.Boolean(),
    rejectReason: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);

export const V6AssetResolutionPlaceholderSchema = Type.Object(
  {
    sourceSerial: Type.Integer(),
    placeholderHint: Type.String(),
    family: Type.Union(["photo", "graphic"].map((v) => Type.Literal(v))),
    candidates: Type.Array(V6AssetCandidateSchema),
    decision: Type.Union(["selected", "generate", "unresolved"].map((v) => Type.Literal(v))),
    decisionReason: Type.String(),
    selectedCandidateRank: Type.Union([Type.Integer(), Type.Null()]),
    fallbackGeneratedAssetId: Type.Union([IdentifierSchema, Type.Null()]),
  },
  { additionalProperties: false },
);

export const V6AssetResolutionLogSchema = Type.Object(
  {
    version: Type.Literal(1),
    runId: IdentifierSchema,
    attemptSeq: Type.Integer(),
    placeholders: Type.Array(V6AssetResolutionPlaceholderSchema),
  },
  { additionalProperties: false },
);

export const V6AssetGenerationItemSchema = Type.Object(
  {
    placeholderHint: Type.String(),
    model: Type.String(),
    prompt: Type.String(),
    latencyMs: Type.Integer(),
    outputAssetKey: IdentifierSchema,
    outputArtifactUrl: Type.String(),
    fileSizeBytes: Type.Integer(),
  },
  { additionalProperties: false },
);

export const V6AssetGenerationLogSchema = Type.Object(
  {
    version: Type.Literal(1),
    runId: IdentifierSchema,
    attemptSeq: Type.Integer(),
    items: Type.Array(V6AssetGenerationItemSchema),
  },
  { additionalProperties: false },
);

export type V6AssetCandidate = Static<typeof V6AssetCandidateSchema>;
export type V6AssetResolutionPlaceholder = Static<typeof V6AssetResolutionPlaceholderSchema>;
export type V6AssetResolutionLog = Static<typeof V6AssetResolutionLogSchema>;
export type V6AssetGenerationItem = Static<typeof V6AssetGenerationItemSchema>;
export type V6AssetGenerationLog = Static<typeof V6AssetGenerationLogSchema>;
