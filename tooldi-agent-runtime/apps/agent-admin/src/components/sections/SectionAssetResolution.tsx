"use client";

import { useEffect, useState } from "react";

import type {
  V6AssetGenerationItem,
  V6AssetGenerationLog,
  V6AssetResolutionLog,
} from "@tooldi/agent-contracts";

export function SectionAssetResolution({
  runId,
  resolutionKey,
  generatedKey,
}: {
  runId: string;
  resolutionKey: string | null;
  generatedKey: string | null;
}) {
  const [resolution, setResolution] = useState<V6AssetResolutionLog | null>(
    null,
  );
  const [generated, setGenerated] = useState<V6AssetGenerationLog | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (resolutionKey) {
      fetch(
        `/api/proxy/admin/runs/${runId}/artifacts?key=${encodeURIComponent(resolutionKey)}`,
      )
        .then((r) => r.json())
        .then((j: V6AssetResolutionLog) => {
          if (!cancelled) setResolution(j);
        })
        .catch(() => {
          if (!cancelled) setResolution(null);
        });
    }
    if (generatedKey) {
      fetch(
        `/api/proxy/admin/runs/${runId}/artifacts?key=${encodeURIComponent(generatedKey)}`,
      )
        .then((r) => r.json())
        .then((j: V6AssetGenerationLog) => {
          if (!cancelled) setGenerated(j);
        })
        .catch(() => {
          if (!cancelled) setGenerated(null);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [runId, resolutionKey, generatedKey]);

  if (!resolutionKey) return null;
  if (!resolution) {
    return (
      <section id="G" className="mb-8">
        <h2 className="text-base font-semibold mb-2">§G Asset Resolution (RAG)</h2>
        <div className="text-xs text-zinc-500">로드 중…</div>
      </section>
    );
  }
  if (resolution.placeholders.length === 0) {
    return (
      <section id="G" className="mb-8">
        <h2 className="text-base font-semibold mb-2">§G Asset Resolution (RAG)</h2>
        <div className="text-xs text-zinc-500">RAG placeholder 가 없습니다.</div>
      </section>
    );
  }

  return (
    <section id="G" className="mb-8">
      <h2 className="text-base font-semibold mb-2">§G Asset Resolution (RAG)</h2>
      {resolution.placeholders.map((p) => {
        const matchingGeneration =
          generated?.items.find((g) => g.placeholderHint === p.placeholderHint) ??
          null;
        const decisionColor =
          p.decision === "selected"
            ? "text-emerald-700"
            : p.decision === "generate"
              ? "text-blue-700"
              : "text-rose-700";
        return (
          <div
            key={`${p.sourceSerial}-${p.placeholderHint}`}
            className="mb-4 p-3 bg-white border border-zinc-200 rounded"
          >
            <div className="text-xs font-mono text-zinc-500">
              #{p.sourceSerial} · {p.family}
            </div>
            <div className="text-sm font-semibold">{p.placeholderHint}</div>
            <div className="text-xs mt-1">
              결정: <span className={decisionColor}>{p.decision}</span>
              {p.decisionReason ? ` — ${p.decisionReason}` : null}
            </div>
            {p.candidates.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-2">
                {p.candidates.map((c) => (
                  <div
                    key={c.rank}
                    className={`p-1 border ${
                      c.selected
                        ? "border-emerald-500 ring-2 ring-emerald-300"
                        : "border-zinc-200"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.srcUrl}
                      alt=""
                      className="w-full h-24 object-cover"
                      loading="lazy"
                    />
                    <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                      #{c.rank} · {c.qdrantScore.toFixed(3)}
                    </div>
                    {c.rejectReason && (
                      <div className="text-[10px] text-rose-600">
                        {c.rejectReason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {p.decision === "generate" && matchingGeneration && (
              <GeminiPanel item={matchingGeneration} runId={runId} />
            )}
          </div>
        );
      })}
    </section>
  );
}

function GeminiPanel({
  item,
  runId,
}: {
  item: V6AssetGenerationItem;
  runId: string;
}) {
  return (
    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
      <div className="text-xs font-semibold text-blue-800">
        Gemini ({item.model}, {item.latencyMs}ms)
      </div>
      <details className="text-xs">
        <summary>prompt</summary>
        <pre className="whitespace-pre-wrap">{item.prompt}</pre>
      </details>
      <div className="mt-1 text-[10px] font-mono text-zinc-500">
        outputAssetKey={item.outputAssetKey} · {item.fileSizeBytes} bytes
      </div>
      {/* outputArtifactUrl 은 publish 된 publicUrl 이라 별도 proxy 불필요.
          fallback 으로 outputAssetKey 가 object-store key 인 경우만 proxy 경로로 노출. */}
      {item.outputArtifactUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.outputArtifactUrl}
          alt=""
          className="mt-1 max-h-48"
          loading="lazy"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/proxy/admin/runs/${runId}/artifacts?key=${encodeURIComponent(item.outputAssetKey)}`}
          alt=""
          className="mt-1 max-h-48"
          loading="lazy"
        />
      )}
    </div>
  );
}
