export const runStatuses = [
  "enqueue_pending",
  "planning_queued",
  "planning",
  "plan_ready",
  "executing",
  "awaiting_apply_ack",
  "saving",
  "finalizing",
  "cancel_requested",
  "completed",
  "completed_with_warning",
  "save_failed_after_apply",
  "failed",
  "cancelled",
] as const;

export type RunStatus = (typeof runStatuses)[number];

export const terminalRunStatuses = [
  "completed",
  "completed_with_warning",
  "save_failed_after_apply",
  "failed",
  "cancelled",
] as const satisfies readonly RunStatus[];

export type TerminalRunStatus = (typeof terminalRunStatuses)[number];

const terminalRunStatusSet = new Set<RunStatus>(terminalRunStatuses);

export function isRunStatus(value: string): value is RunStatus {
  return runStatuses.includes(value as RunStatus);
}

export function isTerminalRunStatus(
  status: RunStatus,
): status is TerminalRunStatus {
  return terminalRunStatusSet.has(status);
}
