import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { IdentifierSchema, IsoDateTimeSchema } from "../common.js";
import { AdminArtifactKindSchema } from "./artifact-kinds.js";
import { AdminRunSummarySchema } from "./run-summary.js";

export const AttemptSummarySchema = Type.Object(
  {
    attemptSeq: Type.Integer({ minimum: 0 }),
    status: Type.String(),
    startedAt: IsoDateTimeSchema,
    finishedAt: Type.Union([IsoDateTimeSchema, Type.Null()]),
  },
  { additionalProperties: false },
);

export const PhaseSummarySchema = Type.Object(
  {
    phase: Type.String(),
    status: Type.Union(["pending", "running", "ok", "fail"].map((s) => Type.Literal(s))),
    startedAt: Type.Union([IsoDateTimeSchema, Type.Null()]),
    finishedAt: Type.Union([IsoDateTimeSchema, Type.Null()]),
  },
  { additionalProperties: false },
);

export const ArtifactRefSchema = Type.Object(
  {
    kind: AdminArtifactKindSchema,            // 실제 worker emit kind 만 허용
    key: IdentifierSchema,                    // `runs/<runId>/attempts/<seq>/<filename>`
    attemptSeq: Type.Integer(),
    exists: Type.Boolean(),                   // object-store HEAD 결과
  },
  { additionalProperties: false },
);

export const RunEventSnapshotSchema = Type.Object(
  {
    id: IdentifierSchema,
    phase: Type.String(),
    type: Type.String(),
    at: IsoDateTimeSchema,
    data: Type.Unknown(),
  },
  { additionalProperties: false },
);

export const AdminRunDetailSchema = Type.Object(
  {
    run: AdminRunSummarySchema,
    userPromptFull: Type.String(),
    canvasMeta: Type.Object(
      { width: Type.Integer(), height: Type.Integer() },
      { additionalProperties: false },
    ),
    attempts: Type.Array(AttemptSummarySchema),
    phases: Type.Array(PhaseSummarySchema),
    artifactRefs: Type.Array(ArtifactRefSchema),
    recentEvents: Type.Array(RunEventSnapshotSchema),  // 최근 200개, V0 §I 노출용
  },
  { additionalProperties: false },
);

export type AttemptSummary = Static<typeof AttemptSummarySchema>;
export type PhaseSummary = Static<typeof PhaseSummarySchema>;
export type ArtifactRef = Static<typeof ArtifactRefSchema>;
export type RunEventSnapshot = Static<typeof RunEventSnapshotSchema>;
export type AdminRunDetail = Static<typeof AdminRunDetailSchema>;
