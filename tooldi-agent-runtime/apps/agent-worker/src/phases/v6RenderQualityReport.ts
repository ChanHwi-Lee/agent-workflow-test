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
  | "high_text_density"
  | "text_overlap"
  | "text_image_overlap";

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
  readonly textOverlapPairCount: number;
  readonly textImageOverlapPairCount: number;
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
    "Fix only geometry/layout safety: root border-box must match canvas; visible text and images must stay inside canvas; visible text must not scroll, crop, overlap other text, or intersect image bounds. Do not hide overflow.",
  ].join("\n");
}

const ROOT_TOLERANCE_PX = 2;
const OFF_CANVAS_TOLERANCE_PX = 1;
const SCROLL_OVERFLOW_X_TOLERANCE_PX = 1;
const SCROLL_OVERFLOW_Y_TOLERANCE_PX = 4;
const HIGH_TEXT_DENSITY_THRESHOLD = 0.16;
const TEXT_OVERLAP_MIN_AREA_PX = 72;
const TEXT_OVERLAP_MIN_SMALLER_RATIO = 0.08;
const TEXT_OVERLAP_AXIS_TOLERANCE_PX = 2;
const TEXT_IMAGE_OVERLAP_BLOCKING_TEXT_AREA_RATIO = 0.25;

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
    case "text_overlap":
      return "regenerate with fewer visible text elements if needed; put each text element in a distinct non-intersecting band with at least 16px gap; remove decorative footer/caption text when bottom copy is already tight";
    case "text_image_overlap":
      return "for non-background images, leave at least 24px between text bounds and image bounds; move badges/labels outside the product or hero image instead of placing text on top of it";
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
  let textOverlapPairCount = 0;
  let textImageOverlapPairCount = 0;
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
    if (
      outside.total > OFF_CANVAS_TOLERANCE_PX &&
      isReportableOffCanvasElement(el)
    ) {
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
    if (
      isScrollOverflowBeyondTolerance(overflow) &&
      isReportableScrollOverflowElement(el)
    ) {
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

  for (const overlap of findTextOverlaps(visible)) {
    textOverlapPairCount += 1;
    pushIssue(issues, {
      code: "text_overlap",
      severity: "warn",
      blocking: true,
      path: overlap.a.path,
      tag: overlap.a.tagName,
      message: "visible text elements overlap each other",
      metrics: {
        otherPath: overlap.b.path,
        otherTag: overlap.b.tagName,
        overlapWidth: round(overlap.width),
        overlapHeight: round(overlap.height),
        overlapArea: round(overlap.area),
        smallerAreaRatio: round(overlap.smallerAreaRatio),
      },
    });
    blockingIssueCount += 1;
  }

  for (const overlap of findTextImageOverlaps(visible, extraction.canvas)) {
    textImageOverlapPairCount += 1;
    const blocking = isBlockingTextImageOverlap(overlap);
    pushIssue(issues, {
      code: "text_image_overlap",
      severity: "warn",
      blocking,
      path: overlap.text.path,
      tag: overlap.text.tagName,
      message: "visible text overlaps a real image placeholder region",
      metrics: {
        imagePath: overlap.image.path,
        imageTag: overlap.image.tagName,
        overlapWidth: round(overlap.width),
        overlapHeight: round(overlap.height),
        overlapArea: round(overlap.area),
        textAreaRatio: round(overlap.textAreaRatio),
      },
    });
    if (blocking) blockingIssueCount += 1;
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
      textOverlapPairCount,
      textImageOverlapPairCount,
      maxTextDensity: round(maxTextDensity),
    },
    issues,
    blockingIssues,
  };
}

function findTextImageOverlaps(
  elements: ReadonlyArray<V6RenderedElement>,
  canvas: V6Canvas,
): Array<{
  readonly text: V6RenderedElement;
  readonly image: V6RenderedElement;
  readonly width: number;
  readonly height: number;
  readonly area: number;
  readonly textAreaRatio: number;
}> {
  const textElements = elements.filter(
    (el) => el.isTextLeaf && el.text && !isZeroArea(el.bounds),
  );
  const imageElements = elements.filter(
    (el) =>
      el.tagName === "img" &&
      !isZeroArea(el.bounds) &&
      parseOpacity(el.style.opacity) > 0.15 &&
      !isLikelyBackgroundImage(el, canvas),
  );
  const overlaps: Array<{
    readonly text: V6RenderedElement;
    readonly image: V6RenderedElement;
    readonly width: number;
    readonly height: number;
    readonly area: number;
    readonly textAreaRatio: number;
  }> = [];

  for (const text of textElements) {
    for (const image of imageElements) {
      if (isAncestorPath(text.path, image.path)) continue;
      const overlap = textImageOverlapMetrics(text.bounds, image.bounds);
      if (!isMeaningfulTextImageOverlap(overlap)) continue;
      overlaps.push({ text, image, ...overlap });
    }
  }
  return overlaps;
}

function isLikelyBackgroundImage(
  el: V6RenderedElement,
  canvas: V6Canvas,
): boolean {
  const canvasArea = Math.max(1, canvas.width * canvas.height);
  const areaRatio = (el.bounds.width * el.bounds.height) / canvasArea;
  return areaRatio >= 0.55;
}

function textImageOverlapMetrics(text: V6Bounds, image: V6Bounds) {
  const width =
    Math.min(text.left + text.width, image.left + image.width) -
    Math.max(text.left, image.left);
  const height =
    Math.min(text.top + text.height, image.top + image.height) -
    Math.max(text.top, image.top);
  const area = Math.max(0, width) * Math.max(0, height);
  const textArea = text.width * text.height;
  return {
    width,
    height,
    area,
    textAreaRatio: textArea > 0 ? area / textArea : 0,
  };
}

function isMeaningfulTextImageOverlap(overlap: {
  readonly width: number;
  readonly height: number;
  readonly area: number;
  readonly textAreaRatio: number;
}): boolean {
  return (
    overlap.width > TEXT_OVERLAP_AXIS_TOLERANCE_PX &&
    overlap.height > TEXT_OVERLAP_AXIS_TOLERANCE_PX &&
    overlap.area >= TEXT_OVERLAP_MIN_AREA_PX &&
    overlap.textAreaRatio >= TEXT_OVERLAP_MIN_SMALLER_RATIO
  );
}

function isBlockingTextImageOverlap(overlap: {
  readonly textAreaRatio: number;
}): boolean {
  return overlap.textAreaRatio >= TEXT_IMAGE_OVERLAP_BLOCKING_TEXT_AREA_RATIO;
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

function isReportableOffCanvasElement(el: V6RenderedElement): boolean {
  return !isContentlessDecorativeBleed(el);
}

function isBlockingOffCanvasElement(el: V6RenderedElement): boolean {
  return el.isTextLeaf || el.tagName === "img";
}

function isReportableScrollOverflowElement(el: V6RenderedElement): boolean {
  return el.isTextLeaf;
}

function isBlockingScrollOverflowElement(el: V6RenderedElement): boolean {
  return el.isTextLeaf;
}

function isBlockingZeroAreaElement(el: V6RenderedElement): boolean {
  return el.tagName === "img";
}

function isContentlessDecorativeBleed(el: V6RenderedElement): boolean {
  if (el.tagName === "svg") {
    return parseOpacity(el.style.opacity) <= 0.2;
  }

  if (el.isTextLeaf || el.text || el.img || el.svg || el.hasChildren) {
    return false;
  }
  if (el.tagName !== "div" && el.tagName !== "span") {
    return false;
  }

  const backgroundImage = el.style.backgroundImage.trim().toLowerCase();
  const hasDecorativeGradient =
    backgroundImage.includes("linear-gradient(") ||
    backgroundImage.includes("radial-gradient(");

  return hasDecorativeGradient;
}

function findTextOverlaps(elements: ReadonlyArray<V6RenderedElement>): Array<{
  readonly a: V6RenderedElement;
  readonly b: V6RenderedElement;
  readonly width: number;
  readonly height: number;
  readonly area: number;
  readonly smallerAreaRatio: number;
}> {
  const textElements = elements
    .filter((el) => el.isTextLeaf && el.text && !isZeroArea(el.bounds))
    .sort((a, b) => a.serial - b.serial);
  const overlaps: Array<{
    readonly a: V6RenderedElement;
    readonly b: V6RenderedElement;
    readonly width: number;
    readonly height: number;
    readonly area: number;
    readonly smallerAreaRatio: number;
  }> = [];

  for (let i = 0; i < textElements.length; i += 1) {
    for (let j = i + 1; j < textElements.length; j += 1) {
      const a = textElements[i];
      const b = textElements[j];
      if (!a || !b || isAncestorPath(a.path, b.path)) continue;

      const overlap = textOverlapMetrics(a.bounds, b.bounds);
      if (!isMeaningfulTextOverlap(overlap)) continue;
      overlaps.push({ a, b, ...overlap });
    }
  }

  return overlaps;
}

function isAncestorPath(a: string, b: string): boolean {
  return b.startsWith(`${a}.`) || a.startsWith(`${b}.`);
}

function textOverlapMetrics(a: V6Bounds, b: V6Bounds) {
  const width =
    Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const height =
    Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  const area = Math.max(0, width) * Math.max(0, height);
  const smallerArea = Math.min(a.width * a.height, b.width * b.height);
  return {
    width,
    height,
    area,
    smallerAreaRatio: smallerArea > 0 ? area / smallerArea : 0,
  };
}

function isMeaningfulTextOverlap(overlap: {
  readonly width: number;
  readonly height: number;
  readonly area: number;
  readonly smallerAreaRatio: number;
}): boolean {
  return (
    overlap.width > TEXT_OVERLAP_AXIS_TOLERANCE_PX &&
    overlap.height > TEXT_OVERLAP_AXIS_TOLERANCE_PX &&
    overlap.area >= TEXT_OVERLAP_MIN_AREA_PX &&
    overlap.smallerAreaRatio >= TEXT_OVERLAP_MIN_SMALLER_RATIO
  );
}

function parseOpacity(s: string): number {
  const v = Number.parseFloat(s);
  return Number.isFinite(v) ? v : 1;
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
