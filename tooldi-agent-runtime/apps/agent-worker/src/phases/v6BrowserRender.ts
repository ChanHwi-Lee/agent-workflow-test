/// <reference lib="dom" />
// AGW v6 browser render — Playwright Chromium wrapper.
//
// Philosophy lock:
//   - 브라우저가 layout 을 계산한다.
//   - 코드는 (오직) 결과를 추출한다.
//
// `extractFromPage` 는 Playwright `Page` 를 받아 `page.evaluate` 안에서
// getBoundingClientRect + getComputedStyle 로 개별 primitive 추출 정보를 모은다.
// `renderAndExtract` 는 warm browser pool 시나리오를 위해 Browser 만 받아 ephemeral
// context 를 만든다. Phase 5 인프라에서 warm pool 이 Browser 인스턴스를 오래
// 유지한다. Cold launch 는 `launchEphemeralBrowser` 를 통해 처리한다.
//
// Placeholder image 전략:
//   - `placeholder://<...>` scheme 은 route 인터셉터로 1×1 transparent PNG 반환.
//   - `<img>` 는 inline width/height 가 있어야 bounds 가 정상 확보된다 (Phase 1
//     validator 에서 강제 여부는 handoff §Open risks R-2 와 연결).

import { chromium } from "playwright";
import type { Browser, BrowserContext, Page, Route } from "playwright";

import {
  buildFontFaceStyleBlock,
  injectFontFaceStyle,
} from "./v6FontRegistry.js";
import type {
  V6Canvas,
  V6ComputedStyle,
  V6ExtractionResult,
  V6RenderedElement,
} from "./v6Types.js";

// 1×1 transparent PNG (89 bytes) for placeholder route interception.
const TRANSPARENT_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const TRANSPARENT_PNG = Buffer.from(TRANSPARENT_PNG_B64, "base64");

// Phase 2.5 prod path parity: inject Toolditor webfont @font-face rules before
// setContent so Playwright measures glyph metrics with the same font set the
// canvas will render with. Computed once per process; registry access is sync.
const FONT_FACE_STYLE_BLOCK = buildFontFaceStyleBlock();

export interface V6RenderOptions {
  readonly canvas: V6Canvas;
  readonly fontsReadyTimeoutMs?: number;
}

export async function extractFromPage(
  page: Page,
  html: string,
  options: V6RenderOptions,
): Promise<V6ExtractionResult> {
  await page.route(/^placeholder:\/\//, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: TRANSPARENT_PNG,
    }),
  );

  await page.setViewportSize({
    width: options.canvas.width,
    height: options.canvas.height,
  });
  const htmlWithFonts = injectFontFaceStyle(html, FONT_FACE_STYLE_BLOCK);
  await page.setContent(htmlWithFonts, { waitUntil: "networkidle" });

  const fontsTimeout = options.fontsReadyTimeoutMs ?? 5000;
  await page.evaluate(async (timeoutMs: number) => {
    if (document.fonts && document.fonts.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    }
  }, fontsTimeout);

  const result = await page.evaluate(
    ({ canvasW, canvasH }: { canvasW: number; canvasH: number }) => {
      const TEXT_NODE = 3;
      const ELEMENT_NODE = 1;

      function pickStyle(cs: CSSStyleDeclaration): V6ComputedStyleRaw {
        return {
          backgroundColor: cs.backgroundColor,
          backgroundImage: cs.backgroundImage,
          borderTopLeftRadius: cs.borderTopLeftRadius,
          borderTopRightRadius: cs.borderTopRightRadius,
          borderBottomRightRadius: cs.borderBottomRightRadius,
          borderBottomLeftRadius: cs.borderBottomLeftRadius,
          borderTopWidth: cs.borderTopWidth,
          borderRightWidth: cs.borderRightWidth,
          borderBottomWidth: cs.borderBottomWidth,
          borderLeftWidth: cs.borderLeftWidth,
          borderTopColor: cs.borderTopColor,
          paddingTop: cs.paddingTop,
          paddingRight: cs.paddingRight,
          paddingBottom: cs.paddingBottom,
          paddingLeft: cs.paddingLeft,
          color: cs.color,
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          fontStyle: cs.fontStyle,
          textDecorationLine: cs.textDecorationLine,
          textAlign: cs.textAlign,
          lineHeight: cs.lineHeight,
          letterSpacing: cs.letterSpacing,
          opacity: cs.opacity,
          transform: cs.transform,
          transformOrigin: cs.transformOrigin,
          boxShadow: cs.boxShadow,
          objectFit: cs.objectFit,
          overflow: cs.overflow,
          display: cs.display,
          visibility: cs.visibility,
          whiteSpace: cs.whiteSpace,
        };
      }

      function elementChildren(el: Element): Element[] {
        return Array.from(el.childNodes).filter(
          (n) => n.nodeType === ELEMENT_NODE,
        ) as Element[];
      }

      function isTextLeaf(el: Element): boolean {
        const children = Array.from(el.childNodes);
        if (children.length === 0) return false;
        if (children.some((n) => n.nodeType === ELEMENT_NODE)) return false;
        const combined = children
          .filter((n) => n.nodeType === TEXT_NODE)
          .map((n) => n.nodeValue ?? "")
          .join("");
        return combined.trim().length > 0;
      }

      function elementText(el: Element): string {
        return Array.from(el.childNodes)
          .filter((n) => n.nodeType === TEXT_NODE)
          .map((n) => n.nodeValue ?? "")
          .join("")
          .replace(/\s+/g, " ")
          .trim();
      }

      const results: V6RenderedElementRaw[] = [];
      let serial = 0;

      function visit(el: Element, path: string): void {
        const tag = el.tagName.toLowerCase();

        if (tag === "svg") {
          const rect = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          results.push({
            serial: serial++,
            path,
            tagName: "svg",
            bounds: {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            },
            style: pickStyle(cs),
            isTextLeaf: false,
            text: null,
            img: null,
            svg: { outerHTML: el.outerHTML },
            hasChildren: false,
            visible:
              rect.width > 0 &&
              rect.height > 0 &&
              cs.visibility !== "hidden" &&
              cs.display !== "none",
          });
          return;
        }

        const rect = el.getBoundingClientRect();
        const cs = getComputedStyle(el);

        if (tag === "img") {
          const img = el as HTMLImageElement;
          results.push({
            serial: serial++,
            path,
            tagName: "img",
            bounds: {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            },
            style: pickStyle(cs),
            isTextLeaf: false,
            text: null,
            img: {
              src: img.getAttribute("src") ?? img.src ?? "",
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              alt: img.getAttribute("alt") ?? "",
            },
            svg: null,
            hasChildren: false,
            visible:
              rect.width > 0 &&
              rect.height > 0 &&
              cs.visibility !== "hidden" &&
              cs.display !== "none",
          });
          return;
        }

        const children = elementChildren(el);
        const leaf = isTextLeaf(el);

        results.push({
          serial: serial++,
          path,
          tagName: tag,
          bounds: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          },
          style: pickStyle(cs),
          isTextLeaf: leaf,
          text: leaf ? elementText(el) : null,
          img: null,
          svg: null,
          hasChildren: children.length > 0,
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            cs.visibility !== "hidden" &&
            cs.display !== "none",
        });

        if (leaf) return;
        children.forEach((child, i) =>
          visit(child, path ? `${path}.${i}` : `${i}`),
        );
      }

      const rootChildren = Array.from(document.body.childNodes).filter(
        (n) => n.nodeType === ELEMENT_NODE,
      ) as Element[];
      rootChildren.forEach((child, i) => visit(child, `${i}`));

      return {
        canvas: { width: canvasW, height: canvasH },
        elements: results,
      };
    },
    { canvasW: options.canvas.width, canvasH: options.canvas.height },
  );

  await page.unrouteAll();
  return result as V6ExtractionResult;
}

export async function renderAndExtract(
  browser: Browser,
  html: string,
  options: V6RenderOptions,
): Promise<V6ExtractionResult> {
  const context: BrowserContext = await browser.newContext({
    viewport: { width: options.canvas.width, height: options.canvas.height },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    return await extractFromPage(page, html, options);
  } finally {
    await context.close();
  }
}

export async function launchEphemeralBrowser(): Promise<Browser> {
  return chromium.launch();
}

// --- types for the in-browser evaluate callback ---
// These are declared at module level for the TypeScript compiler; at runtime
// they live only inside the page.evaluate closure.

interface V6RenderedElementRaw {
  serial: number;
  path: string;
  tagName: string;
  bounds: { left: number; top: number; width: number; height: number };
  style: V6ComputedStyleRaw;
  isTextLeaf: boolean;
  text: string | null;
  img: { src: string; naturalWidth: number; naturalHeight: number; alt: string } | null;
  svg: { outerHTML: string } | null;
  hasChildren: boolean;
  visible: boolean;
}

type V6ComputedStyleRaw = V6ComputedStyle;

// Re-declare for verifying structural compatibility between page-side raw
// types and module-side public types without circular imports.
const _typecheck: V6RenderedElementRaw extends V6RenderedElement ? true : false = true;
void _typecheck;
