import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { IdentifierSchema } from "../common.js";

export const RunIdParamsSchema = Type.Object(
  {
    runId: IdentifierSchema,
  },
  { additionalProperties: false },
);

export const MutationIdParamsSchema = Type.Object(
  {
    runId: IdentifierSchema,
    mutationId: IdentifierSchema,
  },
  { additionalProperties: false },
);

export const RunEventsQuerySchema = Type.Object(
  {
    afterEventId: Type.Optional(IdentifierSchema),
  },
  { additionalProperties: false },
);

export type RunIdParams = Static<typeof RunIdParamsSchema>;
export type MutationIdParams = Static<typeof MutationIdParamsSchema>;
export type RunEventsQuery = Static<typeof RunEventsQuerySchema>;
