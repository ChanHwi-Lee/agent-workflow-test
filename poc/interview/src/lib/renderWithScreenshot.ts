import type { Browser } from "playwright";

import {
  extractFromPage,
  type V6RenderOptions,
  type V6ExtractionResult,
} from "./agentWorkerImports.js";

export interface RenderWithScreenshotResult {
  readonly extraction: V6ExtractionResult;
  readonly screenshot: Buffer;
}

// agent-worker 의 renderAndExtract 는 context 를 close 하므로 screenshot 을
// 뽑을 기회가 없다. extractFromPage (page 만 받는 버전) 를 쓰고 page 의
// 수명은 여기서 관리한다. 렌더 설정(viewport / fonts / placeholder route) 은
// extractFromPage 내부에서 동일하게 처리된다.
export async function renderHtmlWithScreenshot(
  browser: Browser,
  html: string,
  options: V6RenderOptions,
): Promise<RenderWithScreenshotResult> {
  const context = await browser.newContext({
    viewport: {
      width: options.canvas.width,
      height: options.canvas.height,
    },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    const extraction = await extractFromPage(page, html, options);
    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    return { extraction, screenshot };
  } finally {
    await context.close();
  }
}
