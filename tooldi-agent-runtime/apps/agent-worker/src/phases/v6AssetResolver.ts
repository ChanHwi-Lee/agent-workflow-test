import type { AgentWorkerEnv } from "@tooldi/agent-config";

import type {
  V6Bounds,
  V6ImageCommand,
  V6PrimitiveCommand,
  V6TextCommand,
} from "./v6Types.js";

type AssetFamily = "photo" | "graphic";

export interface V6AssetResolverInput {
  readonly runId: string;
  readonly userPrompt: string;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly googleApiKey: string | null;
  readonly env: Pick<
    AgentWorkerEnv,
    | "v6AssetRagMode"
    | "v6AssetEmbeddingEndpoint"
    | "v6AssetQdrantUrl"
    | "v6AssetPhotoCollection"
    | "v6AssetGraphicCollection"
    | "v6AssetPublicBaseUrl"
    | "v6AssetTopK"
    | "v6AssetRerankCandidateCount"
    | "v6AssetTimeoutMs"
    | "v6AssetVisionRerankMode"
    | "v6AssetVisionModel"
  >;
  readonly commands: ReadonlyArray<V6PrimitiveCommand>;
}

interface PlaceholderContext {
  readonly index: number;
  readonly command: V6ImageCommand;
  readonly placeholderUri: string;
  readonly hint: string;
  readonly family: AssetFamily;
  readonly nearbyText: readonly string[];
  readonly searchText: string;
}

interface AssetCandidate {
  readonly candidateId: string;
  readonly tooldiAssetId: string;
  readonly sourceSerial: number | null;
  readonly family: AssetFamily;
  readonly qdrantRank: number;
  readonly qdrantScore: number;
  readonly thumbKey: string | null;
  readonly originKey: string | null;
  readonly srcKey: string;
  readonly srcUrl: string;
  readonly thumbUrl: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly aspectRatio: number | null;
  readonly keywords: readonly string[];
  readonly priceType: string | null;
}

type AssetSelection =
  | {
      readonly candidate: AssetCandidate;
      readonly method: string;
    }
  | {
      readonly candidate: null;
      readonly rejectReason: string;
    };

interface QdrantPoint {
  readonly score?: number;
  readonly payload?: Record<string, unknown>;
}

const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const PROMO_WORDS = new Set([
  "최대",
  "이번",
  "주말까지",
  "출시",
  "신메뉴",
  "이벤트",
  "배너",
  "포스터",
  "홍보",
  "만들어줘",
]);

// English placeholder slug token → Korean search term expansion
const EN_KO_MAP: Record<string, string> = {
  spring: "봄 봄날",
  summer: "여름",
  fall: "가을",
  autumn: "가을",
  winter: "겨울 눈",
  food: "음식",
  bowl: "그릇 음식",
  coffee: "카페 커피",
  cafe: "카페",
  background: "배경",
  photo: "사진",
  product: "제품 상품",
  shot: "사진",
  toy: "장난감",
  toys: "장난감",
  collection: "모음",
  wireless: "무선",
  headphone: "헤드폰 헤드셋 이어폰",
  headphones: "헤드폰 헤드셋 이어폰",
  headset: "헤드셋 헤드폰",
  headsets: "헤드셋 헤드폰",
  earbuds: "이어폰 이어버드",
  nature: "자연",
  flower: "꽃",
  flowers: "꽃",
  people: "사람",
  person: "사람",
  kids: "어린이 아이",
  child: "어린이 아이",
  children: "어린이 아이들",
  family: "가족",
  dog: "강아지",
  cat: "고양이",
  beach: "해변 바다",
  city: "도시",
  night: "밤 야경",
  wedding: "웨딩 결혼",
  business: "비즈니스 사무",
  health: "건강 의료",
  medical: "의료 건강",
  fitness: "피트니스 운동",
  beauty: "뷰티 화장품",
  fashion: "패션 의류",
  travel: "여행",
  interior: "인테리어",
};

const REQUIRED_KEYWORD_GROUPS: ReadonlyArray<{
  readonly triggers: readonly string[];
  readonly matches: readonly string[];
}> = [
  {
    triggers: ["headphone", "headphones", "headset", "headsets", "헤드폰", "헤드셋"],
    matches: ["headphone", "headphones", "headset", "headsets", "헤드폰", "헤드셋", "이어폰", "이어버드"],
  },
  {
    triggers: ["earbud", "earbuds", "이어폰", "이어버드"],
    matches: ["earbud", "earbuds", "earphone", "earphones", "이어폰", "이어버드", "헤드폰", "헤드셋"],
  },
];

function translateHint(hint: string): string {
  const tokens = hint.toLowerCase().split(/[\s\-_]+/);
  const translated = tokens.map((t) => EN_KO_MAP[t] ?? t);
  const hasKorean = /[가-힣]/.test(hint);
  if (hasKorean) return hint;
  const koTokens = translated.filter((t) => EN_KO_MAP[hint.toLowerCase().split(/[\s\-_]+/).find((h) => EN_KO_MAP[h] === t) ?? ""] !== undefined || /[가-힣]/.test(t));
  return koTokens.length > 0 ? translated.join(" ") : hint;
}

function classifyRole(
  command: V6ImageCommand,
  canvasWidth: number,
  canvasHeight: number,
): "background" | "hero" | "thumbnail" {
  const areaRatio =
    (command.bounds.width * command.bounds.height) /
    Math.max(1, canvasWidth * canvasHeight);
  if (command.objectFit === "cover" && areaRatio >= 0.4) return "background";
  if (areaRatio >= 0.15) return "hero";
  return "thumbnail";
}

const ROLE_SUFFIX: Record<"background" | "hero" | "thumbnail", string> = {
  background: "배경 전체화면 분위기 배경사진",
  hero: "선명한 고화질 메인",
  thumbnail: "",
};

export async function resolveV6PlaceholderAssets(
  input: V6AssetResolverInput,
): Promise<ReadonlyArray<V6PrimitiveCommand>> {
  if (input.env.v6AssetRagMode === "off") {
    return input.commands;
  }

  const contexts = buildPlaceholderContexts(input);
  if (contexts.length === 0) {
    return input.commands;
  }

  const next = [...input.commands];
  for (const context of contexts) {
    const resolved =
      input.env.v6AssetRagMode === "enabled"
        ? await resolveOne(input, context)
        : context.command;
    next[context.index] = resolved;
  }
  return next;
}

function buildPlaceholderContexts(
  input: V6AssetResolverInput,
): PlaceholderContext[] {
  const contexts: PlaceholderContext[] = [];
  for (const [index, command] of input.commands.entries()) {
    if (!isPlaceholderBitmap(command)) continue;
    const { hint, explicitFamily } = parsePlaceholderHint(command.src);
    const family =
      explicitFamily ??
      inferFamilyFromStructure(command, input.canvasWidth, input.canvasHeight);
    const role = classifyRole(command, input.canvasWidth, input.canvasHeight);
    const nearbyText = selectNearbyText(command.bounds, input.commands);
    contexts.push({
      index,
      command,
      placeholderUri: command.src,
      hint,
      family,
      nearbyText,
      searchText: buildSearchText({
        hint,
        family,
        role,
        userPrompt: input.userPrompt,
        nearbyText,
      }),
    });
  }
  return contexts;
}

function isPlaceholderBitmap(command: V6PrimitiveCommand): command is V6ImageCommand {
  return command.primitive === "bitmap" && command.src.startsWith("placeholder://");
}

function parsePlaceholderHint(src: string): { hint: string; explicitFamily: AssetFamily | null } {
  // New format: placeholder://photo/<hint> or placeholder://graphic/<hint>
  const withoutScheme = src.replace(/^placeholder:\/\//, "").replace(/\.[a-z0-9]+$/i, "");
  const photoMatch = withoutScheme.match(/^photo\/(.+)$/);
  const graphicMatch = withoutScheme.match(/^graphic\/(.+)$/);

  const raw = photoMatch?.[1] ?? graphicMatch?.[1] ?? withoutScheme;
  const explicitFamily: AssetFamily | null = photoMatch
    ? "photo"
    : graphicMatch
    ? "graphic"
    : null;

  let hint: string;
  try {
    hint = decodeURIComponent(raw).replace(/[-_]+/g, " ").trim() || raw;
  } catch {
    hint = raw.replace(/[-_]+/g, " ").trim();
  }

  return { hint, explicitFamily };
}

// Fallback-only: used when placeholder has no explicit family prefix (legacy/LLM miss).
// Uses structural signals only — no keyword lists.
function inferFamilyFromStructure(
  command: V6ImageCommand,
  canvasWidth: number,
  canvasHeight: number,
): AssetFamily {
  if (command.objectFit === "cover") return "photo";
  if (command.objectFit === "contain") return "graphic";
  const areaRatio =
    (command.bounds.width * command.bounds.height) /
    Math.max(1, canvasWidth * canvasHeight);
  return areaRatio >= 0.25 ? "photo" : "graphic";
}

function selectNearbyText(
  bounds: V6Bounds,
  commands: ReadonlyArray<V6PrimitiveCommand>,
): readonly string[] {
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const scored: Array<{ text: string; distance: number; index: number }> = [];
  for (const [index, command] of commands.entries()) {
    if (command.primitive !== "text") continue;
    const textCommand = command as V6TextCommand;
    const text = textCommand.text.trim();
    if (!text) continue;
    const textCenterX = textCommand.bounds.left + textCommand.bounds.width / 2;
    const textCenterY = textCommand.bounds.top + textCommand.bounds.height / 2;
    const dx = centerX - textCenterX;
    const dy = centerY - textCenterY;
    scored.push({ text, distance: Math.hypot(dx, dy), index });
  }
  return scored
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .slice(0, 4)
    .map((item) => item.text);
}

function buildSearchText(args: {
  hint: string;
  family: AssetFamily;
  role: "background" | "hero" | "thumbnail";
  userPrompt: string;
  nearbyText: readonly string[];
}): string {
  const rawHint = compactText(args.hint);
  // Translate English slug tokens to Korean for better recall against Korean corpus
  const hint = translateHint(rawHint);
  const prompt = compactText(args.userPrompt);
  const familyHint =
    args.family === "photo"
      ? "사진 photo"
      : "그래픽 스티커 아이콘 graphic sticker icon";
  const roleSuffix = ROLE_SUFFIX[args.role];
  const parts = [hint, hint, familyHint];
  if (roleSuffix) parts.push(roleSuffix);
  if (prompt && prompt !== rawHint) {
    parts.push(prompt);
  }
  for (const nearby of usefulNearbyText(args.nearbyText)) {
    parts.push(nearby);
  }
  return parts.filter(Boolean).join(". ");
}

function compactText(text: string): string {
  let out = text;
  for (const word of ["만들어줘", "배너", "포스터", "홍보"]) {
    out = out.replaceAll(word, " ");
  }
  return out.split(/\s+/).filter(Boolean).join(" ");
}

function usefulNearbyText(items: readonly string[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    const compact = item
      .split(/\s+/)
      .filter((token) => token && !PROMO_WORDS.has(token) && !/\d/.test(token))
      .join(" ");
    if (compact && !out.includes(compact)) {
      out.push(compact);
    }
  }
  return out.slice(0, 2);
}

async function resolveOne(
  input: V6AssetResolverInput,
  context: PlaceholderContext,
): Promise<V6ImageCommand> {
  try {
    const vector = await embedText(input, context.searchText);
    const points = await queryQdrant(input, context.family, vector);
    const candidates = buildCandidates(input, context.family, points);
    if (candidates.length === 0) {
      return unresolved(context, "no_match");
    }
    const selection = await selectCandidate(input, context, candidates);
    if (!selection.candidate) {
      return unresolved(context, selection.rejectReason);
    }
    return applyCandidate(context, selection.candidate, selection.method);
  } catch {
    return unresolved(context, "resolver_failed");
  }
}

async function embedText(
  input: V6AssetResolverInput,
  text: string,
): Promise<readonly number[]> {
  const response = await postJson(input.env.v6AssetEmbeddingEndpoint, {
    texts: [text],
    truncateDim: 512,
    task: "retrieval.query",
  }, input.env.v6AssetTimeoutMs);
  const vectors = readArray(response, "vectors");
  const vector = vectors[0];
  if (!Array.isArray(vector)) {
    throw new Error("embedding service returned no vector");
  }
  return vector.map((value) => Number(value));
}

async function queryQdrant(
  input: V6AssetResolverInput,
  family: AssetFamily,
  vector: readonly number[],
): Promise<readonly QdrantPoint[]> {
  const collection =
    family === "photo"
      ? input.env.v6AssetPhotoCollection
      : input.env.v6AssetGraphicCollection;
  const url = `${trimRight(input.env.v6AssetQdrantUrl, "/")}/collections/${collection}/points/query`;
  const response = await postJson(url, {
    query: vector,
    limit: input.env.v6AssetTopK,
    with_payload: true,
    with_vector: false,
  }, input.env.v6AssetTimeoutMs);
  const result = readObject(response, "result");
  const points = readArray(result, "points");
  return points.map((point) => point as QdrantPoint);
}

function buildCandidates(
  input: V6AssetResolverInput,
  family: AssetFamily,
  points: readonly QdrantPoint[],
): readonly AssetCandidate[] {
  const out: AssetCandidate[] = [];
  const max = Math.max(1, input.env.v6AssetRerankCandidateCount);
  for (const [index, point] of points.entries()) {
    const payload = point.payload ?? {};
    if (payload.assetFamily !== family) continue;
    const thumbKey = readString(payload, "thumbKey") ?? readString(payload, "s3Key");
    const originKey = readString(payload, "originKey");
    const srcKey = resolveInsertKey(family, originKey, thumbKey);
    if (!srcKey || !thumbKey) continue;
    const sourceSerial = readNumberValue(payload, "sourceSerial");
    const tooldiAssetId =
      readString(payload, "tooldiAssetId") ??
      readString(payload, "logicalPointId") ??
      `${family}:${sourceSerial ?? index + 1}`;
    const naturalWidth =
      readNumberValue(payload, "naturalWidth") ??
      readNumberValue(payload, "width") ??
      1;
    const naturalHeight =
      readNumberValue(payload, "naturalHeight") ??
      readNumberValue(payload, "height") ??
      1;
    out.push({
      candidateId: `C${String(out.length + 1).padStart(2, "0")}`,
      tooldiAssetId,
      sourceSerial,
      family,
      qdrantRank: index + 1,
      qdrantScore: Number(point.score ?? 0),
      thumbKey,
      originKey,
      srcKey,
      srcUrl: publicUrl(input.env.v6AssetPublicBaseUrl, srcKey),
      thumbUrl: publicUrl(input.env.v6AssetPublicBaseUrl, thumbKey),
      naturalWidth,
      naturalHeight,
      aspectRatio: readNumberValue(payload, "aspectRatio"),
      keywords: readStringArray(payload, "keywords"),
      priceType: readString(payload, "priceType"),
    });
    if (out.length >= max) break;
  }
  return out;
}

function resolveInsertKey(
  family: AssetFamily,
  originKey: string | null,
  thumbKey: string | null,
): string | null {
  if (family === "photo") return originKey ?? thumbKey;
  if (originKey && /\.(png|jpe?g|webp)$/i.test(originKey)) return originKey;
  return thumbKey;
}

async function selectCandidate(
  input: V6AssetResolverInput,
  context: PlaceholderContext,
  candidates: readonly AssetCandidate[],
): Promise<AssetSelection> {
  if (
    input.env.v6AssetVisionRerankMode !== "enabled" ||
    !input.googleApiKey ||
    candidates.length === 1
  ) {
    const candidate = firstRelevantCandidate(context, candidates);
    return candidate
      ? { candidate, method: "qdrant-keyword-relevance" }
      : { candidate: null, rejectReason: "keyword_rejected" };
  }
  const selectedId = await rerankWithVision(input, context, candidates);
  if (!selectedId) return { candidate: null, rejectReason: "vision_rejected" };
  const selected =
    candidates.find((candidate) => candidate.candidateId === selectedId) ??
    null;
  if (!selected) return { candidate: null, rejectReason: "vision_rejected" };
  if (!isCandidateRelevantToPlaceholder(context, selected)) {
    return { candidate: null, rejectReason: "keyword_rejected" };
  }
  return { candidate: selected, method: "qdrant-vision-rerank" };
}

function firstRelevantCandidate(
  context: PlaceholderContext,
  candidates: readonly AssetCandidate[],
): AssetCandidate | null {
  return (
    candidates.find((candidate) =>
      isCandidateRelevantToPlaceholder(context, candidate),
    ) ?? null
  );
}

function isCandidateRelevantToPlaceholder(
  context: PlaceholderContext,
  candidate: AssetCandidate,
): boolean {
  const requiredGroup = findRequiredKeywordGroup(context);
  if (!requiredGroup) return true;

  const candidateText = candidate.keywords.join(" ").toLowerCase();
  return requiredGroup.matches.some((term) =>
    candidateText.includes(term.toLowerCase()),
  );
}

function findRequiredKeywordGroup(
  context: PlaceholderContext,
): (typeof REQUIRED_KEYWORD_GROUPS)[number] | null {
  const text = `${context.hint} ${context.searchText}`.toLowerCase();
  return (
    REQUIRED_KEYWORD_GROUPS.find((group) =>
      group.triggers.some((term) => text.includes(term.toLowerCase())),
    ) ?? null
  );
}

async function rerankWithVision(
  input: V6AssetResolverInput,
  context: PlaceholderContext,
  candidates: readonly AssetCandidate[],
): Promise<string | null> {
  const parts: Array<Record<string, unknown>> = [
    {
      text: JSON.stringify({
        instruction:
          "You are a visual asset reranker only. Choose exactly one candidate ID from the provided candidates, or NONE. The canvas layout is locked. Do not suggest crop, resize, move, recolor, style changes, text changes, z-order changes, or new asset generation. Return JSON only.",
        placeholder: {
          id: context.placeholderUri,
          hint: context.hint,
          family: context.family,
          bounds: context.command.bounds,
          objectFit: context.command.objectFit,
          nearbyText: context.nearbyText,
          searchText: context.searchText,
        },
        candidates: candidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          tooldiAssetId: candidate.tooldiAssetId,
          qdrantRank: candidate.qdrantRank,
          qdrantScore: candidate.qdrantScore,
          naturalWidth: candidate.naturalWidth,
          naturalHeight: candidate.naturalHeight,
          keywords: candidate.keywords,
        })),
        outputSchema: {
          decision: "selected | unresolved",
          selectedCandidateId: "C01-C06 or null",
          confidence: "high | medium | low",
          reason: "short Korean reason",
        },
      }),
    },
  ];

  for (const candidate of candidates) {
    const image = await fetchImagePart(candidate.thumbUrl, input.env.v6AssetTimeoutMs);
    if (!image) continue;
    parts.push({ text: `Candidate ${candidate.candidateId}` });
    parts.push({
      inline_data: {
        mime_type: image.mimeType,
        data: image.base64,
      },
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${input.env.v6AssetVisionModel}:generateContent?key=${encodeURIComponent(input.googleApiKey ?? "")}`;
  const response = await postJson(url, {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0,
      response_mime_type: "application/json",
    },
  }, input.env.v6AssetTimeoutMs);
  const text = extractGeminiText(response);
  if (!text) return null;
  const parsed = safeParseJson(text);
  const selected = readString(parsed, "selectedCandidateId");
  if (selected === "NONE") return null;
  return selected;
}

async function fetchImagePart(
  url: string,
  timeoutMs: number,
): Promise<{ mimeType: string; base64: string } | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      mimeType: inferMimeType(url),
      base64: bytes.toString("base64"),
    };
  } catch {
    return null;
  }
}

function inferMimeType(url: string): string {
  if (/\.png($|\?)/i.test(url)) return "image/png";
  if (/\.webp($|\?)/i.test(url)) return "image/webp";
  return "image/jpeg";
}

function applyCandidate(
  context: PlaceholderContext,
  candidate: AssetCandidate,
  method: string,
): V6ImageCommand {
  return {
    ...context.command,
    src: candidate.srcUrl,
    naturalWidth: candidate.naturalWidth,
    naturalHeight: candidate.naturalHeight,
    alt: context.command.alt || context.hint,
    resolvedAssetId: candidate.tooldiAssetId,
    resolvedAssetFamily: candidate.family,
    ...(candidate.sourceSerial !== null
      ? { resolvedAssetSourceSerial: candidate.sourceSerial }
      : {}),
    ...(candidate.originKey ? { resolvedAssetOriginKey: candidate.originKey } : {}),
    ...(candidate.thumbKey ? { resolvedAssetThumbKey: candidate.thumbKey } : {}),
    resolvedAssetMethod: method,
    placeholderUri: context.placeholderUri,
    placeholderHint: context.hint,
  };
}

function unresolved(context: PlaceholderContext, reason: string): V6ImageCommand {
  return {
    ...context.command,
    src: TRANSPARENT_PIXEL,
    opacity: 0,
    naturalWidth: 1,
    naturalHeight: 1,
    unresolvedPlaceholder: true,
    placeholderUri: context.placeholderUri,
    placeholderHint: context.hint,
    unresolveReason: reason,
  };
}

async function postJson(
  url: string,
  body: unknown,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`POST ${url} failed: ${response.status}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

function extractGeminiText(response: Record<string, unknown>): string | null {
  const candidates = readArray(response, "candidates");
  const first = candidates[0];
  if (!isObject(first)) return null;
  const content = readObject(first, "content");
  const parts = readArray(content, "parts");
  const firstPart = parts[0];
  return isObject(firstPart) ? readString(firstPart, "text") : null;
}

function safeParseJson(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown;
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function publicUrl(base: string, key: string): string {
  return `${trimRight(base, "/")}/${key.replace(/^\/+/, "")}`;
}

function trimRight(value: string, suffix: string): string {
  let out = value;
  while (out.endsWith(suffix)) out = out.slice(0, -suffix.length);
  return out;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readObject(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const child = value[key];
  return isObject(child) ? child : {};
}

function readArray(value: Record<string, unknown>, key: string): unknown[] {
  const child = value[key];
  return Array.isArray(child) ? child : [];
}

function readString(value: Record<string, unknown>, key: string): string | null {
  const child = value[key];
  return typeof child === "string" && child.length > 0 ? child : null;
}

function readNumberValue(
  value: Record<string, unknown>,
  key: string,
): number | null {
  const child = value[key];
  return typeof child === "number" && Number.isFinite(child) ? child : null;
}

function readStringArray(
  value: Record<string, unknown>,
  key: string,
): readonly string[] {
  const child = value[key];
  if (!Array.isArray(child)) return [];
  return child.filter((item): item is string => typeof item === "string");
}
