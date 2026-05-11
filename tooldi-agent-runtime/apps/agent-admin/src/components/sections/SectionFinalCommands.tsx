"use client";

import { useEffect, useState } from "react";

export function SectionFinalCommands({
  runId,
  artifactKey,
}: {
  runId: string;
  artifactKey: string | null;
}) {
  const [data, setData] = useState<unknown | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!artifactKey) {
      setData(null);
      return;
    }
    fetch(
      `/api/proxy/admin/runs/${runId}/artifacts?key=${encodeURIComponent(artifactKey)}`,
    )
      .then((r) => r.json())
      .then((j: unknown) => {
        if (!cancelled) setData(j);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [runId, artifactKey]);

  if (!artifactKey) return null;
  if (!data) {
    return (
      <section id="H" className="mb-8">
        <h2 className="text-base font-semibold mb-2">§H Executable Plan</h2>
        <div className="text-xs text-zinc-500">로드 중…</div>
      </section>
    );
  }

  return (
    <section id="H" className="mb-8">
      <h2 className="text-base font-semibold mb-2">§H Executable Plan</h2>
      <pre className="bg-white border border-zinc-200 rounded p-3 text-xs max-h-96 overflow-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </section>
  );
}
