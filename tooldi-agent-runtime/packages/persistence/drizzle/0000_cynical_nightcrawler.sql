CREATE SCHEMA "agent_interview";
--> statement-breakpoint
CREATE TABLE "agent_interview"."interview_records" (
	"record_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text NOT NULL,
	"attempt_seq" integer DEFAULT 0 NOT NULL,
	"user_id" integer,
	"session_id" text,
	"original_prompt" text,
	"canvas" jsonb,
	"interview" jsonb NOT NULL,
	"derived_brief" text,
	"built_user_prompt" text,
	"usages" jsonb,
	"timings_ms" jsonb,
	"auto_filled_count" integer DEFAULT 0,
	"auto_filled_ids" text[] DEFAULT '{}',
	"model" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "idx_interview_records_run_id" ON "agent_interview"."interview_records" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_interview_records_created_at" ON "agent_interview"."interview_records" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_interview_records_user_id" ON "agent_interview"."interview_records" USING btree ("user_id");