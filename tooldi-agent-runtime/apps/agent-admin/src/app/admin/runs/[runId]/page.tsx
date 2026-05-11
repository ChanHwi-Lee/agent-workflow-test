import { notFound } from "next/navigation";

import { RunDetailHeader } from "@/components/RunDetailHeader";
import { SectionAssetResolution } from "@/components/sections/SectionAssetResolution";
import { SectionFinalCommands } from "@/components/sections/SectionFinalCommands";
import { SectionHtmlGeneration } from "@/components/sections/SectionHtmlGeneration";
import { SectionPhaseTimeline } from "@/components/sections/SectionPhaseTimeline";
import { SectionRawEvents } from "@/components/sections/SectionRawEvents";
import { SectionUserInput } from "@/components/sections/SectionUserInput";
import { adminApi } from "@/lib/adminApi";
import { findArtifactKey } from "@/lib/findArtifactKey";

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

  const htmlKey = findArtifactKey(detail.artifactRefs, "debug-v6-html-preview");
  const reportKey = findArtifactKey(
    detail.artifactRefs,
    "v6-render-quality-report",
  );
  const resolutionKey = findArtifactKey(
    detail.artifactRefs,
    "v6-asset-resolution",
  );
  const generatedKey = findArtifactKey(
    detail.artifactRefs,
    "v6-asset-generated",
  );
  const planKey = findArtifactKey(detail.artifactRefs, "executable-plan");

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
        <SectionAssetResolution
          runId={detail.run.runId}
          resolutionKey={resolutionKey}
          generatedKey={generatedKey}
        />
        <SectionFinalCommands runId={detail.run.runId} artifactKey={planKey} />
        <SectionRawEvents events={detail.recentEvents} />
      </main>
    </div>
  );
}
