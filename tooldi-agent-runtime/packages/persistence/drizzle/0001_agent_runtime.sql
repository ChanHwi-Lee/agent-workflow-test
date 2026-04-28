CREATE SCHEMA "agent_runtime";
--> statement-breakpoint
CREATE TABLE "agent_runtime"."run_requests" (
	"request_id" text PRIMARY KEY NOT NULL,
	"client_request_id" text NOT NULL,
	"editor_session_id" text NOT NULL,
	"run_id" text NOT NULL,
	"trace_id" text NOT NULL,
	"surface" text NOT NULL,
	"normalized_prompt" text NOT NULL,
	"locale" text NOT NULL,
	"timezone" text NOT NULL,
	"accepted_http_request_id" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"prompt_ref" text NOT NULL,
	"redacted_preview" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runtime"."runs" (
	"run_id" text PRIMARY KEY NOT NULL,
	"trace_id" text NOT NULL,
	"request_id" text NOT NULL,
	"document_id" text NOT NULL,
	"page_id" text NOT NULL,
	"status" text NOT NULL,
	"status_reason_code" text,
	"attempt_seq" integer NOT NULL,
	"queue_job_id" text,
	"request_ref" text NOT NULL,
	"snapshot_ref" text NOT NULL,
	"draft_id" text,
	"final_artifact_ref" text,
	"completion_record_ref" text,
	"latest_save_receipt_id" text,
	"latest_saved_revision" integer,
	"final_revision" integer,
	"deadline_at" timestamp with time zone NOT NULL,
	"last_acked_seq" integer NOT NULL,
	"page_lock_token" text NOT NULL,
	"cancel_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runtime"."run_attempts" (
	"attempt_id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"trace_id" text NOT NULL,
	"attempt_seq" integer NOT NULL,
	"retry_of_attempt_seq" integer,
	"queue_job_id" text NOT NULL,
	"accepted_http_request_id" text NOT NULL,
	"attempt_state" text NOT NULL,
	"status_reason_code" text,
	"worker_id" text,
	"started_at" timestamp with time zone,
	"lease_recognized_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runtime"."run_events" (
	"event_id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"trace_id" text NOT NULL,
	"event" jsonb NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runtime"."mutation_ledger" (
	"mutation_id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"trace_id" text NOT NULL,
	"attempt_seq" integer NOT NULL,
	"queue_job_id" text NOT NULL,
	"seq" integer NOT NULL,
	"rollback_group_id" text NOT NULL,
	"expected_base_revision" integer,
	"mutation" jsonb NOT NULL,
	"proposed_at" timestamp with time zone NOT NULL,
	"ack_status" text,
	"ack_record" jsonb
);
--> statement-breakpoint
CREATE TABLE "agent_runtime"."run_recoveries" (
	"recovery_id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"trace_id" text NOT NULL,
	"attempt_seq" integer NOT NULL,
	"queue_job_id" text NOT NULL,
	"reason_code" text NOT NULL,
	"source" text NOT NULL,
	"recovery" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runtime"."cost_summaries" (
	"run_id" text PRIMARY KEY NOT NULL,
	"trace_id" text NOT NULL,
	"final_status" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runtime"."draft_bundles" (
	"bundle_id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"trace_id" text NOT NULL,
	"draft_id" text NOT NULL,
	"payload_ref" text NOT NULL,
	"payload" jsonb NOT NULL,
	"event_sequence" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runtime"."run_completions" (
	"completion_record_id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"trace_id" text NOT NULL,
	"record" jsonb NOT NULL,
	"completed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_agent_runtime_run_requests_dedupe_key" ON "agent_runtime"."run_requests" USING btree ("dedupe_key");
--> statement-breakpoint
CREATE INDEX "idx_agent_runtime_run_requests_run_id" ON "agent_runtime"."run_requests" USING btree ("run_id");
--> statement-breakpoint
CREATE INDEX "idx_agent_runtime_run_requests_client_request_id" ON "agent_runtime"."run_requests" USING btree ("client_request_id");
--> statement-breakpoint
CREATE INDEX "idx_agent_runtime_runs_trace_id" ON "agent_runtime"."runs" USING btree ("trace_id");
--> statement-breakpoint
CREATE INDEX "idx_agent_runtime_runs_document_page" ON "agent_runtime"."runs" USING btree ("document_id","page_id");
--> statement-breakpoint
CREATE INDEX "idx_agent_runtime_runs_status" ON "agent_runtime"."runs" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_agent_runtime_run_attempts_run_seq" ON "agent_runtime"."run_attempts" USING btree ("run_id","attempt_seq");
--> statement-breakpoint
CREATE INDEX "idx_agent_runtime_run_attempts_queue_job_id" ON "agent_runtime"."run_attempts" USING btree ("queue_job_id");
--> statement-breakpoint
CREATE INDEX "idx_agent_runtime_run_events_run_id_event_id" ON "agent_runtime"."run_events" USING btree ("run_id","event_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_agent_runtime_mutation_ledger_run_seq" ON "agent_runtime"."mutation_ledger" USING btree ("run_id","seq");
--> statement-breakpoint
CREATE INDEX "idx_agent_runtime_mutation_ledger_run_id" ON "agent_runtime"."mutation_ledger" USING btree ("run_id");
--> statement-breakpoint
CREATE INDEX "idx_agent_runtime_run_recoveries_run_id_created_at" ON "agent_runtime"."run_recoveries" USING btree ("run_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_agent_runtime_draft_bundles_run_id" ON "agent_runtime"."draft_bundles" USING btree ("run_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_agent_runtime_run_completions_run_id" ON "agent_runtime"."run_completions" USING btree ("run_id");
