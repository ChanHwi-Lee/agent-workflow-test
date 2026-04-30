import assert from "node:assert/strict";
import test from "node:test";

import { resolveV6PlaceholderAssets } from "./v6AssetResolver.js";
import type { V6ImageCommand, V6PrimitiveCommand } from "./v6Types.js";

const BASE_ENV = {
  v6AssetRagMode: "enabled" as const,
  v6AssetEmbeddingEndpoint: "http://embedding.test/embed",
  v6AssetQdrantUrl: "http://qdrant.test",
  v6AssetPhotoCollection: "photos",
  v6AssetGraphicCollection: "graphics",
  v6AssetPublicBaseUrl: "https://assets.test",
  v6AssetTopK: 3,
  v6AssetRerankCandidateCount: 3,
  v6AssetTimeoutMs: 5000,
  v6AssetVisionRerankMode: "off" as const,
  v6AssetVisionModel: "gemini-test",
};

const HEADPHONE_PLACEHOLDER: V6ImageCommand = {
  type: "create",
  primitive: "bitmap",
  source: { serial: 1, path: "0.1", tag: "img" },
  bounds: { left: 700, top: 80, width: 360, height: 360 },
  opacity: 1,
  src: "placeholder://premium-wireless-headphones",
  naturalWidth: 1,
  naturalHeight: 1,
  objectFit: "cover",
  borderRadius: 0,
  alt: "premium wireless headphones",
};

function installFetchMock(keywords: readonly string[]) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request) => {
    const url = String(input);
    if (url === BASE_ENV.v6AssetEmbeddingEndpoint) {
      return Response.json({ vectors: [[0.1, 0.2, 0.3]] });
    }
    if (url.includes("/collections/photos/points/query")) {
      return Response.json({
        result: {
          points: [
            {
              score: 0.91,
              payload: {
                assetFamily: "photo",
                sourceSerial: 186140,
                tooldiAssetId: "photo:186140",
                thumbKey: "picture/40/186140_thumb.png",
                originKey: "picture/40/186140.jpg",
                naturalWidth: 2500,
                naturalHeight: 2500,
                keywords,
              },
            },
          ],
        },
      });
    }
    return new Response("not found", { status: 404 });
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

async function resolveOne(
  keywords: readonly string[],
): Promise<V6ImageCommand> {
  const restore = installFetchMock(keywords);
  try {
    const commands = await resolveV6PlaceholderAssets({
      runId: "run-asset-test",
      userPrompt: "이미지 중심의 신제품 무선 헤드폰 광고 배너",
      canvasWidth: 1200,
      canvasHeight: 628,
      googleApiKey: null,
      env: BASE_ENV,
      commands: [HEADPHONE_PLACEHOLDER as V6PrimitiveCommand],
    });
    return commands[0] as V6ImageCommand;
  } finally {
    restore();
  }
}

test("resolveV6PlaceholderAssets는 헤드폰 placeholder에 여성 모델 사진만 있으면 unresolved로 남긴다", async () => {
  const resolved = await resolveOne([
    "여성",
    "광고모델",
    "beauty",
    "model",
    "woman",
  ]);

  assert.equal(resolved.unresolvedPlaceholder, true);
  assert.equal(resolved.unresolveReason, "keyword_rejected");
  assert.equal(resolved.opacity, 0);
  assert.equal(resolved.placeholderHint, "premium wireless headphones");
});

test("resolveV6PlaceholderAssets는 구체 제품 keyword가 맞으면 asset을 적용한다", async () => {
  const resolved = await resolveOne(["헤드폰", "무선", "제품", "오디오"]);

  assert.equal(resolved.unresolvedPlaceholder, undefined);
  assert.equal(resolved.resolvedAssetId, "photo:186140");
  assert.equal(resolved.resolvedAssetMethod, "qdrant-keyword-relevance");
  assert.equal(resolved.src, "https://assets.test/picture/40/186140.jpg");
});
