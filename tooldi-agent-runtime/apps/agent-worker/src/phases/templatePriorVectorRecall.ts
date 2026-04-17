import type {
  NormalizedIntent,
  TemplatePriorCandidate,
  TemplateRecallSource,
  VectorRecallDiagnostics,
} from "../types.js";

export interface VectorRecallCandidate {
  rank: number;
  templateCode: string;
  templateSerial: string;
  innerSerial: string;
  title: string;
  categoryName: string | null;
  pages: number;
  keywordTokens: string[];
  sizeSerial: number | null;
  width: number | null;
  height: number | null;
  thumbnailUrl: string | null;
  relevanceScore: number;
}

export interface VectorRecallResult {
  source: "vector_image";
  queryText: string;
  candidates: VectorRecallCandidate[];
  error:
    | null
    | {
        code: "timeout" | "transport" | "invalid_response";
        message: string;
      };
}

export interface TemplateEmbeddingClient {
  queryTemplatePreview(input: {
    queryText: string;
    canvasFilter: "horizontal" | "vertical" | "square" | "";
    sizeSerial: number | null;
    topK: number;
    timeoutMs: number;
  }): Promise<VectorRecallResult>;
}

export interface HttpTemplateEmbeddingClientConfig {
  endpoint: string;
}

export function createHttpTemplateEmbeddingClient(
  config: HttpTemplateEmbeddingClientConfig,
): TemplateEmbeddingClient {
  const base = config.endpoint.replace(/\/+$/, "");
  return {
    async queryTemplatePreview({ queryText, sizeSerial, topK, timeoutMs }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${base}/search`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ queryText, sizeSerial, topK, timeoutMs }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          return {
            source: "vector_image",
            queryText,
            candidates: [],
            error: {
              code: "transport",
              message: `embedding service returned ${response.status}: ${text || "no body"}`,
            },
          } satisfies VectorRecallResult;
        }
        const body = (await response.json()) as Partial<VectorRecallResult>;
        if (body.source !== "vector_image" || !Array.isArray(body.candidates)) {
          return {
            source: "vector_image",
            queryText,
            candidates: [],
            error: {
              code: "invalid_response",
              message: "embedding service response missing required fields",
            },
          } satisfies VectorRecallResult;
        }
        return {
          source: "vector_image",
          queryText: body.queryText ?? queryText,
          candidates: body.candidates ?? [],
          error: body.error ?? null,
        } satisfies VectorRecallResult;
      } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";
        return {
          source: "vector_image",
          queryText,
          candidates: [],
          error: {
            code: isAbort ? "timeout" : "transport",
            message: error instanceof Error ? error.message : String(error),
          },
        } satisfies VectorRecallResult;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function deriveVectorQueryText(intent: NormalizedIntent, prompt: string): string {
  // R1 keeps the query text simple: the raw user prompt. Jina CLIP v2 handles
  // Korean natural language directly; layering intent-derived prefixes here
  // would repeat the deterministic scorer's bias and defeat the purpose of
  // vector recall's complementary inductive bias.
  return prompt.trim().length > 0 ? prompt.trim() : intent.goalSummary.trim();
}

export async function searchTemplatePriorVector(
  embeddingClient: TemplateEmbeddingClient,
  input: {
    intent: NormalizedIntent;
    prompt: string;
    canvasFilter: "horizontal" | "vertical" | "square" | "";
    sizeSerial: number | null;
    topK: number;
    timeoutMs: number;
  },
): Promise<VectorRecallResult> {
  const queryText = deriveVectorQueryText(input.intent, input.prompt);
  return embeddingClient.queryTemplatePreview({
    queryText,
    canvasFilter: input.canvasFilter,
    sizeSerial: input.sizeSerial,
    topK: input.topK,
    timeoutMs: input.timeoutMs,
  });
}

export type MergedRecallCandidate = Omit<
  TemplatePriorCandidate,
  "keep" | "keepReason" | "rejectReason" | "score" | "deterministicScore" | "geminiScore" | "fetchedDocument" | "scaffold"
> & {
  recallSources: TemplateRecallSource[];
};

export interface LegacyMergedCandidate {
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
}

export function mergeRecallSources(input: {
  legacyCandidates: LegacyMergedCandidate[];
  vectorCandidates: VectorRecallCandidate[];
  cap: number;
}): MergedRecallCandidate[] {
  const merged = new Map<string, MergedRecallCandidate & { orderKey: number }>();

  input.legacyCandidates.forEach((candidate, index) => {
    const templateCode = candidate.templateCode;
    if (!templateCode) return;
    const orderKey = index;
    merged.set(templateCode, {
      rank: candidate.rank,
      matchedQueryLabels: [...candidate.matchedQueryLabels],
      templateAssetId: candidate.templateAssetId,
      templateSerial: candidate.templateSerial,
      templateCode,
      title: candidate.title,
      categoryName: candidate.categoryName,
      width: candidate.width,
      height: candidate.height,
      pages: candidate.pages,
      keywordTokens: candidate.keywordTokens,
      thumbnailUrl: candidate.thumbnailUrl,
      traceId: candidate.traceId,
      recallSources: ["legacy_keyword"],
      orderKey,
    });
  });

  input.vectorCandidates.forEach((candidate, index) => {
    const templateCode = candidate.templateCode;
    if (!templateCode) return;
    const existing = merged.get(templateCode);
    const vectorOrderKey = input.legacyCandidates.length + index;
    if (existing) {
      if (!existing.recallSources.includes("vector_image")) {
        existing.recallSources.push("vector_image");
      }
      // Rank-interleave: keep the minimum rank; earlier ordering wins when
      // both sources return the same template.
      if (candidate.rank < existing.rank) {
        existing.rank = candidate.rank;
      }
      // Use the lower orderKey between legacy and vector to encode
      // "first source to surface this code wins for tie-break purposes"
      existing.orderKey = Math.min(existing.orderKey, vectorOrderKey);
      return;
    }
    merged.set(templateCode, {
      rank: candidate.rank,
      matchedQueryLabels: [],
      templateAssetId: `vector:${candidate.templateSerial || templateCode}`,
      templateSerial: candidate.templateSerial,
      templateCode,
      title: candidate.title,
      categoryName: candidate.categoryName,
      width: candidate.width,
      height: candidate.height,
      pages: candidate.pages,
      keywordTokens: candidate.keywordTokens,
      thumbnailUrl: candidate.thumbnailUrl,
      traceId: null,
      recallSources: ["vector_image"],
      orderKey: vectorOrderKey,
    });
  });

  return [...merged.values()]
    .sort((left, right) => left.rank - right.rank || left.orderKey - right.orderKey)
    .slice(0, Math.max(0, input.cap))
    .map(({ orderKey: _orderKey, ...rest }) => rest);
}

export function buildVectorRecallDiagnostics(
  result: VectorRecallResult,
  input: { topK: number; startedAt: number },
): VectorRecallDiagnostics {
  const latencyMs = Math.round((Date.now() - input.startedAt) * 100) / 100;
  if (result.error) {
    return {
      status: "error",
      topK: input.topK,
      candidateCount: 0,
      latencyMs,
      error: result.error,
    };
  }
  return {
    status: "executed",
    topK: input.topK,
    candidateCount: result.candidates.length,
    latencyMs,
    error: null,
  };
}

export const CANVAS_OUT_OF_R1_SCOPE: VectorRecallDiagnostics = {
  status: "skipped",
  reason: "canvas_out_of_r1_scope",
};

/**
 * R1 graceful-degrade factory. Returns null when TEMPLATE_EMBEDDING_ENDPOINT is
 * unset, which means vector recall is skipped at the call site. The typed env
 * surface (@tooldi/agent-config) is intentionally NOT touched in R1 — reading
 * process.env inline keeps the R1 prototype confined to the retrieval boundary.
 */
export function createTemplatePriorVectorRecallClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TemplateEmbeddingClient | null {
  const endpoint = env.TEMPLATE_EMBEDDING_ENDPOINT?.trim();
  if (!endpoint) {
    return null;
  }
  return createHttpTemplateEmbeddingClient({ endpoint });
}
