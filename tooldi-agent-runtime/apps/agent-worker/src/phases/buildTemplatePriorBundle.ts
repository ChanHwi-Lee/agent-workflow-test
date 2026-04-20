import { HumanMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { AgentWorkerEnv } from "@tooldi/agent-config";
import { createRequestId } from "@tooldi/agent-domain";
import type { Logger } from "@tooldi/agent-observability";
import {
  TooldiCatalogSourceError,
  type TooldiCatalogSourceClient,
} from "@tooldi/tool-adapters";
import { z } from "zod";

import type {
  HydratedPlanningInput,
  NormalizedIntent,
  TemplatePriorBundle,
  TemplatePriorCandidate,
  TemplatePriorDiagnostics,
  TemplatePriorQueryDiagnostic,
  TemplatePriorScaffold,
  VectorRecallDiagnostics,
} from "../types.js";
import {
  deriveCanvasPreset,
} from "./planningContext.js";
import {
  CANVAS_OUT_OF_R1_SCOPE,
  buildVectorRecallDiagnostics,
  mergeRecallSources,
  searchTemplatePriorVector,
  type LegacyMergedCandidate,
  type MergedRecallCandidate,
  type TemplateEmbeddingClient,
  type VectorRecallResult,
} from "./templatePriorVectorRecall.js";

const VECTOR_RECALL_TOP_K = 100;
const VECTOR_RECALL_TIMEOUT_MS = 20000;
const MERGED_POOL_CAP = 120;
const REF_FIRST_RERANK_RELEVANCE_MIN = 0.5;

/**
 * canvasPreset → size_serial mapping for R1 vector recall (§3.4.1).
 * R1 ingestion only indexed size_serial=7 (소셜미디어 광고 1200×628, 551 templates).
 * Any other canvas preset must skip vector recall entirely — see
 * docs/handoff/2026-04-17-agw-retrieval-embedding-v1-impl-handoff.md §2.1/§3.4.1.
 */
function deriveVectorSizeSerial(
  canvasPreset: NormalizedIntent["canvasPreset"],
): number | null {
  if (canvasPreset === "wide_1200x628") {
    return 7;
  }
  return null;
}

const TARGET_RATIO = 1200 / 628;
const ALLOWED_CATEGORY_NAMES = new Set(["소셜미디어 광고", "웹 배너 가로"]);
const STRONGLY_BLOCKED_TOPIC_GROUPS = [
  ["렌트", "렌트카", "자동차", "차량"],
  ["캠핑", "등산", "아웃도어"],
  ["졸업", "학교", "유치원", "어린이집", "학원"],
  ["크리스마스", "성탄", "설날", "추석", "명절", "새해", "발렌타인", "화이트데이"],
  ["병원", "예방접종", "의료", "마스크"],
] as const;
const SOFT_SPECIFIC_TOPIC_GROUPS = [
  ["화장품", "코스메틱", "뷰티", "스킨케어"],
  ["홈데코", "인테리어", "집꾸미기"],
  ["선물", "답례품", "기프트"],
] as const;

const TemplatePriorRerankSchema = z.object({
  selectedTemplateCode: z.string().nullable(),
  summary: z.string().min(1),
  candidates: z.array(
    z.object({
      templateCode: z.string(),
      relevanceScore: z.number().min(0).max(1),
      keep: z.boolean(),
      reason: z.string().min(1),
    }),
  ),
});

type TemplatePriorRerankResult = z.infer<typeof TemplatePriorRerankSchema>;
type TemplatePriorReranker = (
  input: {
    prompt: string;
    intent: NormalizedIntent;
    candidates: Array<{
      templateCode: string;
      title: string;
      categoryName: string | null;
      width: number | null;
      height: number | null;
      keywordTokens: string[];
      thumbnailUrl: string | null;
    }>;
  },
) => Promise<TemplatePriorRerankResult | null>;

export function createGeminiTemplatePriorReranker(
  env: Pick<
    AgentWorkerEnv,
    "templatePlannerProvider" | "templatePlannerModel" | "templatePlannerTemperature"
  >,
  logger: Logger,
): TemplatePriorReranker | null {
  if (env.templatePlannerProvider !== "google" || !env.templatePlannerModel) {
    return null;
  }

  const model = new ChatGoogleGenerativeAI({
    model: env.templatePlannerModel,
    temperature: 0,
  });
  const structured = model.withStructuredOutput(TemplatePriorRerankSchema);

  return async ({ prompt, intent, candidates }) => {
    if (candidates.length <= 1) {
      return null;
    }

    try {
      const domainPreference =
        intent.domain !== "general_marketing"
          ? `Prefer templates whose visual theme and keywords match the ${intent.domain} domain. `
          : "Prefer clean, broadly applicable seasonal sale composition. ";

      const content: Array<{ type: "text" | "image_url"; text?: string; image_url?: string }> = [
        {
          type: "text",
          text:
            "You are reranking Korean social-ad template priors for Tooldi. " +
            "Pick the single best scaffold for a 1200x628 editable banner. " +
            domainPreference +
            "Penalize wrong topic drift and seasonal mismatch. " +
            "Use only the candidate metadata and thumbnails. " +
            `Prompt=${prompt}\n` +
            `Intent domain=${intent.domain}, campaignGoal=${intent.campaignGoal}, layoutIntent=${intent.layoutIntent}, seasonality=${intent.facets.seasonality ?? "none"}, subjectBinding=${intent.subjectBinding}.`,
        },
      ];

      for (const [index, candidate] of candidates.entries()) {
        content.push({
          type: "text",
          text:
            `Candidate ${index + 1}\n` +
            `templateCode=${candidate.templateCode}\n` +
            `title=${candidate.title}\n` +
            `categoryName=${candidate.categoryName ?? "unknown"}\n` +
            `size=${candidate.width ?? "?"}x${candidate.height ?? "?"}\n` +
            `keywords=${candidate.keywordTokens.join(", ") || "none"}`,
        });
        if (candidate.thumbnailUrl) {
          const imageUrl = await toDataUrl(candidate.thumbnailUrl);
          if (imageUrl) {
          content.push({
            type: "image_url",
            image_url: imageUrl,
          });
          }
        }
      }

      return await structured.invoke([
        new HumanMessage({
          content,
        }),
      ]);
    } catch (error) {
      logger.warn("Template prior Gemini rerank failed; falling back to deterministic score", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  };
}

/**
 * Tooldi 템플릿 썸네일은 S3 에서 (1) Content-Type 이 `application/octet-stream`
 * 으로 내려오거나 (2) URL 확장자(.png)와 실제 바이트 포맷(JPEG)이 일치하지
 * 않는 경우가 있다. Gemini 는 MIME 과 바이트가 불일치하면 전체 호출을
 * `400 Unsupported MIME type` 으로 거부하므로, magic byte 로 실제 포맷을
 * 판독해 data URL MIME 을 그 결과 기준으로 지정한다.
 */
function sniffImageMime(buffer: Buffer): string | null {
  if (buffer.length < 12) {
    return null;
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (buffer.toString("ascii", 0, 3) === "GIF") {
    return "image/gif";
  }
  return null;
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const sniffed = sniffImageMime(buffer);
    const headerType = response.headers.get("content-type");
    const mime =
      sniffed ??
      (headerType && headerType.startsWith("image/") ? headerType : null);
    if (!mime) {
      return null;
    }
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function buildTemplatePriorBundle(
  input: HydratedPlanningInput,
  intent: NormalizedIntent,
  sourceClient: TooldiCatalogSourceClient,
  rerank?: TemplatePriorReranker | null,
  embeddingClient?: TemplateEmbeddingClient | null,
): Promise<TemplatePriorBundle | null> {
  const workflowVariant = "object_native_v1";
  const queryPlan = buildCanonicalTemplateQueryPlan(intent, input.request.userInput.prompt);
  const canvasPreset = deriveCanvasPreset(
    input.request.editorContext.canvasWidth,
    input.request.editorContext.canvasHeight,
  );
  const query = {
    keyword: queryPlan[0]?.keyword ?? input.request.userInput.prompt.trim(),
    canvas: deriveTemplateCanvasFilter(canvasPreset),
    requestedTopK: 3,
  } as const;

  // (§3.4.1) R1 vector recall is scoped to 1200×628 (size_serial=7).
  // Other canvas presets deliberately skip vector recall; this is a scope
  // limit, not an error.
  const vectorSizeSerial = deriveVectorSizeSerial(canvasPreset);
  const vectorRecallStart = Date.now();
  let vectorRecallPromise: Promise<VectorRecallResult> | null = null;
  let vectorRecallDiagnostics: VectorRecallDiagnostics;
  if (embeddingClient && vectorSizeSerial !== null) {
    vectorRecallPromise = searchTemplatePriorVector(embeddingClient, {
      intent,
      prompt: input.request.userInput.prompt,
      canvasFilter: query.canvas,
      sizeSerial: vectorSizeSerial,
      topK: VECTOR_RECALL_TOP_K,
      timeoutMs: VECTOR_RECALL_TIMEOUT_MS,
    });
    vectorRecallDiagnostics = {
      status: "executed",
      topK: VECTOR_RECALL_TOP_K,
      candidateCount: 0,
      latencyMs: 0,
      error: null,
    };
  } else if (vectorSizeSerial === null) {
    vectorRecallDiagnostics = CANVAS_OUT_OF_R1_SCOPE;
  } else {
    vectorRecallDiagnostics = CANVAS_OUT_OF_R1_SCOPE;
  }

  const [searchResults, vectorRecallResult] = await Promise.all([
    Promise.all(
      queryPlan.map(async (plannedQuery) => ({
        plannedQuery,
        ...(await searchTemplatePriorQuery(
          sourceClient,
          plannedQuery,
          query.canvas,
        )),
      })),
    ),
    vectorRecallPromise ?? Promise.resolve<VectorRecallResult | null>(null),
  ]);

  if (vectorRecallResult) {
    vectorRecallDiagnostics = buildVectorRecallDiagnostics(vectorRecallResult, {
      topK: VECTOR_RECALL_TOP_K,
      startedAt: vectorRecallStart,
    });
  }

  const successfulSearchResults = searchResults.filter(
    (entry): entry is TemplatePriorSearchSuccess => entry.result !== null,
  );
  const legacyMerged: LegacyMergedCandidate[] = mergeTemplateSearchResults(successfulSearchResults);
  const merged: MergedRecallCandidate[] = mergeRecallSources({
    legacyCandidates: legacyMerged,
    vectorCandidates: vectorRecallResult?.candidates ?? [],
    cap: MERGED_POOL_CAP,
  });
  const queryDiagnostics = buildTemplatePriorQueryDiagnostics(searchResults);
  const scoredCandidates = merged
    .map((candidate) => {
      const evaluation = evaluateTemplateCandidate(
        candidate,
        intent,
        input.request.userInput.prompt,
      );
      return {
        ...candidate,
        keep: evaluation.keep,
        keepReason: evaluation.keepReason,
        rejectReason: evaluation.rejectReason,
        deterministicScore: evaluation.score,
      };
    })
    .filter((candidate) => candidate.keep)
    .sort((left, right) => right.deterministicScore - left.deterministicScore);

  if (scoredCandidates.length === 0) {
    const sourceFailureCount = queryDiagnostics.filter(
      (entry) => entry.status === "error",
    ).length;
    const fallbackReason =
      sourceFailureCount > 0
        ? `Template prior stayed unavailable because ${sourceFailureCount}/${queryDiagnostics.length} template search queries failed at the source contract boundary.`
        : "No template prior candidate survived the strong filter.";
    return {
      bundleId: createRequestId(),
      runId: intent.runId,
      traceId: intent.traceId,
      workflowVariant,
      query,
      queryPlan,
      usedFallbackToLegacy: true,
      fallbackReason,
      selectedTemplateCode: null,
      selectedTemplateTitle: null,
      selectedScaffold: null,
      candidates: merged.map((candidate) => ({
        rank: candidate.rank,
        score: 0,
        deterministicScore: 0,
        geminiScore: null,
        keep: false,
        keepReason: "rejected",
        rejectReason: "No template prior candidate survived the strong filter.",
        matchedQueryLabels: candidate.matchedQueryLabels,
        templateAssetId: candidate.templateAssetId,
        templateSerial: candidate.templateSerial,
        templateCode: candidate.templateCode,
        title: candidate.title,
        categoryName: candidate.categoryName,
        width: candidate.width,
        height: candidate.height,
        pages: candidate.pages,
        keywordTokens: candidate.keywordTokens,
        thumbnailUrl: candidate.thumbnailUrl,
        traceId: candidate.traceId,
        fetchedDocument: null,
        scaffold: null,
        recallSources: candidate.recallSources,
      })),
      diagnostics: buildTemplatePriorDiagnostics({
        queryDiagnostics,
        mergedCandidateCount: merged.length,
        keptCandidateCount: 0,
        rerankedCandidateCount: 0,
        vectorRecallDiagnostics,
      }),
      summary:
        sourceFailureCount > 0
          ? `Template prior degraded to legacy because source-contract errors blocked template search breadth; ${workflowVariant} has no stable primary reference.`
          : `No usable template prior survived strong filtering; ${workflowVariant} has no stable primary reference.`,
    };
  }

  const fetchedCandidates = await Promise.all(
    scoredCandidates.slice(0, 5).map(async (candidate, index) => {
      let fetchedDocument: TemplatePriorCandidate["fetchedDocument"] = null;
      let scaffold: TemplatePriorCandidate["scaffold"] = null;

      try {
        fetchedDocument = await sourceClient.getTemplateDocument({
          templateCode: candidate.templateCode,
          isWorking: false,
        });
        scaffold = buildTemplateScaffold(
          candidate.templateSerial,
          candidate.templateCode,
          candidate.title,
          fetchedDocument,
        );
      } catch {
        fetchedDocument = null;
        scaffold = null;
      }

      return {
        rank: index + 1,
        score: candidate.deterministicScore,
        deterministicScore:
          candidate.deterministicScore +
          scoreScaffoldQuality(scaffold, intent.layoutIntent),
        geminiScore: null,
        keep: true,
        keepReason: candidate.keepReason,
        rejectReason: null,
        matchedQueryLabels: candidate.matchedQueryLabels,
        templateAssetId: candidate.templateAssetId,
        templateSerial: candidate.templateSerial,
        templateCode: candidate.templateCode,
        title: candidate.title,
        categoryName: candidate.categoryName,
        width: candidate.width,
        height: candidate.height,
        pages: candidate.pages,
        keywordTokens: candidate.keywordTokens,
        thumbnailUrl: candidate.thumbnailUrl,
        traceId: candidate.traceId,
        fetchedDocument,
        scaffold,
        recallSources: candidate.recallSources,
      } satisfies TemplatePriorCandidate;
    }),
  );

  const rerankResult = rerank
    ? await rerank({
        prompt: input.request.userInput.prompt,
        intent,
        candidates: fetchedCandidates.map((candidate) => ({
          templateCode: candidate.templateCode,
          title: candidate.title,
          categoryName: candidate.categoryName,
          width: candidate.width,
          height: candidate.height,
          keywordTokens: candidate.keywordTokens,
          thumbnailUrl: candidate.thumbnailUrl,
        })),
      })
    : null;

  const rerankMap = new Map(
    (rerankResult?.candidates ?? []).map((candidate) => [
      candidate.templateCode,
      candidate,
    ] as const),
  );

  const RERANK_MIN_BREADTH = 2;
  const scoredFinalCandidates = fetchedCandidates
    .map((candidate) => {
      const reranked = rerankMap.get(candidate.templateCode);
      const geminiScore = reranked?.relevanceScore ?? null;
      const keep = reranked ? reranked.keep : true;
      return {
        ...candidate,
        geminiScore,
        keep,
        keepReason: reranked?.reason ?? candidate.keepReason,
        rejectReason: keep ? null : reranked?.reason ?? "Gemini rerank rejected the candidate.",
        score:
          candidate.deterministicScore * 0.65 +
          (geminiScore ?? candidate.deterministicScore) * 0.35,
      };
    });

  const keptCandidates = scoredFinalCandidates.filter((c) => c.keep);
  const finalCandidates = (keptCandidates.length >= RERANK_MIN_BREADTH
    ? keptCandidates
    : scoredFinalCandidates.map((c) => ({
        ...c,
        keep: true,
        rejectReason: null,
        keepReason: c.keep ? c.keepReason : "breadth floor: rerank collapse recovered",
      }))
  )
    .sort((left, right) => right.score - left.score)
    .slice(0, query.requestedTopK);

  const selectedCandidate = finalCandidates[0] ?? null;

  // §3.5 reference-first gate — contract change to SSOT §6.4.
  // Today's reference-first gate implicitly assumes "if legacy recall
  // returned survivors that passed rerank, the reference is passable."
  // With vector recall rescuing collapsed legacy pools, that assumption
  // no longer holds: a vector-only survivor with weak Gemini relevance
  // can pass downstream even though no legacy provenance confirmed it.
  // The gate below re-asserts reference-first in that new world by
  // firing the existing reference-first failure/warning surface
  // (`usedFallbackToLegacy` + `fallbackReason`) with a new reason
  // string. No new error code, no graph-edge change, no buildFailureDrafts
  // change.
  const rerankedKeptAllVectorOnly =
    keptCandidates.length > 0 &&
    keptCandidates.length < RERANK_MIN_BREADTH &&
    keptCandidates.every((candidate) => {
      const sources = candidate.recallSources ?? [];
      return sources.length === 1 && sources[0] === "vector_image";
    }) &&
    keptCandidates.every(
      (candidate) =>
        (candidate.geminiScore ?? 0) < REF_FIRST_RERANK_RELEVANCE_MIN,
    );

  const refFirstGateFallbackReason = rerankedKeptAllVectorOnly
    ? `reference-first gate: post-rerank breadth ${keptCandidates.length} < ${RERANK_MIN_BREADTH}; all survivors vector-only with relevance < ${REF_FIRST_RERANK_RELEVANCE_MIN}`
    : null;

  const usedFallbackToLegacy = selectedCandidate === null || rerankedKeptAllVectorOnly;
  const fallbackReason =
    selectedCandidate === null
      ? "No template prior remained after Gemini rerank."
      : refFirstGateFallbackReason;

  return {
    bundleId: createRequestId(),
    runId: intent.runId,
    traceId: intent.traceId,
    workflowVariant,
    query,
    queryPlan,
    usedFallbackToLegacy,
    fallbackReason,
    selectedTemplateCode: selectedCandidate?.templateCode ?? null,
    selectedTemplateTitle: selectedCandidate?.title ?? null,
    selectedScaffold: selectedCandidate?.scaffold ?? null,
    candidates: finalCandidates.length > 0 ? finalCandidates : fetchedCandidates,
    diagnostics: buildTemplatePriorDiagnostics({
      queryDiagnostics,
      mergedCandidateCount: merged.length,
      keptCandidateCount: scoredCandidates.length,
      rerankedCandidateCount:
        finalCandidates.length > 0
          ? finalCandidates.length
          : fetchedCandidates.length,
      vectorRecallDiagnostics,
    }),
    summary:
      selectedCandidate !== null
        ? rerankedKeptAllVectorOnly
          ? `Selected ${selectedCandidate.templateCode} but reference-first gate flagged vector-only low-relevance survivors (see fallbackReason).`
          : `Selected ${selectedCandidate.templateCode} as the template scaffold prior after strong filter and rerank.`
        : `No searchable template prior remained after rerank; ${workflowVariant} has no stable primary reference.`,
  };
}

interface TemplatePriorSearchSuccess {
  plannedQuery: { label: string; keyword: string };
  result: Awaited<ReturnType<TooldiCatalogSourceClient["searchTemplateAssets"]>>;
  error: null;
}

interface TemplatePriorSearchFailure {
  plannedQuery: { label: string; keyword: string };
  result: null;
  error: TooldiCatalogSourceError;
}

async function searchTemplatePriorQuery(
  sourceClient: TooldiCatalogSourceClient,
  plannedQuery: { label: string; keyword: string },
  canvas: "horizontal" | "vertical" | "square" | "",
): Promise<
  | Pick<TemplatePriorSearchSuccess, "result" | "error">
  | Pick<TemplatePriorSearchFailure, "result" | "error">
> {
  try {
    return {
      result: await sourceClient.searchTemplateAssets({
        keyword: plannedQuery.keyword,
        canvas,
        page: 1,
        source: "search",
      }),
      error: null,
    };
  } catch (error) {
    return {
      result: null,
      error: normalizeTemplatePriorSourceError(error, plannedQuery),
    };
  }
}

function normalizeTemplatePriorSourceError(
  error: unknown,
  plannedQuery: { label: string; keyword: string },
): TooldiCatalogSourceError {
  if (error instanceof TooldiCatalogSourceError) {
    return error;
  }
  return new TooldiCatalogSourceError({
    code: "request_failed",
    message:
      `Template prior query '${plannedQuery.label}' failed before a Tooldi catalog response was classified.`,
    url: "unknown",
    cause: error,
  });
}

function buildTemplatePriorQueryDiagnostics(
  searchResults: Array<TemplatePriorSearchSuccess | TemplatePriorSearchFailure>,
): TemplatePriorQueryDiagnostic[] {
  return searchResults.map(({ plannedQuery, result, error }) => ({
    label: plannedQuery.label,
    keyword: plannedQuery.keyword,
    page: 1,
    status: result ? "ok" : "error",
    retrievedAssetCount: result?.assets.length ?? 0,
    traceId: result?.traceId ?? null,
    errorCode: error?.code ?? null,
    errorMessage: error?.message ?? null,
    errorUrl: error?.url ?? null,
    errorStatus: error?.status ?? null,
    responsePreview: error?.responsePreview ?? null,
  }));
}

function buildTemplatePriorDiagnostics(input: {
  queryDiagnostics: TemplatePriorQueryDiagnostic[];
  mergedCandidateCount: number;
  keptCandidateCount: number;
  rerankedCandidateCount: number;
  vectorRecallDiagnostics?: VectorRecallDiagnostics;
}): TemplatePriorDiagnostics {
  return {
    totalQueryCount: input.queryDiagnostics.length,
    successfulQueryCount: input.queryDiagnostics.filter(
      (entry) => entry.status === "ok",
    ).length,
    failedQueryCount: input.queryDiagnostics.filter(
      (entry) => entry.status === "error",
    ).length,
    mergedCandidateCount: input.mergedCandidateCount,
    keptCandidateCount: input.keptCandidateCount,
    rerankedCandidateCount: input.rerankedCandidateCount,
    queryDiagnostics: input.queryDiagnostics,
    ...(input.vectorRecallDiagnostics
      ? { vectorRecallDiagnostics: input.vectorRecallDiagnostics }
      : {}),
  };
}

function buildCanonicalTemplateQueryPlan(
  intent: NormalizedIntent,
  prompt: string,
): Array<{ label: string; keyword: string }> {
  const seasonKeyword = intent.facets.seasonality === "spring" ? "봄" : null;
  const offerKeyword =
    intent.offerIntent === "sale" || intent.campaignGoal === "sale_conversion"
      ? "세일"
      : intent.offerIntent === "launch"
        ? "신상품"
        : "프로모션";
  const domainKeyword = deriveDomainKeyword(intent);
  const promptKeyword = prompt.trim();

  const planned = [
    { label: "season_primary", keyword: seasonKeyword },
    { label: "offer_primary", keyword: offerKeyword },
    { label: "domain_primary", keyword: domainKeyword },
    { label: "domain_offer", keyword: domainKeyword ? `${domainKeyword} ${offerKeyword}` : null },
    { label: "season_offer", keyword: seasonKeyword && offerKeyword ? `${seasonKeyword} ${offerKeyword}` : null },
    { label: "offer_surface", keyword: `${offerKeyword} 광고` },
    { label: "prompt_fallback", keyword: promptKeyword.length > 0 ? promptKeyword : null },
  ];

  const seen = new Set<string>();
  return planned
    .filter((entry): entry is { label: string; keyword: string } => typeof entry.keyword === "string" && entry.keyword.trim().length > 0)
    .filter((entry) => {
      const key = entry.keyword.trim();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

/**
 * 도메인별 템플릿 검색 키워드 — 실제 검색 API에서 horizontal 1200x628 결과가
 * 존재하는 키워드여야 한다. "식당"은 DB에 존재하나 canvas=horizontal 필터에서
 * 0건이므로 "음식"을 사용한다.
 *
 * ⚠️ 고도화 지점: deriveDomainSignalTokens와 동일하게 DB 기반 자동 도출로 전환 필요.
 */
function deriveDomainKeyword(intent: NormalizedIntent): string | null {
  if (intent.domain === "fashion_retail") {
    return "쇼핑";
  }
  if (intent.domain === "cafe") {
    return "카페";
  }
  if (intent.domain === "restaurant") {
    return "음식";
  }
  return null;
}

/**
 * 도메인별 검색 신호 토큰 — deterministic scoring에서 domainBonus를 부여할 때 사용.
 *
 * ⚠️ 고도화 지점 (hardcoded → DB-driven 전환 필요)
 * 현재는 3개 도메인 × 5-6개 토큰의 정적 매핑이다.
 * 도메인이 추가되거나 토큰 리스트가 프롬프트 실패 때마다 한 줄씩 늘어나면
 * v2의 threshold micro-tuning 패턴과 동일한 문제가 발생한다.
 *
 * 향후 개선 방향:
 * - contents_theme 또는 template_upload.keyword의 실제 분포에서 도메인 토큰을 자동 도출
 * - 별도 domain_signal_tokens DB 테이블 또는 contents_theme 기반 매핑으로 전환
 * - 도메인별 토큰 가중치 차등 적용은 금지 (일률 domainBonus 유지)
 */
function deriveDomainSignalTokens(intent: NormalizedIntent): string[] {
  if (intent.domain === "restaurant") {
    return ["식당", "음식", "맛집", "메뉴", "요리", "레스토랑"];
  }
  if (intent.domain === "cafe") {
    return ["카페", "커피", "음료", "디저트", "브런치"];
  }
  if (intent.domain === "fashion_retail") {
    return ["쇼핑", "패션", "의류", "옷", "스타일"];
  }
  return [];
}

function deriveTemplateCanvasFilter(
  canvasPreset: NormalizedIntent["canvasPreset"],
): "horizontal" | "vertical" | "square" | "" {
  if (canvasPreset === "wide_1200x628") {
    return "horizontal";
  }
  if (canvasPreset === "square_1080") {
    return "square";
  }
  if (canvasPreset === "story_1080x1920") {
    return "vertical";
  }
  return "";
}

function mergeTemplateSearchResults(
  searchResults: Array<{
    plannedQuery: { label: string; keyword: string };
    result: Awaited<ReturnType<TooldiCatalogSourceClient["searchTemplateAssets"]>>;
  }>,
): Array<{
  rank: number;
  templateAssetId: string;
  templateSerial: string;
  templateCode: string;
  title: string;
  categoryName: string | null;
  width: number | null;
  height: number | null;
  pages: number;
  keywordTokens: string[];
  thumbnailUrl: string | null;
  traceId: string | null;
  matchedQueryLabels: string[];
}> {
  const map = new Map<string, ReturnType<typeof createMergedTemplateCandidate>>();

  searchResults.forEach(({ plannedQuery, result }) => {
    result.assets.forEach((asset, index) => {
      const existing = map.get(asset.code) ?? createMergedTemplateCandidate(asset, result.traceId);
      existing.rank = Math.min(existing.rank, index + 1);
      if (!existing.matchedQueryLabels.includes(plannedQuery.label)) {
        existing.matchedQueryLabels.push(plannedQuery.label);
      }
      map.set(asset.code, existing);
    });
  });

  return [...map.values()].sort((left, right) => left.rank - right.rank);
}

function createMergedTemplateCandidate(
  asset: Awaited<ReturnType<TooldiCatalogSourceClient["searchTemplateAssets"]>>["assets"][number],
  traceId: string | null,
) {
  return {
    rank: Number.MAX_SAFE_INTEGER,
    templateAssetId: asset.assetId,
    templateSerial: asset.serial,
    templateCode: asset.code,
    title: asset.title,
    categoryName: asset.categoryName,
    width: asset.width,
    height: asset.height,
    pages: asset.pages,
    keywordTokens: asset.keywordTokens,
    thumbnailUrl: asset.thumbnailUrl,
    traceId,
    matchedQueryLabels: [] as string[],
  };
}

function evaluateTemplateCandidate(
  candidate: ReturnType<typeof createMergedTemplateCandidate>,
  intent: NormalizedIntent,
  prompt: string,
): {
  keep: boolean;
  keepReason: string;
  rejectReason: string | null;
  score: number;
} {
  if (!ALLOWED_CATEGORY_NAMES.has(candidate.categoryName ?? "")) {
    return {
      keep: false,
      keepReason: "rejected",
      rejectReason: `category ${candidate.categoryName ?? "unknown"} is outside the ad/web-banner allowlist`,
      score: 0,
    };
  }

  if (candidate.pages !== 1) {
    return {
      keep: false,
      keepReason: "rejected",
      rejectReason: "only single-page templates are allowed in the first milestone",
      score: 0,
    };
  }

  const ratio = candidate.width && candidate.height ? candidate.width / candidate.height : null;
  if (ratio === null || ratio < 1.45 || ratio > 2.2) {
    return {
      keep: false,
      keepReason: "rejected",
      rejectReason: "template aspect ratio is outside the 1200x628-compatible window",
      score: 0,
    };
  }

  const topicDrift = detectTopicDrift(candidate, intent, prompt);
  if (topicDrift.severity === "hard") {
    return {
      keep: false,
      keepReason: "rejected",
      rejectReason: topicDrift.reason,
      score: 0,
    };
  }

  const titleTokens = normalizeSignalTokens(candidate.title);
  const keywordMatches = countTokenMatches(
    [...titleTokens, ...candidate.keywordTokens.flatMap(normalizeSignalTokens)],
    buildIntentKeywordSet(intent, prompt),
  );
  const seasonMatch = intent.facets.seasonality === "spring"
    ? hasAnyToken(candidate, ["봄", "spring", "스프링"])
    : false;
  const aspectFit = Math.max(0, 0.25 - Math.abs(ratio - TARGET_RATIO) * 0.25);
  const categoryFit = candidate.categoryName === "소셜미디어 광고" ? 0.35 : 0.28;
  const queryCoverage = Math.min(0.12, candidate.matchedQueryLabels.length * 0.03);
  const keywordFit = Math.min(0.18, keywordMatches * 0.04);
  const seasonBonus = seasonMatch ? 0.1 : 0;
  const domainSignalTokens = deriveDomainSignalTokens(intent);
  const domainMatch = domainSignalTokens.length > 0
    ? hasAnyToken(candidate, domainSignalTokens)
    : false;
  // ⚠️ domainBonus 값(0.15)은 모든 도메인에 일률 적용. 도메인별 차등은 v2 micro-tuning 패턴이므로 금지.
  const domainBonus = domainMatch ? 0.15 : 0;
  const softPenalty = topicDrift.severity === "soft" ? 0.2 : 0;

  const score = clamp01(categoryFit + aspectFit + queryCoverage + keywordFit + seasonBonus + domainBonus - softPenalty);

  return {
    keep: true,
    keepReason:
      topicDrift.severity === "soft"
        ? `kept with penalty: ${topicDrift.reason}`
        : "kept by strong ad/web-banner fit",
    rejectReason: null,
    score,
  };
}

function buildIntentKeywordSet(
  intent: NormalizedIntent,
  prompt: string,
): Set<string> {
  const values = [
    ...intent.searchKeywords,
    prompt,
    intent.goalSummary,
    intent.offerIntent === "sale" ? "세일" : null,
    intent.offerIntent === "sale" ? "할인" : null,
    intent.facets.seasonality === "spring" ? "봄" : null,
  ].filter((value): value is string => typeof value === "string");

  return new Set(values.flatMap(normalizeSignalTokens));
}

function detectTopicDrift(
  candidate: ReturnType<typeof createMergedTemplateCandidate>,
  intent: NormalizedIntent,
  prompt: string,
): {
  severity: "none" | "soft" | "hard";
  reason: string;
} {
  const promptTokens = new Set(normalizeSignalTokens(prompt));
  const candidateTokens = [
    ...normalizeSignalTokens(candidate.title),
    ...candidate.keywordTokens.flatMap(normalizeSignalTokens),
  ];

  const holidayConflict =
    intent.facets.seasonality === "spring" &&
    hasAnyToken(candidate, [
      "크리스마스",
      "설날",
      "추석",
      "새해",
      "연말",
      "겨울",
    ]) &&
    !["크리스마스", "설날", "추석", "새해", "연말", "겨울"].some((token) =>
      promptTokens.has(token),
    );
  if (holidayConflict) {
    return {
      severity: "hard",
      reason: "seasonal mismatch against spring intent",
    };
  }

  for (const group of STRONGLY_BLOCKED_TOPIC_GROUPS) {
    if (candidateTokens.some((token) => group.includes(token as never)) &&
      !group.some((token) => promptTokens.has(token))) {
      return {
        severity: "hard",
        reason: `strong topic drift: ${group[0]}`,
      };
    }
  }

  if (intent.domain === "general_marketing" && intent.subjectBinding === "subjectless") {
    for (const group of SOFT_SPECIFIC_TOPIC_GROUPS) {
      if (
        candidateTokens.some((token) => group.includes(token as never)) &&
        !group.some((token) => promptTokens.has(token))
      ) {
        return {
          severity: "soft",
          reason: `specific topical bias: ${group[0]}`,
        };
      }
    }
  }

  return {
    severity: "none",
    reason: "no topic drift detected",
  };
}

function countTokenMatches(candidateTokens: string[], intentTokens: Set<string>): number {
  return [...new Set(candidateTokens)].filter((token) => intentTokens.has(token)).length;
}

function hasAnyToken(
  candidate: ReturnType<typeof createMergedTemplateCandidate>,
  terms: string[],
): boolean {
  const candidateTokens = [
    ...normalizeSignalTokens(candidate.title),
    ...candidate.keywordTokens.flatMap(normalizeSignalTokens),
  ];
  return candidateTokens.some((token) => terms.includes(token));
}

function normalizeSignalTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function scoreScaffoldQuality(
  scaffold: TemplatePriorScaffold | null,
  layoutIntent: NormalizedIntent["layoutIntent"],
): number {
  if (!scaffold) {
    return 0;
  }

  let score = 0;
  if (scaffold.textObjectCount >= 2) {
    score += 0.04;
  }
  if (scaffold.visualObjectCount >= 1) {
    score += 0.04;
  }
  if (layoutIntent === "hero_focused" && scaffold.layoutFamilyHint === "subject_hero") {
    score += 0.03;
  }
  if (layoutIntent === "badge_led" && scaffold.layoutFamilyHint === "promo_badge") {
    score += 0.03;
  }
  return score;
}

function buildTemplateScaffold(
  templateSerial: string,
  templateCode: string,
  title: string,
  document: NonNullable<TemplatePriorCandidate["fetchedDocument"]>,
): TemplatePriorScaffold | null {
  const firstPage = document.pages[0]?.parsed;
  if (!firstPage) {
    return null;
  }

  const canvasWidth =
    asNumber(firstPage.width) ?? asNumber(document.canvas.width) ?? null;
  const canvasHeight =
    asNumber(firstPage.height) ?? asNumber(document.canvas.height) ?? null;
  const objects = readObjectArray(firstPage.objects);
  const dominantObjectTypes = summarizeDominantObjectTypes(objects);
  const textObjects = objects.filter(isTextLikeObject);
  const visualObjects = objects.filter((object) => !isTextLikeObject(object));
  const copyAnchor = resolveCopyAnchor(textObjects, canvasWidth);
  const visualAnchor = resolveVisualAnchor(visualObjects, canvasWidth);
  const backgroundMode = resolveBackgroundMode(firstPage);
  const primaryVisualFamilyHint = resolvePrimaryVisualFamilyHint(
    firstPage,
    visualObjects,
  );
  const hasBadgeLikeLabel = detectBadgeLikeLabel(textObjects, canvasHeight);
  const layoutFamilyHint = resolveLayoutFamilyHint(
    copyAnchor,
    visualAnchor,
    primaryVisualFamilyHint,
    hasBadgeLikeLabel,
  );

  return {
    scaffoldId: createRequestId(),
    sourceTemplateCode: templateCode,
    sourceTemplateSerial: templateSerial,
    title,
    canvasWidth,
    canvasHeight,
    backgroundMode,
    textObjectCount: textObjects.length,
    visualObjectCount: visualObjects.length,
    groupObjectCount: objects.filter((object) => object.type === "group").length,
    dominantObjectTypes,
    copyAnchor,
    visualAnchor,
    layoutFamilyHint,
    layoutModeHint: mapLayoutModeHint(layoutFamilyHint, primaryVisualFamilyHint),
    primaryVisualFamilyHint,
    summary:
      `${layoutFamilyHint} scaffold with ${copyAnchor} copy anchor and ` +
      `${primaryVisualFamilyHint} primary visual bias from template ${templateCode}.`,
  };
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null,
  );
}

function summarizeDominantObjectTypes(
  objects: Array<Record<string, unknown>>,
): string[] {
  const counts = new Map<string, number>();
  for (const object of objects) {
    const type = typeof object.type === "string" ? object.type : "unknown";
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([type]) => type);
}

function isTextLikeObject(object: Record<string, unknown>): boolean {
  const type = typeof object.type === "string" ? object.type : "";
  if (["text", "textbox", "i-text"].includes(type)) {
    return true;
  }
  if (type !== "group" || !Array.isArray(object.objects)) {
    return false;
  }
  return object.objects.some(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).type === "string" &&
      ["text", "textbox", "i-text"].includes(
        (entry as Record<string, unknown>).type as string,
      ),
  );
}

function resolveCopyAnchor(
  textObjects: Array<Record<string, unknown>>,
  canvasWidth: number | null,
): "left" | "center" {
  if (!canvasWidth || textObjects.length === 0) {
    return "left";
  }
  const averageCenter =
    textObjects.reduce((sum, object) => sum + readCenterX(object), 0) /
    textObjects.length;
  return averageCenter < canvasWidth * 0.45 ? "left" : "center";
}

function resolveVisualAnchor(
  visualObjects: Array<Record<string, unknown>>,
  canvasWidth: number | null,
): "right" | "center" | "background" {
  if (!canvasWidth || visualObjects.length === 0) {
    return "background";
  }
  const averageCenter =
    visualObjects.reduce((sum, object) => sum + readCenterX(object), 0) /
    visualObjects.length;
  if (averageCenter > canvasWidth * 0.55) {
    return "right";
  }
  return "center";
}

function resolveBackgroundMode(
  page: Record<string, unknown>,
): TemplatePriorScaffold["backgroundMode"] {
  const backgroundType =
    typeof page.backgroundType === "string" ? page.backgroundType : null;
  if (backgroundType === "image" || backgroundType === "pattern") {
    return backgroundType;
  }
  if (backgroundType === "gradient") {
    return "gradient";
  }
  if (typeof page.backgroundColor === "string" && page.backgroundColor.length > 0) {
    return "color";
  }
  return "unknown";
}

function resolvePrimaryVisualFamilyHint(
  page: Record<string, unknown>,
  visualObjects: Array<Record<string, unknown>>,
): "graphic" | "photo" {
  if (page.backgroundType === "image") {
    const background = page.background;
    if (
      background &&
      typeof background === "object" &&
      typeof (background as Record<string, unknown>).src === "string"
    ) {
      return "photo";
    }
  }

  const imageLikeCount = visualObjects.filter((object) => {
    const type = typeof object.type === "string" ? object.type : "";
    return ["image", "photo", "bitmap"].includes(type);
  }).length;
  return imageLikeCount > 0 ? "photo" : "graphic";
}

function detectBadgeLikeLabel(
  textObjects: Array<Record<string, unknown>>,
  canvasHeight: number | null,
): boolean {
  if (!canvasHeight) {
    return false;
  }
  return textObjects.some((object) => {
    const top = asNumber(object.top) ?? asNumber(object.top_from_zero) ?? 0;
    const width = estimateWidth(object);
    return top < canvasHeight * 0.2 && width < 260;
  });
}

function resolveLayoutFamilyHint(
  copyAnchor: "left" | "center",
  visualAnchor: "right" | "center" | "background",
  primaryVisualFamilyHint: "graphic" | "photo",
  hasBadgeLikeLabel: boolean,
): TemplatePriorScaffold["layoutFamilyHint"] {
  if (hasBadgeLikeLabel) {
    return "promo_badge";
  }
  if (primaryVisualFamilyHint === "photo" && copyAnchor === "left" && visualAnchor === "right") {
    return "subject_hero";
  }
  if (copyAnchor === "center") {
    return "promo_center";
  }
  return "promo_split";
}

function mapLayoutModeHint(
  layoutFamilyHint: TemplatePriorScaffold["layoutFamilyHint"],
  primaryVisualFamilyHint: "graphic" | "photo",
): TemplatePriorScaffold["layoutModeHint"] {
  if (layoutFamilyHint === "subject_hero") {
    return primaryVisualFamilyHint === "photo"
      ? "copy_left_with_right_photo"
      : "left_copy_right_graphic";
  }
  if (layoutFamilyHint === "promo_badge") {
    return "badge_promo_stack";
  }
  if (layoutFamilyHint === "promo_center") {
    return "center_stack_promo";
  }
  if (layoutFamilyHint === "promo_frame") {
    return "framed_promo";
  }
  return primaryVisualFamilyHint === "photo"
    ? "copy_left_with_right_photo"
    : "left_copy_right_graphic";
}

function readCenterX(object: Record<string, unknown>): number {
  const left = asNumber(object.left) ?? asNumber(object.left_from_zero) ?? 0;
  return left + estimateWidth(object) / 2;
}

function estimateWidth(object: Record<string, unknown>): number {
  const width = asNumber(object.width) ?? 0;
  const scaleX = asNumber(object.scaleX) ?? 1;
  return width * scaleX;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
