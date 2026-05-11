"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type {
  AdminRunSummary,
  AdminRunsListResponse,
} from "@tooldi/agent-contracts";

import { StatusBadge } from "./StatusBadge";

const POLL_INTERVAL_MS = 5000;

export function RunsList({ initial }: { initial: AdminRunsListResponse }) {
  const [data, setData] = useState<AdminRunsListResponse>(initial);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (typeof document !== "undefined" && document.hidden) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(`/api/proxy/admin/runs?limit=50`, {
          signal: ctrl.signal,
        });
        if (cancelled || !res.ok) return;
        const next = (await res.json()) as AdminRunsListResponse;
        if (!cancelled) setData(next);
      } catch {
        // abort or network error → next tick
      }
    }

    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, []);

  if (data.runs.length === 0) {
    return (
      <p className="text-sm text-zinc-500 py-4">아직 실행된 run 이 없습니다.</p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200">
      {data.runs.map((r: AdminRunSummary) => (
        <li
          key={r.runId}
          className="py-2 flex items-center gap-3 text-sm"
        >
          <span className="font-mono text-xs text-zinc-500">
            {r.createdAt.slice(11, 16)}
          </span>
          <Link
            href={`/admin/runs/${r.runId}`}
            className="font-mono text-xs hover:underline"
          >
            {r.runId.slice(0, 12)}
          </Link>
          <StatusBadge status={r.status} />
          <span className="text-xs text-zinc-500">{r.attempts}att</span>
          <span className="truncate max-w-md">{r.promptPreview}</span>
        </li>
      ))}
    </ul>
  );
}
