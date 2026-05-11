import type { AdminRunDetail } from "@tooldi/agent-contracts";

import { StatusBadge } from "./StatusBadge";

export function RunDetailHeader({ detail }: { detail: AdminRunDetail }) {
  return (
    <header className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-4 py-3 flex items-center gap-3">
      <span className="font-mono text-sm">{detail.run.runId}</span>
      <StatusBadge status={detail.run.status} />
      <span className="text-xs text-zinc-500">
        {detail.attempts.length} attempts
      </span>
    </header>
  );
}
