// AGW v6 Phase 0 PoC — Playwright render + DOM extraction
//
// 철학:
//   - 브라우저가 layout 을 계산한다.
//   - 코드는 결과를 추출한다.
//
// Input:  samples/*.html
// Output: extracted/<name>.json  (RenderedElement[])

import { chromium } from 'playwright';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = join(__dirname, 'samples');
const OUT_DIR = join(__dirname, 'extracted');

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 628;

// 1x1 transparent PNG (89 bytes, base64)
const TRANSPARENT_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const TRANSPARENT_PNG = Buffer.from(TRANSPARENT_PNG_B64, 'base64');

async function extractFromHtml(page, html) {
  // Route placeholder://* → 1x1 transparent PNG so <img> bounds resolve.
  await page.route(/^placeholder:\/\//, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG })
  );

  await page.setViewportSize({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
  await page.setContent(html, { waitUntil: 'networkidle' });

  // Ensure fonts are loaded before measuring.
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  });

  const elements = await page.evaluate(
    ({ canvasW, canvasH }) => {
      const TEXT_NODE = 3;
      const ELEMENT_NODE = 1;

      function pickStyle(cs) {
        return {
          backgroundColor: cs.backgroundColor,
          backgroundImage: cs.backgroundImage,
          backgroundPosition: cs.backgroundPosition,
          backgroundSize: cs.backgroundSize,
          borderTopLeftRadius: cs.borderTopLeftRadius,
          borderTopRightRadius: cs.borderTopRightRadius,
          borderBottomRightRadius: cs.borderBottomRightRadius,
          borderBottomLeftRadius: cs.borderBottomLeftRadius,
          borderTopWidth: cs.borderTopWidth,
          borderTopStyle: cs.borderTopStyle,
          borderTopColor: cs.borderTopColor,
          borderRightWidth: cs.borderRightWidth,
          borderBottomWidth: cs.borderBottomWidth,
          borderLeftWidth: cs.borderLeftWidth,
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
          zIndex: cs.zIndex,
          whiteSpace: cs.whiteSpace,
        };
      }

      function elementChildren(el) {
        return Array.from(el.childNodes).filter(
          (n) => n.nodeType === ELEMENT_NODE
        );
      }

      function isTextLeaf(el) {
        // Text leaf = element whose child nodes are only text nodes (non-whitespace).
        const children = Array.from(el.childNodes);
        if (children.length === 0) return false;
        const hasElementChild = children.some((n) => n.nodeType === ELEMENT_NODE);
        if (hasElementChild) return false;
        const combined = children
          .filter((n) => n.nodeType === TEXT_NODE)
          .map((n) => n.nodeValue)
          .join('');
        return combined.trim().length > 0;
      }

      function elementText(el) {
        return Array.from(el.childNodes)
          .filter((n) => n.nodeType === TEXT_NODE)
          .map((n) => n.nodeValue)
          .join('')
          .replace(/\s+/g, ' ')
          .trim();
      }

      const results = [];
      let serial = 0;

      function visit(el, path) {
        const tag = el.tagName.toLowerCase();

        // SVG: emit the outermost as a single record; don't descend.
        if (tag === 'svg') {
          const rect = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          results.push({
            serial: serial++,
            path,
            tagName: 'svg',
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
            visible: rect.width > 0 && rect.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none',
          });
          return;
        }

        // <br>, inline-level child without layout box: skip if zero-area AND no paint.
        const rect = el.getBoundingClientRect();
        const cs = getComputedStyle(el);

        if (tag === 'img') {
          results.push({
            serial: serial++,
            path,
            tagName: 'img',
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
              src: el.getAttribute('src') || el.src || '',
              naturalWidth: el.naturalWidth,
              naturalHeight: el.naturalHeight,
              alt: el.getAttribute('alt') || '',
            },
            svg: null,
            hasChildren: false,
            visible: rect.width > 0 && rect.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none',
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
          visible: rect.width > 0 && rect.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none',
        });

        if (leaf) return;
        children.forEach((child, i) => visit(child, path ? `${path}.${i}` : `${i}`));
      }

      const root = document.body;
      // Skip body itself; start from body's element children.
      const rootChildren = Array.from(root.childNodes).filter((n) => n.nodeType === 1);
      rootChildren.forEach((child, i) => visit(child, `${i}`));

      return { canvas: { width: canvasW, height: canvasH }, elements: results };
    },
    { canvasW: CANVAS_WIDTH, canvasH: CANVAS_HEIGHT }
  );

  return elements;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const files = (await readdir(SAMPLES_DIR)).filter((f) => f.endsWith('.html')).sort();

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    for (const f of files) {
      const html = await readFile(join(SAMPLES_DIR, f), 'utf8');
      const name = basename(f, '.html');
      process.stdout.write(`[extract] ${name} ... `);
      const data = await extractFromHtml(page, html);
      const outPath = join(OUT_DIR, `${name}.json`);
      await writeFile(outPath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`${data.elements.length} elements → ${outPath}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
