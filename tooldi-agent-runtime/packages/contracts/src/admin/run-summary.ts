import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { IdentifierSchema, IsoDateTimeSchema, RunStatusSchema } from "../common.js";

export const AdminRunSummarySchema = Type.Object(
  {
    runId: IdentifierSchema,
    status: RunStatusSchema,
    createdAt: IsoDateTimeSchema,
    attempts: Type.Integer({ minimum: 0 }),
    promptPreview: Type.String(),
  },
  { additionalProperties: false },
);

export const AdminRunsListResponseSchema = Type.Object(
  {
    runs: Type.Array(AdminRunSummarySchema),
    hasMore: Type.Boolean(),
    nextBefore: Type.Union([IsoDateTimeSchema, Type.Null()]),
  },
  { additionalProperties: false },
);

export type AdminRunSummary = Static<typeof AdminRunSummarySchema>;
export type AdminRunsListResponse = Static<typeof AdminRunsListResponseSchema>;
