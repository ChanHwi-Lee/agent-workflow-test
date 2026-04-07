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
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, "/editor/get_shapes");
      assert.equal(url.searchParams.get("page"), "0");
      assert.equal(url.searchParams.get("type"), "graphics");
      assert.equal(url.searchParams.get("keyword"), "봄");
      assert.equal(url.searchParams.get("format"), "bitmap");

      return new Response(
        JSON.stringify({
          result: true,
          page: 0,
          hasNextPage: false,
          data: [
            {
              serial: "22",
              category: "bitmap",
              categorySerial: "40",
              priceType: "paid",
              userSerial: "88",
              keywords: ["봄", "꽃", "배너"],
              thumbnail: "https://thumb.test/shape.png",
              image: "https://origin.test/shape.png",
              uid: "uid-shape-22",
              isAi: true,
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
    shapeType: "graphics",
    format: "bitmap",
  });

  assert.equal(result.assets[0]?.graphicKind, "bitmap");
  assert.equal(result.assets[0]?.insertMode, "object_element");
  assert.equal(result.assets[0]?.priceType, "paid");
  assert.equal(result.assets[0]?.isAi, true);
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
          page: 0,
          keyword: "봄",
          orientation: "landscape",
          backgroundRemoval: true,
          source: "search",
        }),
      );

      return new Response(
        JSON.stringify({
          result: true,
          page: 0,
          hasNextPage: false,
          trace_id: "trace-photo-1",
          data: [
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
    orientation: "landscape",
    backgroundRemoval: true,
    source: "search",
  });

  assert.equal(result.traceId, "trace-photo-1");
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
      shapeType: "graphics",
    }),
    (error: unknown) =>
      error instanceof TooldiCatalogSourceError &&
      error.code === "invalid_response",
  );
});
