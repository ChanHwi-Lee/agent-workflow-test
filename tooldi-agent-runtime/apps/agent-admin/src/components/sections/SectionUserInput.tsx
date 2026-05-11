import type { AdminRunDetail } from "@tooldi/agent-contracts";

export function SectionUserInput({ detail }: { detail: AdminRunDetail }) {
  return (
    <section id="A" className="mb-8">
      <h2 className="text-base font-semibold mb-2">§A User Input</h2>
      <pre className="bg-white border border-zinc-200 rounded p-3 text-xs whitespace-pre-wrap">
        {detail.userPromptFull || "(empty)"}
      </pre>
      <div className="mt-1 text-xs text-zinc-500 font-mono">
        canvas {detail.canvasMeta.width}×{detail.canvasMeta.height}
      </div>
    </section>
  );
}
