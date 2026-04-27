import type {
  V6Bounds,
  V6Canvas,
  V6ExtractionResult,
  V6RenderedElement,
} from "./v6Types.js";

export type V6RenderQualityIssueCode =
  | "root_bounds_mismatch"
  | "off_canvas_text"
  | "off_canvas_image"
  | "off_canvas_element"
  | "zero_area_element"
  | "scroll_overflow"
  | "high_text_density";

export interface V6RenderQualityIssue {
  readonly code: V6RenderQualityIssueCode;
  readonly severity: "info" | "warn";
  readonly blocking: boolean;
  readonly path: string;
  readonly tag: string;
  readonly message: string;
  readonly metrics: Record<string, number | string | boolean>;
}

export interface V6RenderQualityMetrics {
  readonly elementCount: number;
  readonly visibleElementCount: number;
  readonly textElementCount: number;
  readonly imageElementCount: number;
  readonly svgElementCount: number;
  readonly blockingIssueCount: number;
  readonly hardGateCandidateCount: number;
  readonly offCanvasElementCount: number;
  readonly scrollOverflowElementCount: number;
  readonly zeroAreaElementCount: number;
  readonly highTextDensityElementCount: number;
  readonly maxTextDensity: number;
}

export interface V6RenderQualityReport {
  readonly version: 1;
  readonly status: "observed";
  readonly passed: true;
  readonly hardGateCandidate: boolean;
  readonly canvas: V6Canvas;
  readonly metrics: V6RenderQualityMetrics;
  readonly issues: ReadonlyArray<V6RenderQualityIssue>;
  readonly blockingIssues: ReadonlyArray<V6RenderQualityIssue>;
}

export function formatV6RenderQualityRetryFeedback(
  report: V6RenderQualityReport,
): string {
  if (report.blockingIssues.length === 0) {
    return "No blocking render-quality issue was detected.";
  }
  const lines = report.blockingIssues.slice(0, 6).map((issue, index) => {
    const metrics = Object.entries(issue.metrics)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(", ");
    return `${index + 1}. ${issue.code} at path=${issue.path} tag=${issue.tag}; ${metrics}; fix=${retryFixHint(issue)}`;
  });
  return [
    `Canvas: ${report.canvas.width}x${report.canvas.height}`,
    "Blocking render-quality issues:",
    ...lines,
    "Fix only geometry/layout safety: root border-box must match canvas; visible text and images must stay inside canvas; visible text must not scroll/crop.",
    "For Korean text, prefer measured 2-3 line blocks, natural phrase breaks, lower font-size, wider boxes, or taller boxes. Do not hide overflow.",
  ].join("\n");
}

const ROOT_TOLERANCE_PX = 2;
const OFF_CANVAS_TOLERANCE_PX = 1;
const SCROLL_OVERFLOW_X_TOLERANCE_PX = 1;
const SCROLL_OVERFLOW_Y_TOLERANCE_PX = 4;
const HIGH_TEXT_DENSITY_THRESHOLD = 0.16;

function retryFixHint(issue: V6RenderQualityIssue): string {
  switch (issue.code) {
    case "root_bounds_mismatch":
      return "make the root div width/height exactly match the canvas and use box-sizing:border-box if padding or border exists";
    case "off_canvas_text":
      return "move or resize the text box inside the safe area; reduce font-size or line count if needed";
    case "off_canvas_image":
      return "move or resize the image so the visible image bounds stay inside the canvas";
    case "zero_area_element":
      return "give the element explicit non-zero width and height";
    case "scroll_overflow":
      return "increase text box width/height, reduce font-size, split at natural phrase boundaries, or shorten visible copy; never rely on clipped or scrolling text";
    case "off_canvas_element":
    case "high_text_density":
      return "adjust bounds or text density without introducing semantic roles or layout slots";
  }
}

export function buildV6RenderQualityReport(
  extraction: V6ExtractionResult,
): V6RenderQualityReport {
  const issues: V6RenderQualityIssue[] = [];
  const elements = extraction.elements;
  const visible = elements.filter((el) => el.visible);
  let offCanvasElementCount = 0;
  let scrollOverflowElementCount = 0;
  let zeroAreaElementCount = 0;
  let highTextDensityElementCount = 0;
  let blockingIssueCount = 0;
  let maxTextDensity = 0;

  const root = elements.find((el) => el.path === "0") ?? elements[0] ?? null;
  if (root && !rootMatchesCanvas(root.bounds, extraction.canvas)) {
    pushIssue(issues, {
      code: "root_bounds_mismatch",
      severity: "warn",
      blocking: true,
      path: root.path,
      tag: root.tagName,
      message: "root element bounds do not match the canvas size",
      metrics: {
        left: root.bounds.left,
        top: root.bounds.top,
        width: root.bounds.width,
        height: root.bounds.height,
        canvasWidth: extraction.canvas.width,
        canvasHeight: extraction.canvas.height,
      },
    });
    blockingIssueCount += 1;
  }

  for (const el of elements) {
    if (isZeroArea(el.bounds)) {
      zeroAreaElementCount += 1;
      const blocking = isBlockingZeroAreaElement(el);
      pushIssue(issues, {
        code: "zero_area_element",
        severity: blocking ? "warn" : "info",
        blocking,
        path: el.path,
        tag: el.tagName,
        message: "element has zero-area bounds",
        metrics: {
          width: el.bounds.width,
          height: el.bounds.height,
          visible: el.visible,
        },
      });
      if (blocking) blockingIssueCount += 1;
    }

    if (!el.visible) continue;

    const outside = offCanvasAmounts(el.bounds, extraction.canvas);
    if (outside.total > OFF_CANVAS_TOLERANCE_PX) {
      offCanvasElementCount += 1;
      const blocking = isBlockingOffCanvasElement(el);
      pushIssue(issues, {
        code: offCanvasIssueCode(el),
        severity: "warn",
        blocking,
        path: el.path,
        tag: el.tagName,
        message: "visible element extends outside the canvas",
        metrics: outside,
      });
      if (blocking) blockingIssueCount += 1;
    }

    const overflow = scrollOverflowAmounts(el);
    if (isScrollOverflowBeyondTolerance(overflow)) {
      scrollOverflowElementCount += 1;
      const blocking = isBlockingScrollOverflowElement(el);
      pushIssue(issues, {
        code: "scroll_overflow",
        severity: "warn",
        blocking,
        path: el.path,
        tag: el.tagName,
        message: "element scroll size exceeds client size",
        metrics: overflow,
      });
      if (blocking) blockingIssueCount += 1;
    }

    if (el.isTextLeaf && el.text) {
      const density = computeTextDensity(el.text, el.bounds.width);
      maxTextDensity = Math.max(maxTextDensity, density);
      if (density > HIGH_TEXT_DENSITY_THRESHOLD) {
        highTextDensityElementCount += 1;
        pushIssue(issues, {
          code: "high_text_density",
          severity: "info",
          blocking: false,
          path: el.path,
          tag: el.tagName,
          message: "text density is high for the measured width",
          metrics: {
            density: round(density),
            threshold: HIGH_TEXT_DENSITY_THRESHOLD,
            width: round(el.bounds.width),
            weightedChars: round(weightText(el.text)),
            textLength: Array.from(el.text).length,
          },
        });
      }
    }
  }
  const blockingIssues = issues.filter((issue) => issue.blocking);

  return {
    version: 1,
    status: "observed",
    passed: true,
    hardGateCandidate: blockingIssues.length > 0,
    canvas: extraction.canvas,
    metrics: {
      elementCount: elements.length,
      visibleElementCount: visible.length,
      textElementCount: visible.filter((el) => el.isTextLeaf && el.text).length,
      imageElementCount: visible.filter((el) => el.tagName === "img").length,
      svgElementCount: visible.filter((el) => el.tagName === "svg").length,
      blockingIssueCount,
      hardGateCandidateCount: blockingIssueCount,
      offCanvasElementCount,
      scrollOverflowElementCount,
      zeroAreaElementCount,
      highTextDensityElementCount,
      maxTextDensity: round(maxTextDensity),
    },
    issues,
    blockingIssues,
  };
}

// Deliberately static primitive policy. Do not split primitive types into
// semantic subtypes such as decorative-svg/logo-svg/hero-image/cta-text.
// Render QA is allowed to inspect geometry, visibility, scroll metrics, and
// primitive type only; content/domain/role/class/src-hint checks belong outside
// v6 and would recreate v2 slot/topology drift.
function rootMatchesCanvas(bounds: V6Bounds, canvas: V6Canvas): boolean {
  return (
    Math.abs(bounds.left) <= ROOT_TOLERANCE_PX &&
    Math.abs(bounds.top) <= ROOT_TOLERANCE_PX &&
    Math.abs(bounds.width - canvas.width) <= ROOT_TOLERANCE_PX &&
    Math.abs(bounds.height - canvas.height) <= ROOT_TOLERANCE_PX
  );
}

function isZeroArea(bounds: V6Bounds): boolean {
  return bounds.width <= 0 || bounds.height <= 0;
}

function offCanvasAmounts(bounds: V6Bounds, canvas: V6Canvas) {
  const left = Math.max(0, -bounds.left);
  const top = Math.max(0, -bounds.top);
  const right = Math.max(0, bounds.left + bounds.width - canvas.width);
  const bottom = Math.max(0, bounds.top + bounds.height - canvas.height);
  return {
    left: round(left),
    top: round(top),
    right: round(right),
    bottom: round(bottom),
    total: round(left + top + right + bottom),
  };
}

function offCanvasIssueCode(el: V6RenderedElement): V6RenderQualityIssueCode {
  if (el.isTextLeaf) return "off_canvas_text";
  if (el.tagName === "img") return "off_canvas_image";
  return "off_canvas_element";
}

function isBlockingOffCanvasElement(el: V6RenderedElement): boolean {
  return el.isTextLeaf || el.tagName === "img";
}

function isBlockingScrollOverflowElement(el: V6RenderedElement): boolean {
  return el.isTextLeaf;
}

function isBlockingZeroAreaElement(el: V6RenderedElement): boolean {
  return el.tagName === "img";
}

function pushIssue(
  issues: V6RenderQualityIssue[],
  issue: V6RenderQualityIssue,
): void {
  issues.push(issue);
}

function scrollOverflowAmounts(el: V6RenderedElement) {
  const layout = el.layout;
  if (!layout) {
    return { x: 0, y: 0, total: 0 };
  }
  const x = Math.max(0, layout.scrollWidth - layout.clientWidth);
  const y = Math.max(0, layout.scrollHeight - layout.clientHeight);
  return { x: round(x), y: round(y), total: round(x + y) };
}

function isScrollOverflowBeyondTolerance(overflow: {
  readonly x: number;
  readonly y: number;
}): boolean {
  return (
    overflow.x > SCROLL_OVERFLOW_X_TOLERANCE_PX ||
    overflow.y > SCROLL_OVERFLOW_Y_TOLERANCE_PX
  );
}

function computeTextDensity(text: string, width: number): number {
  if (width <= 0) return 0;
  return weightText(text) / width;
}

function weightText(text: string): number {
  return Array.from(text).reduce((sum, ch) => {
    if (/\s/u.test(ch)) return sum + 0.25;
    if (/[가-힣]/u.test(ch)) return sum + 1.6;
    if (/[A-Za-z0-9]/u.test(ch)) return sum + 1;
    return sum + 0.7;
  }, 0);
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
