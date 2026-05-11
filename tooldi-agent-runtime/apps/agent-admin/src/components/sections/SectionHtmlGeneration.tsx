"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  V6RenderQualityIssue,
  V6RenderQualityReport,
} from "@tooldi/agent-contracts";

// Subset of `V6DebugHtmlPreviewArtifact` (apps/agent-worker/src/phases/v6DebugHtmlPreview.ts).
interface DebugHtmlArtifact {
  html?: string;
}

export function SectionHtmlGeneration({
  runId,
  htmlKey,
  reportKey,
}: {
  runId: string;
  htmlKey: string | null;
  reportKey: string | null;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [report, setReport] = useState<V6RenderQualityReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (htmlKey) {
      fetch(
        `/api/proxy/admin/runs/${runId}/artifacts?key=${encodeURIComponent(htmlKey)}`,
      )
        .then((r) => r.json())
        .then((j: unknown) => {
          if (cancelled) return;
          if (typeof j === "string") {
            setHtml(j);
          } else if (j && typeof j === "object" && "html" in j) {
            const candidate = (j as DebugHtmlArtifact).html;
            setHtml(typeof candidate === "string" ? candidate : null);
          } else {
            setHtml(null);
          }
        })
        .catch(() => {
          if (!cancelled) setHtml(null);
        });
    }
    if (reportKey) {
      fetch(
        `/api/proxy/admin/runs/${runId}/artifacts?key=${encodeURIComponent(reportKey)}`,
      )
        .then((r) => r.json())
        .then((j: V6RenderQualityReport) => {
          if (!cancelled) setReport(j);
        })
        .catch(() => {
          if (!cancelled) setReport(null);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [runId, htmlKey, reportKey]);

  // "빨강" highlight = blocking issues (hard-gate candidates). Severity is at
  // most "warn" in current worker emit; rely on `blocking` flag for red rows.
  const blockingIssues = useMemo<V6RenderQualityIssue[]>(() => {
    if (!report) return [];
    if (Array.isArray(report.blockingIssues) && report.blockingIssues.length > 0) {
      return report.blockingIssues;
    }
    return (report.issues ?? []).filter((i) => i.blocking);
  }, [report]);

  const nonBlockingIssues = useMemo<V6RenderQualityIssue[]>(() => {
    if (!report) return [];
    return (report.issues ?? []).filter((i) => !i.blocking);
  }, [report]);

  if (!htmlKey && !reportKey) return null;
  if (!html && !report) return null;

  return (
    <section id="F" className="mb-8">
      <h2 className="text-base font-semibold mb-2">§F HTML Generation</h2>
      {html ? (
        <iframe
          title="v6 constrained html preview"
          sandbox="allow-same-origin"
          srcDoc={html}
          className="w-full h-[640px] border border-zinc-300 bg-white rounded"
        />
      ) : htmlKey ? (
        <div className="text-xs text-zinc-500">HTML preview 로드 중…</div>
      ) : null}

      {blockingIssues.length > 0 && (
        <ul className="mt-3 space-y-1">
          {blockingIssues.map((iss, idx) => (
            <li
              key={`block-${idx}`}
              className="text-xs px-2 py-1 bg-rose-50 border border-rose-200 rounded text-rose-800"
            >
              <span className="font-mono mr-2">{iss.code}</span>
              <span className="font-mono text-rose-600/70 mr-2">
                {iss.tag}@{iss.path}
              </span>
              {iss.message}
            </li>
          ))}
        </ul>
      )}

      {nonBlockingIssues.length > 0 && (
        <ul className="mt-2 space-y-1">
          {nonBlockingIssues.map((iss, idx) => (
            <li
              key={`info-${idx}`}
              className="text-xs px-2 py-1 bg-amber-50 border border-amber-200 rounded text-amber-800"
            >
              <span className="font-mono mr-2">{iss.code}</span>
              <span className="font-mono text-amber-600/70 mr-2">
                {iss.tag}@{iss.path}
              </span>
              {iss.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
