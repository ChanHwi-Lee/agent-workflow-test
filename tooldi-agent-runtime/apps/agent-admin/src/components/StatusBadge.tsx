import type { RunStatus } from "@tooldi/agent-contracts";

// Covers all 13 RunStatusValues from packages/contracts/src/common.ts.
// Record<RunStatus, string> ensures TS errors if a new status is added upstream.
const colors: Record<RunStatus, string> = {
  enqueue_pending: "bg-zinc-200 text-zinc-700",
  planning_queued: "bg-zinc-200 text-zinc-700",
  planning: "bg-blue-100 text-blue-700",
  plan_ready: "bg-blue-100 text-blue-700",
  executing: "bg-blue-200 text-blue-800",
  awaiting_apply_ack: "bg-blue-200 text-blue-800",
  saving: "bg-blue-200 text-blue-800",
  finalizing: "bg-blue-200 text-blue-800",
  cancel_requested: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  save_failed_after_apply: "bg-rose-100 text-rose-700",
  failed: "bg-rose-100 text-rose-700",
  cancelled: "bg-amber-100 text-amber-700",
};

export function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-mono ${colors[status]}`}
    >
      {status}
    </span>
  );
}
