CREATE TABLE IF NOT EXISTS agent_run_requests (
  request_id TEXT PRIMARY KEY,
  client_request_id TEXT NOT NULL,
  editor_session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  accepted_http_request_id TEXT NOT NULL,
  prompt_ref TEXT,
  redacted_preview TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_run_requests_client_request_id
  ON agent_run_requests (client_request_id);

CREATE INDEX IF NOT EXISTS idx_agent_run_requests_run_id
  ON agent_run_requests (run_id);

CREATE TABLE IF NOT EXISTS agent_runs (
  run_id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  status TEXT NOT NULL,
  status_reason_code TEXT,
  attempt_seq INTEGER NOT NULL DEFAULT 1,
  queue_job_id TEXT,
  request_ref TEXT NOT NULL,
  snapshot_ref TEXT NOT NULL,
  deadline_at TIMESTAMPTZ,
  last_acked_mutation_seq INTEGER NOT NULL DEFAULT 0,
  latest_save_receipt_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_trace_id
  ON agent_runs (trace_id);

CREATE INDEX IF NOT EXISTS idx_agent_runs_document_page
  ON agent_runs (document_id, page_id);

CREATE TABLE IF NOT EXISTS agent_run_attempts (
  attempt_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  attempt_seq INTEGER NOT NULL,
  retry_of_attempt_seq INTEGER,
  queue_job_id TEXT NOT NULL,
  accepted_http_request_id TEXT NOT NULL,
  attempt_state TEXT NOT NULL,
  status_reason_code TEXT,
  started_at TIMESTAMPTZ,
  lease_recognized_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_run_attempts_run_id
  ON agent_run_attempts (run_id);

CREATE INDEX IF NOT EXISTS idx_agent_run_attempts_queue_job_id
  ON agent_run_attempts (queue_job_id);

CREATE TABLE IF NOT EXISTS agent_run_events (
  event_id BIGSERIAL PRIMARY KEY,
  run_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  http_request_id TEXT,
  event_type TEXT NOT NULL,
  payload_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_run_events_run_id
  ON agent_run_events (run_id, event_id);

CREATE TABLE IF NOT EXISTS agent_mutation_ledger (
  mutation_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  draft_id TEXT,
  action_id TEXT,
  tool_call_id TEXT,
  seq INTEGER NOT NULL,
  apply_status TEXT NOT NULL,
  resulting_revision INTEGER,
  resolved_layer_ids JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_mutation_ledger_run_seq
  ON agent_mutation_ledger (run_id, seq);

CREATE TABLE IF NOT EXISTS agent_cost_summaries (
  run_id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  cost_state TEXT NOT NULL,
  billable_external_usd NUMERIC(18, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_live_draft_bundles (
  bundle_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  draft_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  bundle_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_run_completions (
  completion_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  bundle_id TEXT,
  trace_id TEXT NOT NULL,
  terminal_status TEXT NOT NULL,
  authoritative_canvas_final_state_ref TEXT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
