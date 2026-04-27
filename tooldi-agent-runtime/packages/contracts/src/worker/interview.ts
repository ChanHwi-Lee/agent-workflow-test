import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import { IdentifierSchema } from "../common.js";

const InterviewQuestionTypeSchema = Type.Union(
  ["single_choice", "multi_choice", "free_text"].map((value) =>
    Type.Literal(value),
  ),
);

export const InterviewQuestionSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    title: Type.String({ minLength: 1 }),
    type: InterviewQuestionTypeSchema,
    choices: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    allow_other: Type.Boolean(),
    rationale: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const InterviewAnswerSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    value: Type.Optional(Type.String()),
    values: Type.Optional(Type.Array(Type.String())),
    is_other: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const InterviewResumeJobPayloadSchema = Type.Object(
  {
    runId: IdentifierSchema,
    traceId: IdentifierSchema,
    attemptSeq: Type.Integer({ minimum: 1 }),
    queueJobId: IdentifierSchema,
    answers: Type.Array(InterviewAnswerSchema),
  },
  { additionalProperties: false },
);

export type InterviewQuestion = Static<typeof InterviewQuestionSchema>;
export type InterviewAnswer = Static<typeof InterviewAnswerSchema>;
export type InterviewResumeJobPayload = Static<
  typeof InterviewResumeJobPayloadSchema
>;

export function isInterviewResumeJobPayload(
  value: unknown,
): value is InterviewResumeJobPayload {
  return Value.Check(InterviewResumeJobPayloadSchema, value);
}

export function firstInterviewResumeJobPayloadError(
  value: unknown,
): string | null {
  const issue = Value.Errors(InterviewResumeJobPayloadSchema, value).First();
  if (!issue) return null;
  const path = issue.path.length > 0 ? issue.path : "$";
  return `${path}: ${issue.message}`;
}
