import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { IdentifierSchema, IsoDateTimeSchema } from "../common.js";

export const CancelRunRequestSchema = Type.Object(
  {
    traceId: IdentifierSchema,
    reason: Type.Optional(
      Type.Union(
        ["user_stop", "navigation", "client_timeout"].map((value) =>
          Type.Literal(value),
        ),
      ),
    ),
  },
  { additionalProperties: false },
);

export const CancelRunResponseSchema = Type.Object(
  {
    runId: IdentifierSchema,
    status: Type.Literal("cancel_requested"),
    requestedAt: IsoDateTimeSchema,
  },
  { additionalProperties: false },
);

export type CancelRunRequest = Static<typeof CancelRunRequestSchema>;
export type CancelRunResponse = Static<typeof CancelRunResponseSchema>;
