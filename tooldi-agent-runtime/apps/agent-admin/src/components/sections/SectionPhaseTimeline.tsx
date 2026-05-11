import type { PhaseSummary } from "@tooldi/agent-contracts";

// PhaseSummary.status enum: "pending" | "running" | "ok" | "fail".
// Record<PhaseStatus, string> forces TS errors if the enum changes upstream.
type PhaseStatus = PhaseSummary["status"];

const STATUS_COLOR: Record<PhaseStatus, string> = {
  pending: "bg-zinc-200",
  running: "bg-blue-300 animate-pulse",
  ok: "bg-emerald-400",
  fail: "bg-rose-500",
};

export function SectionPhaseTimeline({ phases }: { phases: PhaseSummary[] }) {
  return (
    <section id="B" className="mb-8">
      <h2 className="text-base font-semibold mb-2">§B Phase Timeline</h2>
      <ol className="flex flex-wrap gap-2">
        {phases.map((p, i) => (
          <li
            key={`${p.phase}-${i}`}
            className="flex items-center gap-1 text-xs"
          >
            <span
              className={`w-2 h-2 rounded-full ${STATUS_COLOR[p.status]}`}
            />
            <span>{p.phase}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
