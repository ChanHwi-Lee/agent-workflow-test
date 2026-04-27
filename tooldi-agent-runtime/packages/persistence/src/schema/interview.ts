import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  InterviewAnswer,
  InterviewQuestion,
} from "@tooldi/agent-contracts";

export const agentInterviewSchema = pgSchema("agent_interview");

export interface InterviewRecordCanvas {
  width: number;
  height: number;
}

export interface InterviewRecordPayload {
  questions: ReadonlyArray<InterviewQuestion>;
  answers: ReadonlyArray<InterviewAnswer>;
}

export interface InterviewRecordUsages {
  questions: unknown;
  answers: unknown;
  brief: unknown;
}

export interface InterviewRecordTimings {
  questionsMs: number;
  answersMs: number;
  briefMs: number;
  totalMs: number;
}

export const interviewRecords = agentInterviewSchema.table(
  "interview_records",
  {
    recordId: uuid("record_id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    runId: text("run_id").notNull(),
    attemptSeq: integer("attempt_seq").notNull().default(0),
    userId: integer("user_id"),
    sessionId: text("session_id"),
    originalPrompt: text("original_prompt"),
    canvas: jsonb("canvas").$type<InterviewRecordCanvas>(),
    interview: jsonb("interview").$type<InterviewRecordPayload>().notNull(),
    derivedBrief: text("derived_brief"),
    builtUserPrompt: text("built_user_prompt"),
    usages: jsonb("usages").$type<InterviewRecordUsages>(),
    timingsMs: jsonb("timings_ms").$type<InterviewRecordTimings>(),
    autoFilledCount: integer("auto_filled_count").default(0),
    autoFilledIds: text("auto_filled_ids").array().default(sql`'{}'`),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_interview_records_run_id").on(table.runId),
    index("idx_interview_records_created_at").on(table.createdAt),
    index("idx_interview_records_user_id").on(table.userId),
  ],
);
