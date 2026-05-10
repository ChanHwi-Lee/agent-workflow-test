import { Type, type Static } from "@sinclair/typebox";
import { RunStatusSchema } from "../common.js";

export const AdminRunSummarySchema = Type.Object({
  runId: Type.String(),
  status: RunStatusSchema,
  createdAt: Type.String({ format: "date-time" }),
  attempts: Type.Integer({ minimum: 0 }),
  promptPreview: Type.String(),
});
export type AdminRunSummary = Static<typeof AdminRunSummarySchema>;

export const AdminRunsListResponseSchema = Type.Object({
  runs: Type.Array(AdminRunSummarySchema),
  hasMore: Type.Boolean(),
  nextBefore: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
});
export type AdminRunsListResponse = Static<typeof AdminRunsListResponseSchema>;
