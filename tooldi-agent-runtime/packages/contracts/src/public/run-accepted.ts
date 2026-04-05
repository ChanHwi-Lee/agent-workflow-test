import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { IdentifierSchema, IsoDateTimeSchema, UrlOrPathSchema } from "../common.js";

export const RunAcceptedSchema = Type.Object(
  {
    runId: IdentifierSchema,
    traceId: IdentifierSchema,
    status: Type.Literal("queued"),
    startedAt: IsoDateTimeSchema,
    deadlineAt: IsoDateTimeSchema,
    streamUrl: UrlOrPathSchema,
    cancelUrl: UrlOrPathSchema,
    mutationAckUrl: UrlOrPathSchema,
  },
  { additionalProperties: false },
);

export type RunAccepted = Static<typeof RunAcceptedSchema>;
