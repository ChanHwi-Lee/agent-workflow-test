import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

// Admin-side projection of worker `V6RenderQualityReport`
// (apps/agent-worker/src/phases/v6RenderQualityReport.ts).
//
// Worker emits severity "info" | "warn" only — the load-bearing "red" signal is
// `blocking: true` (root_bounds_mismatch, off_canvas_*, scroll_overflow,
// text_overlap, text_image_overlap 등 hard-gate 후보). Admin V0 doesn't need
// to deserialize `canvas` / `metrics` shapes in detail, so they are kept as
// `Type.Unknown()` to avoid pulling worker-only types (V6Canvas,
// V6RenderQualityMetrics) into the public contracts surface.

export const V6RenderQualitySeverityValues = ["info", "warn"] as const;
export const V6RenderQualitySeveritySchema = Type.Union(
  V6RenderQualitySeverityValues.map((v) => Type.Literal(v)),
);

export const V6RenderQualityIssueSchema = Type.Object(
  {
    code: Type.String(),
    severity: V6RenderQualitySeveritySchema,
    blocking: Type.Boolean(),
    path: Type.String(),
    tag: Type.String(),
    message: Type.String(),
    metrics: Type.Optional(Type.Unknown()),
  },
  { additionalProperties: false },
);

export const V6RenderQualityReportSchema = Type.Object(
  {
    version: Type.Literal(1),
    status: Type.Literal("observed"),
    passed: Type.Boolean(),
    hardGateCandidate: Type.Boolean(),
    canvas: Type.Optional(Type.Unknown()),
    metrics: Type.Optional(Type.Unknown()),
    issues: Type.Array(V6RenderQualityIssueSchema),
    blockingIssues: Type.Array(V6RenderQualityIssueSchema),
  },
  { additionalProperties: false },
);

export type V6RenderQualitySeverity = Static<typeof V6RenderQualitySeveritySchema>;
export type V6RenderQualityIssue = Static<typeof V6RenderQualityIssueSchema>;
export type V6RenderQualityReport = Static<typeof V6RenderQualityReportSchema>;
