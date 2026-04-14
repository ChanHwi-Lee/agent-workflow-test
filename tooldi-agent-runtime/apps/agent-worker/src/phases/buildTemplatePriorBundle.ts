import { HumanMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { AgentWorkerEnv } from "@tooldi/agent-config";
import { createRequestId } from "@tooldi/agent-domain";
import type { Logger } from "@tooldi/agent-observability";
import type { TooldiCatalogSourceClient } from "@tooldi/tool-adapters";
import { z } from "zod";

import type {
  HydratedPlanningInput,
  NormalizedIntent,
  TemplatePriorBundle,
  TemplatePriorCandidate,
  TemplatePriorScaffold,
} from "../types.js";
import {
  deriveCanvasPreset,
  deriveWorkflowVariant,
} from "./planningContext.js";

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
      const content: Array<{ type: "text" | "image_url"; text?: string; image_url?: string }> = [
        {
          type: "text",
          text:
            "You are reranking Korean social-ad template priors for Tooldi. " +
            "Pick the single best scaffold for a 1200x628 editable banner. " +
            "Prefer generic ad-safe seasonal sale composition. " +
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

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const contentType = response.headers.get("content-type") ?? "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function buildTemplatePriorBundle(
  input: HydratedPlanningInput,
  intent: NormalizedIntent,
  sourceClient: TooldiCatalogSourceClient,
  rerank?: TemplatePriorReranker | null,
): Promise<TemplatePriorBundle | null> {
  const workflowVariant = deriveWorkflowVariant(input);
  if (
    workflowVariant !== "retrieval_prior_v1" &&
    workflowVariant !== "retrieval_prior_v2" &&
    workflowVariant !== "retrieval_prior_v2_reset"
  ) {
    return null;
  }

  const queryPlan = buildCanonicalTemplateQueryPlan(intent, input.request.userInput.prompt);
  const query = {
    keyword: queryPlan[0]?.keyword ?? input.request.userInput.prompt.trim(),
    canvas: deriveTemplateCanvasFilter(
      deriveCanvasPreset(
        input.request.editorContext.canvasWidth,
        input.request.editorContext.canvasHeight,
      ),
    ),
    requestedTopK: 3,
  } as const;

  const searchResults = await Promise.all(
    queryPlan.map(async (plannedQuery) => ({
      plannedQuery,
      result: await sourceClient.searchTemplateAssets({
        keyword: plannedQuery.keyword,
        canvas: query.canvas,
        page: 1,
        source: "search",
      }),
    })),
  );

  const merged = mergeTemplateSearchResults(searchResults);
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
    return {
      bundleId: createRequestId(),
      runId: intent.runId,
      traceId: intent.traceId,
      workflowVariant,
      query,
      queryPlan,
      usedFallbackToLegacy: true,
      fallbackReason: "No template prior candidate survived the strong filter.",
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
      })),
      summary:
        `No usable template prior survived strong filtering; ${workflowVariant} has no stable primary reference.`,
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

  const finalCandidates = fetchedCandidates
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
    })
    .filter((candidate) => candidate.keep)
    .sort((left, right) => right.score - left.score)
    .slice(0, query.requestedTopK);

  const selectedCandidate = finalCandidates[0] ?? null;

  return {
    bundleId: createRequestId(),
    runId: intent.runId,
    traceId: intent.traceId,
      workflowVariant,
    query,
    queryPlan,
    usedFallbackToLegacy: selectedCandidate === null,
    fallbackReason:
      selectedCandidate === null
        ? "No template prior remained after Gemini rerank."
        : null,
    selectedTemplateCode: selectedCandidate?.templateCode ?? null,
    selectedTemplateTitle: selectedCandidate?.title ?? null,
    selectedScaffold: selectedCandidate?.scaffold ?? null,
    candidates: finalCandidates.length > 0 ? finalCandidates : fetchedCandidates,
    summary:
      selectedCandidate !== null
        ? `Selected ${selectedCandidate.templateCode} as the template scaffold prior after strong filter and rerank.`
        : `No searchable template prior remained after rerank; ${workflowVariant} has no stable primary reference.`,
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
    { label: "season_offer", keyword: seasonKeyword && offerKeyword ? `${seasonKeyword} ${offerKeyword}` : null },
    { label: "offer_surface", keyword: `${offerKeyword} 광고` },
    { label: "domain_offer", keyword: domainKeyword ? `${domainKeyword} ${offerKeyword}` : null },
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
    .slice(0, 4);
}

function deriveDomainKeyword(intent: NormalizedIntent): string | null {
  if (intent.domain === "fashion_retail") {
    return "쇼핑";
  }
  if (intent.domain === "cafe") {
    return "카페";
  }
  if (intent.domain === "restaurant") {
    return "식당";
  }
  return null;
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
  const softPenalty = topicDrift.severity === "soft" ? 0.2 : 0;

  const score = clamp01(categoryFit + aspectFit + queryCoverage + keywordFit + seasonBonus - softPenalty);

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
