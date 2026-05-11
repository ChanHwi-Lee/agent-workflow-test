"use client";

import { useState } from "react";
import type { RunEventSnapshot } from "@tooldi/agent-contracts";

export function SectionRawEvents({
  events,
}: {
  events: RunEventSnapshot[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <section id="I" className="mb-8">
      <button
        type="button"
        className="text-sm font-semibold"
        onClick={() => setOpen((v) => !v)}
      >
        §I Raw Events ({events.length}) {open ? "▾" : "▸"}
      </button>
      {open && (
        <ol className="mt-2 max-h-96 overflow-auto bg-white border border-zinc-200 rounded p-2 text-xs font-mono">
          {events.map((e) => (
            <li key={e.id} className="py-0.5">
              <span className="text-zinc-400">{e.at.slice(11, 19)}</span>{" "}
              <span className="text-blue-600">{e.phase}</span>{" "}
              <span>{e.type}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
