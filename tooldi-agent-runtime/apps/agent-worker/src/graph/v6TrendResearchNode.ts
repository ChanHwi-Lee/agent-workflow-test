import type { StateGraph } from "@langchain/langgraph";

import {
  buildV6TrendCacheKey,
  createGeminiV6TrendResearcher,
  InMemoryV6TrendCache,
  type V6TrendBrief,
  type V6TrendResearcher,
} from "../phases/v6TrendResearch.js";
import { RunJobGraphState } from "./runJobGraphState.js";
import type { RunJobGraphStateType } from "./runJobGraphState.js";
import type { RunJobGraphDependencies } from "./runJobGraphTypes.js";
import type { createRunJobGraphTasks } from "./graphTasks.js";

let sharedTrendCache: InMemoryV6TrendCache | null = null;
let sharedTrendCacheTtlSeconds: number | null = null;

function getTrendCache(ttlSeconds: number): InMemoryV6TrendCache {
  if (!sharedTrendCache || sharedTrendCacheTtlSeconds !== ttlSeconds) {
    sharedTrendCache = new InMemoryV6TrendCache(ttlSeconds);
    sharedTrendCacheTtlSeconds = ttlSeconds;
  }
  return sharedTrendCache;
}

function shouldResearchTrends(
  dependencies: RunJobGraphDependencies,
  state: RunJobGraphStateType,
): boolean {
  if (dependencies.env.trendResearchMode === "off") return false;
  if (!state.hydrated?.request.options?.trendResearch) return false;
  return Boolean(dependencies.env.googleApiKey);
}

function createDefaultTrendResearcher(
  dependencies: RunJobGraphDependencies,
): V6TrendResearcher | null {
  const apiKey = dependencies.env.googleApiKey;
  if (!apiKey) return null;
  return createGeminiV6TrendResearcher({
    apiKey,
    model: dependencies.env.trendResearchModel,
  });
}

export function registerV6TrendResearchNode(
  graph: StateGraph<typeof RunJobGraphState>,
  dependencies: RunJobGraphDependencies,
  tasks: ReturnType<typeof createRunJobGraphTasks>,
) {
  const { appendEventTask, persistArtifactTask } = tasks;

  return graph.addNode("maybe_research_visual_trends", async (state) => {
    if (!state.hydrated) {
      throw new Error("maybe_research_visual_trends requires hydrated input");
    }

    if (!shouldResearchTrends(dependencies, state)) {
      return {};
    }

    const researcher =
      dependencies.v6TrendResearcher ??
      createDefaultTrendResearcher(dependencies);
    if (!researcher) {
      return {};
    }

    const request = state.hydrated.request;
    const now = new Date().toISOString();
    const cacheKey = buildV6TrendCacheKey({
      userPrompt: request.userInput.prompt,
      canvasWidth: request.editorContext.canvasWidth,
      canvasHeight: request.editorContext.canvasHeight,
      locale: request.userInput.locale,
      timezone: request.userInput.timezone,
      now,
    });
    const cache = getTrendCache(dependencies.env.trendCacheTtlSeconds);
    const cached = cache.get(cacheKey);

    let trendBrief: V6TrendBrief;
    let cacheStatus: "hit" | "miss" = "hit";
    try {
      if (cached) {
        trendBrief = cached;
      } else {
        cacheStatus = "miss";
        trendBrief = await researcher.research({
          runId: state.job.runId,
          traceId: state.job.traceId,
          userPrompt: request.userInput.prompt,
          canvasWidth: request.editorContext.canvasWidth,
          canvasHeight: request.editorContext.canvasHeight,
          locale: request.userInput.locale,
          timezone: request.userInput.timezone,
          now,
        });
        cache.set(cacheKey, trendBrief);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown trend research error";
      await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "log",
          level: "warn",
          message: `[v6-trend] optional trend research failed; continuing without trend context (${message.slice(0, 240)})`,
        },
      });
      return {};
    }

    const v6TrendBriefRef = await persistArtifactTask(
      `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/v6-trend-brief.json`,
      trendBrief,
      {
        artifactKind: "v6-trend-brief",
        runId: state.job.runId,
        traceId: state.job.traceId,
        attemptSeq: String(state.job.attemptSeq),
        mode: dependencies.env.trendResearchMode,
        cacheStatus,
      },
    );

    await appendEventTask(state.job.runId, {
      traceId: state.job.traceId,
      attempt: state.job.attemptSeq,
      queueJobId: state.job.queueJobId,
      event: {
        type: "log",
        level: "info",
        message:
          `[v6-trend] mode=${dependencies.env.trendResearchMode} cache=${cacheStatus} ` +
          `searches=${trendBrief.searchQueries.length} cites=${trendBrief.citations.length} ` +
          `latency=${trendBrief.latencyMs}ms`,
      },
    });

    return {
      v6TrendBrief: trendBrief,
      v6TrendBriefRef,
    };
  });
}
