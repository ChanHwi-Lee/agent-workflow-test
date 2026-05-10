import { Type, type Static } from "@sinclair/typebox";

export const V6AssetCandidateSchema = Type.Object({
  rank: Type.Integer(),
  qdrantScore: Type.Number(),
  originKey: Type.String(),
  srcUrl: Type.String(),
  selected: Type.Boolean(),
  rejectReason: Type.Union([Type.String(), Type.Null()]),
});

export const V6AssetResolutionPlaceholderSchema = Type.Object({
  sourceSerial: Type.Integer(),
  placeholderHint: Type.String(),
  family: Type.Union(["photo", "graphic"].map((v) => Type.Literal(v))),
  candidates: Type.Array(V6AssetCandidateSchema),
  decision: Type.Union(["selected", "generate", "unresolved"].map((v) => Type.Literal(v))),
  decisionReason: Type.String(),
  selectedCandidateRank: Type.Union([Type.Integer(), Type.Null()]),
  fallbackGeneratedAssetId: Type.Union([Type.String(), Type.Null()]),
});

export const V6AssetResolutionLogSchema = Type.Object({
  version: Type.Literal(1),
  runId: Type.String(),
  attemptSeq: Type.Integer(),
  placeholders: Type.Array(V6AssetResolutionPlaceholderSchema),
});
export type V6AssetResolutionLog = Static<typeof V6AssetResolutionLogSchema>;

export const V6AssetGenerationItemSchema = Type.Object({
  placeholderHint: Type.String(),
  model: Type.String(),
  prompt: Type.String(),
  latencyMs: Type.Integer(),
  outputAssetKey: Type.String(),
  outputArtifactUrl: Type.String(),
  fileSizeBytes: Type.Integer(),
});

export const V6AssetGenerationLogSchema = Type.Object({
  version: Type.Literal(1),
  runId: Type.String(),
  attemptSeq: Type.Integer(),
  items: Type.Array(V6AssetGenerationItemSchema),
});
export type V6AssetGenerationLog = Static<typeof V6AssetGenerationLogSchema>;
