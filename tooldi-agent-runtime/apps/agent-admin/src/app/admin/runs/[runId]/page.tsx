import { notFound } from "next/navigation";

import { RunDetailHeader } from "@/components/RunDetailHeader";
import { SectionHtmlGeneration } from "@/components/sections/SectionHtmlGeneration";
import { SectionPhaseTimeline } from "@/components/sections/SectionPhaseTimeline";
import { SectionRawEvents } from "@/components/sections/SectionRawEvents";
import { SectionUserInput } from "@/components/sections/SectionUserInput";
import { adminApi } from "@/lib/adminApi";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: { runId: string };
}) {
  let detail;
  try {
    detail = await adminApi.getRun(params.runId);
  } catch (err) {
    // adminApi.getRun throws `Error("admin api <status>: <path>")` for non-OK
    // responses. 404 → Next notFound page; other failures (upstream down, 500,
    // network) → rethrow so the App Router error boundary renders instead of
    // a misleading 404.
    const message = err instanceof Error ? err.message : "";
    if (message.includes("admin api 404")) {
      notFound();
    }
    throw err;
  }
  const htmlKey =
    detail.artifactRefs.find(
      (r) => r.kind === "debug-v6-html-preview" && r.exists,
    )?.key ?? null;
  const reportKey =
    detail.artifactRefs.find(
      (r) => r.kind === "v6-render-quality-report" && r.exists,
    )?.key ?? null;
  return (
    <div>
      <RunDetailHeader detail={detail} />
      <main className="p-6 max-w-5xl mx-auto">
        <SectionUserInput detail={detail} />
        <SectionPhaseTimeline phases={detail.phases} />
        <SectionHtmlGeneration
          runId={detail.run.runId}
          htmlKey={htmlKey}
          reportKey={reportKey}
        />
        <SectionRawEvents events={detail.recentEvents} />
        <p className="text-xs text-zinc-400">
          §G / §H 는 다음 task 에서 추가됩니다.
        </p>
      </main>
    </div>
  );
}
