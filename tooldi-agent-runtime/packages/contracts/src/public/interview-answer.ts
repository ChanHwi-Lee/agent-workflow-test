import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { IdentifierSchema, IsoDateTimeSchema } from "../common.js";
import { InterviewAnswerSchema } from "../worker/interview.js";

export const InterviewAnswerRequestSchema = Type.Object(
  {
    traceId: IdentifierSchema,
    answers: Type.Array(InterviewAnswerSchema),
  },
  { additionalProperties: false },
);

export const InterviewAnswerResponseSchema = Type.Object(
  {
    accepted: Type.Boolean(),
    runId: IdentifierSchema,
    receivedAt: IsoDateTimeSchema,
  },
  { additionalProperties: false },
);

export type InterviewAnswerRequest = Static<typeof InterviewAnswerRequestSchema>;
export type InterviewAnswerResponse = Static<typeof InterviewAnswerResponseSchema>;
