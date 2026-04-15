import assert from "node:assert/strict";
import test from "node:test";

import {
  createPlaceholderTooldiCatalogSourceClient,
  createTooldiApiCatalogSourceClient,
  TooldiCatalogSourceError,
} from "./tooldiCatalogSourceClient.js";

test("placeholder catalog source returns empty results", async () => {
  const client = createPlaceholderTooldiCatalogSourceClient();

  const backgrounds = await client.searchBackgroundAssets({
    type: "pattern",
    keyword: "봄",
    page: 1,
  });

  assert.equal(backgrounds.assets.length, 0);
  assert.equal(backgrounds.sourceFamily, "background_source");
});

test("background search serializes POST body and normalizes response", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const client = createTooldiApiCatalogSourceClient({
    baseUrl: "https://catalog.test/",
    cookieHeader: "PHPSESSID=test-session",
    fetchImpl: async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          result: true,
          page: 1,
          hasNextPage: true,
          data: [
            {
              serial: "11",
              category: "pattern",
              categorySerial: "32",
              priceType: "free",
              userSerial: "77",
              keywords: ["봄", "패턴", "파스텔"],
              thumbnail: "https://thumb.test/background.png",
              image: "https://origin.test/background.png",
              uid: "uid-background-11",
              width: 1080,
              height: 1080,
              isAi: false,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await client.searchBackgroundAssets({
    type: "pattern",
    keyword: "봄",
    page: 1,
    source: "search",
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "https://catalog.test/editor/get_background_contents");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(requests[0]?.init?.headers instanceof Headers, true);
  const headers = requests[0]?.init?.headers as Headers;
  assert.equal(headers.get("Cookie"), "PHPSESSID=test-session");
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(
    requests[0]?.init?.body,
    JSON.stringify({
      type: "pattern",
      page: 1,
      keyword: "봄",
      source: "search",
    }),
  );

  assert.equal(result.page, 1);
  assert.equal(result.hasNextPage, true);
  assert.equal(result.assets[0]?.assetId, "background:11");
  assert.equal(result.assets[0]?.backgroundKind, "pattern");
  assert.equal(result.assets[0]?.insertMode, "page_background");
  assert.deepEqual(result.assets[0]?.keywordTokens, ["봄", "패턴", "파스텔"]);
});

test("graphic search serializes query params and normalizes subtype", async () => {
  const client = createTooldiApiCatalogSourceClient({
    baseUrl: "https://catalog.test",
    fetchImpl: async (input, init) => {
      assert.equal(String(input), "https://catalog.test/shape");
      assert.equal(init?.method, "POST");
      assert.equal(
        init?.body,
        JSON.stringify({
          page: 1,
          keyword: "봄",
          type: "bitmap",
          price: "P",
          sort: "sales",
          owner: "follow",
          theme: "11",
          method: "creator",
        }),
      );

      return new Response(
        JSON.stringify({
          page: 1,
          last_page: true,
          list: [
            {
              serial: "22",
              categoryName: "bitmap",
              categorySerial: "40",
              priceType: "paid",
              userSerial: "88",
              keywords: ["봄", "꽃", "배너"],
              thumbnail: "https://thumb.test/shape.png",
              image: "https://origin.test/shape.png",
              uid: "uid-shape-22",
              isAi: false,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await client.searchGraphicAssets({
    page: 0,
    keyword: "봄",
    type: "bitmap",
    price: "paid",
    sort: "sales",
    owner: "follow",
    theme: "11",
    method: "creator",
  });

  assert.equal(result.assets[0]?.graphicKind, "bitmap");
  assert.equal(result.assets[0]?.insertMode, "object_element");
  assert.equal(result.assets[0]?.priceType, "paid");
  assert.equal(result.assets[0]?.isAi, false);
  assert.equal(result.assets[0]?.extension, ".png");
});

test("photo search normalizes orientation and background removal hint", async () => {
  const client = createTooldiApiCatalogSourceClient({
    baseUrl: "https://catalog.test",
    fetchImpl: async (_input, init) => {
      assert.equal(init?.method, "POST");
      assert.equal(
        init?.body,
        JSON.stringify({
          page: 1,
          keyword: "봄",
          type: "rmbg",
          format: "horizontal",
          price: "F",
          owner: "follow",
          theme: "18",
          source: "search",
        }),
      );

      return new Response(
        JSON.stringify({
          page: 1,
          last_page: true,
          list: [
            {
              serial: "33",
              priceType: "free",
              userSerial: "99",
              keywords: ["봄", "배경제거", "꽃"],
              thumbnail: "https://thumb.test/photo.jpg",
              image: "https://origin.test/photo.jpg",
              uid: "uid-photo-33",
              width: 1200,
              height: 628,
              isAi: false,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await client.searchPhotoAssets({
    page: 0,
    keyword: "봄",
    type: "rmbg",
    format: "horizontal",
    price: "free",
    owner: "follow",
    theme: "18",
    source: "search",
  });

  assert.equal(result.traceId, null);
  assert.equal(result.assets[0]?.orientation, "landscape");
  assert.equal(result.assets[0]?.backgroundRemovalHint, true);
  assert.equal(result.assets[0]?.insertMode, "object_image");
});

test("font inventory is normalized with weights and language filtering", async () => {
  const client = createTooldiApiCatalogSourceClient({
    baseUrl: "https://catalog.test",
    fetchImpl: async (input) => {
      assert.equal(String(input), "https://catalog.test/editor/loadFont");
      return new Response(
        JSON.stringify([
          {
            serial: "font-1",
            fontName: "Spring Sans",
            fontFace: "SpringSans",
            fontLanguage: "KOR",
            fontCategory: "고딕",
            supportedLanguages: ["KOR", "ENG"],
            thumbnail: "https://thumb.test/font.png",
            fontWeights: [
              {
                serial: "weight-1",
                fontSerial: "font-1",
                fontWeight: "700",
                convertWeight: "bold",
                fontFace: "SpringSans",
                fontFamily: "Spring Sans",
                extension: "ttf",
                fileType: "font/ttf",
                orgFilename: "spring-bold.ttf",
                savedFilename: "spring-bold.ttf",
                thumbnail: "https://thumb.test/font-700.png",
              },
            ],
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await client.listFontAssets({
    supportedLanguage: "KOR",
  });

  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0]?.sourceFamily, "font_source");
  assert.equal(result.assets[0]?.fontWeights.length, 1);
  assert.deepEqual(result.assets[0]?.supportedLanguages, ["KOR", "ENG"]);
});

test("template search invalid payload preserves response preview in source error", async () => {
  const client = createTooldiApiCatalogSourceClient({
    baseUrl: "https://catalog.test",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          result: true,
          message: "bad payload",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });

  let capturedError: unknown = null;
  try {
    await client.searchTemplateAssets({
      keyword: "봄 세일",
      page: 1,
      canvas: "horizontal",
      source: "search",
    });
  } catch (error) {
    capturedError = error;
  }

  assert.ok(capturedError instanceof TooldiCatalogSourceError);
  assert.equal(capturedError.code, "invalid_response");
  assert.match(capturedError.responsePreview ?? "", /bad payload/);
});

test("template search serializes the editor search payload and normalizes response", async () => {
  const client = createTooldiApiCatalogSourceClient({
    baseUrl: "https://catalog.test",
    fetchImpl: async (input, init) => {
      assert.equal(String(input), "https://catalog.test/editor/get_templates");
      assert.equal(init?.method, "POST");
      assert.equal(
        init?.body,
        JSON.stringify({
          keyword: "봄 세일 배너",
          page: 1,
          canvas: "horizontal",
          price: "S",
          follow: false,
          categorySerial: "",
          source: "search",
        }),
      );

      return new Response(
        JSON.stringify({
          result: true,
          page: 1,
          hasNextPage: false,
          trace_id: "trace-template-search",
          data: [
            {
              serial: "70079",
              code: "74091534190",
              title: "봄맞이 세일 할인 프로모션 배너",
              pages: 1,
              username: "creator",
              userSerial: "128344",
              keywords: ["봄맞이", "세일", "배너"],
              thumbnail: ["https://thumb.test/template-1.png"],
              width: 1200,
              height: 628,
              categoryName: "소셜미디어 광고",
              price: 8000,
              priceType: "partialPaid",
              isPurchased: false,
              totalObjectPrice: 0,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await client.searchTemplateAssets({
    keyword: "봄 세일 배너",
    page: 1,
    canvas: "horizontal",
    price: "partialPaid",
    source: "search",
  });

  assert.equal(result.sourceFamily, "template_source");
  assert.equal(result.traceId, "trace-template-search");
  assert.equal(result.assets[0]?.assetId, "template:70079");
  assert.equal(result.assets[0]?.code, "74091534190");
  assert.deepEqual(result.assets[0]?.thumbnails, ["https://thumb.test/template-1.png"]);
  assert.equal(result.assets[0]?.priceType, "paid");
});

test("template search treats result=false without data as an empty result set", async () => {
  const client = createTooldiApiCatalogSourceClient({
    baseUrl: "https://catalog.test",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          result: false,
          trace_id: "trace-template-empty",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });

  const result = await client.searchTemplateAssets({
    keyword: "신상품",
    page: 1,
    canvas: "horizontal",
    source: "search",
  });

  assert.equal(result.traceId, "trace-template-empty");
  assert.equal(result.assets.length, 0);
  assert.equal(result.hasNextPage, false);
});

test("template document fetch decodes pages and patterns", async () => {
  const client = createTooldiApiCatalogSourceClient({
    baseUrl: "https://catalog.test",
    fetchImpl: async (input, init) => {
      assert.equal(
        String(input),
        "https://catalog.test/editor/get_template_data?templateCode=NzQwOTE1MzQxOTA%3D&isWorking=false",
      );
      assert.equal(init?.method, "GET");

      return new Response(
        JSON.stringify({
          result: true,
          data: {
            templates: [
              JSON.stringify({
                backgroundType: "image",
                width: 1200,
                height: 628,
                objects: [{ type: "text", left: 120, width: 400, scaleX: 1 }],
              }),
            ],
            patterns: [{ background: "#ffffff" }],
            metaData: {
              code: "74091534190",
              innerCode: "717378421323",
              title: "봄 세일",
              width: "1200",
              height: "628",
              sizeUnit: "px",
              isShare: true,
              userId: "creator",
              createdAt: "2026-03-03",
              modifiedAt: "2026-03-03",
              keyword: "봄|:|세일",
            },
            canvas: {
              serial: "48",
              title: "소셜미디어 광고",
              width: "1200",
              height: "628",
              sizeUnit: "px",
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await client.getTemplateDocument({
    templateCode: "74091534190",
    isWorking: false,
  });

  assert.equal(result.code, "74091534190");
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0]?.parsed?.backgroundType, "image");
  assert.equal(Array.isArray(result.pages[0]?.parsed?.objects), true);
});

test("request timeout is mapped to a catalog source timeout error", async () => {
  const client = createTooldiApiCatalogSourceClient({
    baseUrl: "https://catalog.test",
    timeoutMs: 50,
    fetchImpl: async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    },
  });

  await assert.rejects(
    client.searchBackgroundAssets({
      type: "pattern",
      page: 1,
    }),
    (error: unknown) =>
      error instanceof TooldiCatalogSourceError && error.code === "timeout",
  );
});

test("invalid upstream payload is mapped to an invalid_response error", async () => {
  const client = createTooldiApiCatalogSourceClient({
    baseUrl: "https://catalog.test",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          result: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });

  await assert.rejects(
    client.searchGraphicAssets({
      page: 0,
      type: "vector",
    }),
    (error: unknown) =>
      error instanceof TooldiCatalogSourceError &&
      error.code === "invalid_response",
  );
});
