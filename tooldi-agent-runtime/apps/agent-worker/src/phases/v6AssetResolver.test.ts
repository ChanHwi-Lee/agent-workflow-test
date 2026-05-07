import assert from "node:assert/strict";
import test from "node:test";

import { createObjectStoreClient } from "@tooldi/agent-persistence";

import { resolveV6PlaceholderAssets } from "./v6AssetResolver.js";
import type { V6ImageCommand, V6PrimitiveCommand } from "./v6Types.js";

const BASE_ENV = {
  agentInternalBaseUrl: "http://agent.test",
  objectStoreBucket: "agent-runtime-test",
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
  v6AssetGenerationMode: "off" as const,
  v6AssetGenerationModel: "gemini-2.5-flash-image",
  v6AssetGenerationTimeoutMs: 30000,
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

function fakePngBase64(width: number, height: number): string {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(
    buffer,
    0,
  );
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer.toString("base64");
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

test("resolveV6PlaceholderAssets는 generation mode에서 후보가 없으면 Gemini 생성 결과를 저장 URL로 적용한다", async () => {
  const originalFetch = globalThis.fetch;
  const objectStore = createObjectStoreClient({
    mode: "memory",
    bucket: BASE_ENV.objectStoreBucket,
  });
  globalThis.fetch = async (input: string | URL | Request) => {
    const url = String(input);
    if (url === BASE_ENV.v6AssetEmbeddingEndpoint) {
      return Response.json({ vectors: [[0.1, 0.2, 0.3]] });
    }
    if (url.includes("/collections/photos/points/query")) {
      return Response.json({ result: { points: [] } });
    }
    if (url.includes(":generateContent")) {
      return Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "image/png",
                    data: fakePngBase64(640, 480),
                  },
                },
              ],
            },
          },
        ],
      });
    }
    return new Response("not found", { status: 404 });
  };

  try {
    const commands = await resolveV6PlaceholderAssets({
      runId: "run-generated-test",
      userPrompt: "이미지 중심의 신제품 무선 헤드폰 광고 배너",
      canvasWidth: 1200,
      canvasHeight: 628,
      googleApiKey: "test-google-api-key",
      objectStore,
      env: {
        ...BASE_ENV,
        v6AssetGenerationMode: "enabled",
        v6AssetGenerationModel: "gemini-2.5-flash-image",
      },
      commands: [HEADPHONE_PLACEHOLDER as V6PrimitiveCommand],
    });
    const resolved = commands[0] as V6ImageCommand;
    assert.equal(resolved.unresolvedPlaceholder, undefined);
    assert.equal(resolved.generatedAssetProvider, "gemini");
    assert.equal(resolved.generatedAssetMethod, "gemini-native-generation");
    assert.equal(resolved.generatedAssetModel, "gemini-2.5-flash-image");
    assert.equal(resolved.naturalWidth, 640);
    assert.equal(resolved.naturalHeight, 480);
    assert.match(
      resolved.src,
      /^\/api\/agent-workflow\/runs\/run-generated-test\/artifacts\?key=/,
    );
    assert.doesNotMatch(resolved.src, /^data:/);

    const key = new URL(resolved.src, "http://toolditor.local").searchParams.get("key");
    assert.ok(key);
    const stored = await objectStore.getObject({
      bucket: BASE_ENV.objectStoreBucket,
      key,
    });
    assert.equal(stored.contentType, "image/png");
    assert.equal(stored.metadata.provider, "gemini");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
