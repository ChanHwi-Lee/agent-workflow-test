ALTER TABLE "agent_runtime"."runs" ADD COLUMN IF NOT EXISTS "user_serial" TEXT NOT NULL DEFAULT '0';
