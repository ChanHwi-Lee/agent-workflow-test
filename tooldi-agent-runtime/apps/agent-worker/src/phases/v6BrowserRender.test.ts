import assert from "node:assert/strict";
import test from "node:test";

import { launchEphemeralBrowser, renderAndExtract } from "./v6BrowserRender.js";

test("renderAndExtract — resets browser body margin before measuring bounds", async () => {
  const browser = await launchEphemeralBrowser();
  try {
    const result = await renderAndExtract(
      browser,
      '<div style="width:1200px;height:628px;background:#ffffff;"></div>',
      {
        canvas: { width: 1200, height: 628 },
        fontsReadyTimeoutMs: 100,
      },
    );

    const root = result.elements[0];
    assert.ok(root, "expected root element to be extracted");
    assert.deepEqual(root.bounds, {
      left: 0,
      top: 0,
      width: 1200,
      height: 628,
    });
  } finally {
    await browser.close();
  }
});

test("renderAndExtract — extracts text elements that contain line breaks", async () => {
  const browser = await launchEphemeralBrowser();
  try {
    const result = await renderAndExtract(
      browser,
      `<div style="width:1200px;height:628px;position:relative;">
        <h1 style="font-size:72px;line-height:1.1;margin:0;">브릿지잉글리시<br>여름방학 특강 모집</h1>
      </div>`,
      {
        canvas: { width: 1200, height: 628 },
        fontsReadyTimeoutMs: 100,
      },
    );

    const title = result.elements.find((el) => el.tagName === "h1");
    assert.ok(title, "expected h1 element to be extracted");
    assert.equal(title.isTextLeaf, true);
    assert.equal(title.text, "브릿지잉글리시\n여름방학 특강 모집");
  } finally {
    await browser.close();
  }
});
