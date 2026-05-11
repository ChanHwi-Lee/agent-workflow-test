import assert from "node:assert/strict";
import test from "node:test";


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
    const result = await resolveV6PlaceholderAssets({
      runId: "run-asset-test",
      attemptSeq: 0,
      userPrompt: "이미지 중심의 신제품 무선 헤드폰 광고 배너",
      canvasWidth: 1200,
      canvasHeight: 628,
      googleApiKey: null,
      env: BASE_ENV,
      commands: [HEADPHONE_PLACEHOLDER as V6PrimitiveCommand],
    });
    return result.commands[0] as V6ImageCommand;
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

test("resolveV6PlaceholderAssets는 vision rerank가 generate를 선택하고 publish가 성공하면 캔버스 src에 publicUrl이 기록된다", async () => {
  const originalFetch = globalThis.fetch;
  let visionRerankCalls = 0;
  let imageGenCalls = 0;
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
              score: 0.8,
              payload: {
                assetFamily: "photo",
                sourceSerial: 100,
                tooldiAssetId: "photo:100",
                thumbKey: "picture/40/100_thumb.png",
                originKey: "picture/40/100.jpg",
                naturalWidth: 1200,
                naturalHeight: 800,
                keywords: ["여성", "광고모델"],
              },
            },
            {
              score: 0.78,
              payload: {
                assetFamily: "photo",
                sourceSerial: 101,
                tooldiAssetId: "photo:101",
                thumbKey: "picture/40/101_thumb.png",
                originKey: "picture/40/101.jpg",
                naturalWidth: 1200,
                naturalHeight: 800,
                keywords: ["뷰티", "화장품"],
              },
            },
          ],
        },
      });
    }
    if (url.includes("thumb")) {
      // Stub thumb fetch for vision rerank inline-image attachment.
      const buffer = Buffer.from(fakePngBase64(64, 64), "base64");
      return new Response(buffer, {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }
    if (url.includes("gemini-vision-test:generateContent")) {
      visionRerankCalls += 1;
      return Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    decision: "generate",
                    confidence: "medium",
                    reason: "후보가 placeholder 와 의미적으로 맞지 않음",
                    generationPrompt:
                      "Premium wireless over-ear headphones, studio lit, isolated on white background.",
                    generationOptions: {
                      aspectRatio: "1:1",
                      outputFormat: "png",
                    },
                  }),
                },
              ],
            },
          },
        ],
      });
    }
    if (url.includes(":generateContent")) {
      imageGenCalls += 1;
      return Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "image/png",
                    data: fakePngBase64(1024, 1024),
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

  const publishedRequests: unknown[] = [];
  const mockPublishClient = {
    async publishAsset(req: unknown) {
      publishedRequests.push(req);
      return {
        publicUrl:
          "https://cdn.tooldi.com/order_attach/AI/0/1/upload_file/vision-rerank-generate-001.png",
        fileName: "vision-rerank-generate-001.png",
        userFileSerial: "1234",
      };
    },
  };

  try {
    const result = await resolveV6PlaceholderAssets({
      runId: "run-vision-generate",
      attemptSeq: 0,
      userPrompt: "이미지 중심의 신제품 무선 헤드폰 광고 배너",
      canvasWidth: 1200,
      canvasHeight: 628,
      googleApiKey: "test-google-api-key",
      publishClient: mockPublishClient,
      env: {
        ...BASE_ENV,
        v6AssetVisionRerankMode: "enabled",
        v6AssetVisionModel: "gemini-vision-test",
        v6AssetGenerationMode: "enabled",
        v6AssetGenerationModel: "gemini-2.5-flash-image",
      },
      commands: [HEADPHONE_PLACEHOLDER as V6PrimitiveCommand],
    });
    const resolved = result.commands[0] as V6ImageCommand;
    assert.equal(visionRerankCalls, 1);
    assert.equal(imageGenCalls, 1);
    assert.equal(publishedRequests.length, 1);
    assert.equal(resolved.unresolvedPlaceholder, undefined);
    assert.equal(resolved.generatedAssetProvider, "gemini");
    assert.equal(
      resolved.src,
      "https://cdn.tooldi.com/order_attach/AI/0/1/upload_file/vision-rerank-generate-001.png",
    );
    assert.notEqual(
      resolved.src,
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolveV6PlaceholderAssets는 generation mode에서 후보가 없으면 Gemini 생성 결과를 저장 URL로 적용한다", async () => {
  const originalFetch = globalThis.fetch;
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

  const publishedRequests: unknown[] = [];
  const mockPublishClient = {
    async publishAsset(req: unknown) {
      publishedRequests.push(req);
      return {
        publicUrl: "https://cdn.tooldi.com/order_attach/AI/0/1/upload_file/agw-run-generated-test-0.png",
        fileName: "agw-run-generated-test-0.png",
        userFileSerial: "999",
      };
    },
  };

  try {
    const result = await resolveV6PlaceholderAssets({
      runId: "run-generated-test",
      attemptSeq: 0,
      userPrompt: "이미지 중심의 신제품 무선 헤드폰 광고 배너",
      canvasWidth: 1200,
      canvasHeight: 628,
      googleApiKey: "test-google-api-key",
      publishClient: mockPublishClient,
      env: {
        ...BASE_ENV,
        v6AssetGenerationMode: "enabled",
        v6AssetGenerationModel: "gemini-2.5-flash-image",
      },
      commands: [HEADPHONE_PLACEHOLDER as V6PrimitiveCommand],
    });
    const resolved = result.commands[0] as V6ImageCommand;
    assert.equal(resolved.unresolvedPlaceholder, undefined);
    assert.equal(resolved.generatedAssetProvider, "gemini");
    assert.equal(resolved.generatedAssetMethod, "gemini-native-generation");
    assert.equal(resolved.generatedAssetModel, "gemini-2.5-flash-image");
    assert.equal(resolved.naturalWidth, 640);
    assert.equal(resolved.naturalHeight, 480);
    assert.equal(
      resolved.src,
      "https://cdn.tooldi.com/order_attach/AI/0/1/upload_file/agw-run-generated-test-0.png",
    );
    assert.equal(publishedRequests.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolveV6PlaceholderAssets는 placeholder 별 후보 + decision 을 resolutionLog 에 기록한다", async () => {
  const restore = installFetchMock(["헤드폰", "무선", "제품"]);
  try {
    const result = await resolveV6PlaceholderAssets({
      runId: "run-log-selected",
      attemptSeq: 0,
      userPrompt: "이미지 중심의 신제품 무선 헤드폰 광고 배너",
      canvasWidth: 1200,
      canvasHeight: 628,
      googleApiKey: null,
      env: BASE_ENV,
      commands: [HEADPHONE_PLACEHOLDER as V6PrimitiveCommand],
    });
    assert.equal(result.resolutionLog.runId, "run-log-selected");
    assert.equal(result.resolutionLog.attemptSeq, 0);
    assert.equal(result.resolutionLog.version, 1);
    assert.equal(result.resolutionLog.placeholders.length, 1);
    const placeholder = result.resolutionLog.placeholders[0];
    assert.ok(placeholder);
    assert.equal(placeholder.sourceSerial, 1);
    assert.equal(placeholder.placeholderHint, "premium wireless headphones");
    assert.equal(placeholder.family, "photo");
    assert.equal(placeholder.decision, "selected");
    assert.equal(placeholder.candidates.length, 1);
    assert.equal(placeholder.candidates[0]?.selected, true);
    assert.equal(placeholder.selectedCandidateRank, 1);
    assert.equal(placeholder.fallbackGeneratedAssetId, null);
    assert.equal(result.generatedLog.items.length, 0);
  } finally {
    restore();
  }
});

test("resolveV6PlaceholderAssets는 keyword reject 시 unresolved 결정과 후보를 resolutionLog 에 남긴다", async () => {
  const restore = installFetchMock(["여성", "광고모델", "beauty"]);
  try {
    const result = await resolveV6PlaceholderAssets({
      runId: "run-log-unresolved",
      attemptSeq: 1,
      userPrompt: "이미지 중심의 신제품 무선 헤드폰 광고 배너",
      canvasWidth: 1200,
      canvasHeight: 628,
      googleApiKey: null,
      env: BASE_ENV,
      commands: [HEADPHONE_PLACEHOLDER as V6PrimitiveCommand],
    });
    assert.equal(result.resolutionLog.placeholders.length, 1);
    const placeholder = result.resolutionLog.placeholders[0];
    assert.ok(placeholder);
    assert.equal(placeholder.decision, "unresolved");
    assert.equal(placeholder.candidates.length, 1);
    assert.equal(placeholder.candidates[0]?.selected, false);
    assert.equal(placeholder.selectedCandidateRank, null);
    assert.equal(result.generatedLog.items.length, 0);
  } finally {
    restore();
  }
});

test("resolveV6PlaceholderAssets는 Gemini 발사 1건이면 generatedLog.items 에 prompt/latency/asset 정보를 기록한다", async () => {
  const originalFetch = globalThis.fetch;
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

  const mockPublishClient = {
    async publishAsset() {
      return {
        publicUrl:
          "https://cdn.tooldi.com/order_attach/AI/0/1/upload_file/log-gen-test-0.png",
        fileName: "log-gen-test-0.png",
        userFileSerial: "9001",
      };
    },
  };

  try {
    const result = await resolveV6PlaceholderAssets({
      runId: "run-log-generated",
      attemptSeq: 2,
      userPrompt: "이미지 중심의 신제품 무선 헤드폰 광고 배너",
      canvasWidth: 1200,
      canvasHeight: 628,
      googleApiKey: "test-google-api-key",
      publishClient: mockPublishClient,
      env: {
        ...BASE_ENV,
        v6AssetGenerationMode: "enabled",
        v6AssetGenerationModel: "gemini-2.5-flash-image",
      },
      commands: [HEADPHONE_PLACEHOLDER as V6PrimitiveCommand],
    });
    assert.equal(result.generatedLog.runId, "run-log-generated");
    assert.equal(result.generatedLog.attemptSeq, 2);
    assert.equal(result.generatedLog.items.length, 1);
    const item = result.generatedLog.items[0];
    assert.ok(item);
    assert.equal(item.placeholderHint, "premium wireless headphones");
    assert.equal(item.model, "gemini-2.5-flash-image");
    assert.equal(typeof item.prompt, "string");
    assert.ok(item.prompt.length > 0);
    assert.ok(item.latencyMs >= 0);
    assert.equal(item.outputAssetKey, "9001");
    assert.equal(
      item.outputArtifactUrl,
      "https://cdn.tooldi.com/order_attach/AI/0/1/upload_file/log-gen-test-0.png",
    );
    assert.ok(item.fileSizeBytes > 0);
    assert.equal(result.resolutionLog.placeholders.length, 1);
    assert.equal(result.resolutionLog.placeholders[0]?.decision, "generate");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolveV6PlaceholderAssets 는 rag mode=off 일 때 빈 resolutionLog/generatedLog 를 반환한다", async () => {
  const result = await resolveV6PlaceholderAssets({
    runId: "run-log-off",
    attemptSeq: 0,
    userPrompt: "이미지 중심의 신제품 무선 헤드폰 광고 배너",
    canvasWidth: 1200,
    canvasHeight: 628,
    googleApiKey: null,
    env: { ...BASE_ENV, v6AssetRagMode: "off" as const },
    commands: [HEADPHONE_PLACEHOLDER as V6PrimitiveCommand],
  });
  assert.equal(result.resolutionLog.placeholders.length, 0);
  assert.equal(result.generatedLog.items.length, 0);
});
