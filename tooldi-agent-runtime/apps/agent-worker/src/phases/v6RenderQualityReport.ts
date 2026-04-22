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
}

const ROOT_TOLERANCE_PX = 2;
const OFF_CANVAS_TOLERANCE_PX = 1;
const SCROLL_OVERFLOW_TOLERANCE_PX = 1;
const HIGH_TEXT_DENSITY_THRESHOLD = 0.16;

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
  let hardGateCandidateCount = 0;
  let maxTextDensity = 0;

  const root = elements.find((el) => el.path === "0") ?? elements[0] ?? null;
  if (root && !rootMatchesCanvas(root.bounds, extraction.canvas)) {
    hardGateCandidateCount += 1;
    issues.push({
      code: "root_bounds_mismatch",
      severity: "warn",
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
  }

  for (const el of elements) {
    if (isZeroArea(el.bounds)) {
      zeroAreaElementCount += 1;
      issues.push({
        code: "zero_area_element",
        severity: "info",
        path: el.path,
        tag: el.tagName,
        message: "element has zero-area bounds",
        metrics: {
          width: el.bounds.width,
          height: el.bounds.height,
          visible: el.visible,
        },
      });
    }

    if (!el.visible) continue;

    const outside = offCanvasAmounts(el.bounds, extraction.canvas);
    if (outside.total > OFF_CANVAS_TOLERANCE_PX) {
      offCanvasElementCount += 1;
      if (isHardGateOffCanvasElement(el)) {
        hardGateCandidateCount += 1;
      }
      issues.push({
        code: offCanvasIssueCode(el),
        severity: "warn",
        path: el.path,
        tag: el.tagName,
        message: "visible element extends outside the canvas",
        metrics: outside,
      });
    }

    const overflow = scrollOverflowAmounts(el);
    if (overflow.total > SCROLL_OVERFLOW_TOLERANCE_PX) {
      scrollOverflowElementCount += 1;
      if (el.isTextLeaf) {
        hardGateCandidateCount += 1;
      }
      issues.push({
        code: "scroll_overflow",
        severity: "warn",
        path: el.path,
        tag: el.tagName,
        message: "element scroll size exceeds client size",
        metrics: overflow,
      });
    }

    if (el.isTextLeaf && el.text) {
      const density = computeTextDensity(el.text, el.bounds.width);
      maxTextDensity = Math.max(maxTextDensity, density);
      if (density > HIGH_TEXT_DENSITY_THRESHOLD) {
        highTextDensityElementCount += 1;
        issues.push({
          code: "high_text_density",
          severity: "info",
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

  return {
    version: 1,
    status: "observed",
    passed: true,
    hardGateCandidate: hardGateCandidateCount > 0,
    canvas: extraction.canvas,
    metrics: {
      elementCount: elements.length,
      visibleElementCount: visible.length,
      textElementCount: visible.filter((el) => el.isTextLeaf && el.text).length,
      imageElementCount: visible.filter((el) => el.tagName === "img").length,
      svgElementCount: visible.filter((el) => el.tagName === "svg").length,
      hardGateCandidateCount,
      offCanvasElementCount,
      scrollOverflowElementCount,
      zeroAreaElementCount,
      highTextDensityElementCount,
      maxTextDensity: round(maxTextDensity),
    },
    issues,
  };
}

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

function isHardGateOffCanvasElement(el: V6RenderedElement): boolean {
  return el.isTextLeaf || el.tagName === "img";
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
