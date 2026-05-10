import { Type, type Static } from "@sinclair/typebox";
import { AdminRunSummarySchema } from "./run-summary.js";
import { AdminArtifactKindSchema } from "./artifact-kinds.js";

export const AttemptSummarySchema = Type.Object({
  attemptSeq: Type.Integer({ minimum: 0 }),
  status: Type.String(),
  startedAt: Type.String({ format: "date-time" }),
  finishedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
});
export type AttemptSummary = Static<typeof AttemptSummarySchema>;

export const PhaseSummarySchema = Type.Object({
  phase: Type.String(),
  status: Type.Union(["pending", "running", "ok", "fail"].map((s) => Type.Literal(s))),
  startedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  finishedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
});
export type PhaseSummary = Static<typeof PhaseSummarySchema>;

export const ArtifactRefSchema = Type.Object({
  kind: AdminArtifactKindSchema,            // 실제 worker emit kind 만 허용
  key: Type.String(),                       // `runs/<runId>/attempts/<seq>/<filename>`
  attemptSeq: Type.Integer(),
  exists: Type.Boolean(),                   // object-store HEAD 결과
});
export type ArtifactRef = Static<typeof ArtifactRefSchema>;

export const RunEventSnapshotSchema = Type.Object({
  id: Type.String(),
  phase: Type.String(),
  type: Type.String(),
  at: Type.String({ format: "date-time" }),
  data: Type.Unknown(),
});
export type RunEventSnapshot = Static<typeof RunEventSnapshotSchema>;

export const AdminRunDetailSchema = Type.Object({
  run: AdminRunSummarySchema,
  userPromptFull: Type.String(),
  canvasMeta: Type.Object({ width: Type.Integer(), height: Type.Integer() }),
  attempts: Type.Array(AttemptSummarySchema),
  phases: Type.Array(PhaseSummarySchema),
  artifactRefs: Type.Array(ArtifactRefSchema),
  recentEvents: Type.Array(RunEventSnapshotSchema),  // 최근 200개, V0 §I 노출용
});
export type AdminRunDetail = Static<typeof AdminRunDetailSchema>;
