import assert from "node:assert/strict";
import test from "node:test";

import { buildV6RenderQualityReport } from "./v6RenderQualityReport.js";
import type {
  V6ExtractionResult,
  V6RenderedElement,
  V6ComputedStyle,
} from "./v6Types.js";

const STYLE: V6ComputedStyle = {
  backgroundColor: "rgba(0, 0, 0, 0)",
  backgroundImage: "none",
  borderTopLeftRadius: "0px",
  borderTopRightRadius: "0px",
  borderBottomRightRadius: "0px",
  borderBottomLeftRadius: "0px",
  borderTopWidth: "0px",
  borderRightWidth: "0px",
  borderBottomWidth: "0px",
  borderLeftWidth: "0px",
  borderTopColor: "rgba(0, 0, 0, 0)",
  paddingTop: "0px",
  paddingRight: "0px",
  paddingBottom: "0px",
  paddingLeft: "0px",
  color: "rgb(0, 0, 0)",
  fontFamily: '"701_400"',
  fontSize: "16px",
  fontWeight: "400",
  fontStyle: "normal",
  textDecorationLine: "none",
  textAlign: "left",
  lineHeight: "normal",
  letterSpacing: "normal",
  opacity: "1",
  transform: "none",
  transformOrigin: "0px 0px",
  boxShadow: "none",
  objectFit: "fill",
  overflow: "visible",
  display: "block",
  visibility: "visible",
  whiteSpace: "normal",
};

function element(overrides: Partial<V6RenderedElement>): V6RenderedElement {
  return {
    serial: 0,
    path: "0",
    tagName: "div",
    bounds: { left: 0, top: 0, width: 1200, height: 628 },
    style: STYLE,
    isTextLeaf: false,
    text: null,
    img: null,
    svg: null,
    hasChildren: false,
    visible: true,
    layout: { clientWidth: 1200, clientHeight: 628, scrollWidth: 1200, scrollHeight: 628 },
    ...overrides,
  };
}

function extraction(
  elements: ReadonlyArray<V6RenderedElement>,
): V6ExtractionResult {
  return { canvas: { width: 1200, height: 628 }, elements };
}

test("렌더 품질 리포트는 정상 루트와 텍스트를 통과 관측 상태로 요약한다", () => {
  const report = buildV6RenderQualityReport(
    extraction([
      element({ path: "0" }),
      element({
        serial: 1,
        path: "0.0",
        tagName: "h1",
        bounds: { left: 80, top: 80, width: 480, height: 96 },
        isTextLeaf: true,
        text: "강아지 쿨매트",
        layout: { clientWidth: 480, clientHeight: 96, scrollWidth: 480, scrollHeight: 96 },
      }),
    ]),
  );

  assert.equal(report.status, "observed");
  assert.equal(report.passed, true);
  assert.equal(report.metrics.elementCount, 2);
  assert.equal(report.metrics.textElementCount, 1);
  assert.equal(report.hardGateCandidate, false);
  assert.equal(report.metrics.hardGateCandidateCount, 0);
  assert.equal(report.metrics.offCanvasElementCount, 0);
  assert.equal(report.metrics.scrollOverflowElementCount, 0);
});

test("렌더 품질 리포트는 캔버스 밖 텍스트와 스크롤 오버플로를 관측 이슈로 남긴다", () => {
  const report = buildV6RenderQualityReport(
    extraction([
      element({ path: "0" }),
      element({
        serial: 1,
        path: "0.0",
        tagName: "h1",
        bounds: { left: -12, top: 40, width: 120, height: 80 },
        isTextLeaf: true,
        text: "우리 아이를 위한 시원한 여름 쿨매트",
        layout: { clientWidth: 120, clientHeight: 80, scrollWidth: 310, scrollHeight: 128 },
      }),
    ]),
  );

  assert.equal(report.metrics.offCanvasElementCount, 1);
  assert.equal(report.metrics.scrollOverflowElementCount, 1);
  assert.equal(report.hardGateCandidate, true);
  assert.equal(report.metrics.hardGateCandidateCount, 2);
  assert.equal(
    report.issues.some((issue) => issue.code === "off_canvas_text"),
    true,
  );
  assert.equal(
    report.issues.some((issue) => issue.code === "scroll_overflow"),
    true,
  );
  assert.equal(
    report.issues.some((issue) => issue.code === "high_text_density"),
    true,
  );
});

test("렌더 품질 리포트는 root border-box가 canvas보다 크면 hard gate 후보로 표시한다", () => {
  const report = buildV6RenderQualityReport(
    extraction([
      element({
        path: "0",
        bounds: { left: 0, top: 0, width: 1360, height: 628 },
        layout: { clientWidth: 1360, clientHeight: 628, scrollWidth: 1360, scrollHeight: 628 },
      }),
    ]),
  );

  assert.equal(report.hardGateCandidate, true);
  assert.equal(report.metrics.hardGateCandidateCount, 1);
  assert.equal(
    report.issues.some((issue) => issue.code === "root_bounds_mismatch"),
    true,
  );
});

test("렌더 품질 리포트는 svg off-canvas를 hard gate 후보로 승격하지 않는다", () => {
  const report = buildV6RenderQualityReport(
    extraction([
      element({ path: "0" }),
      element({
        serial: 1,
        path: "0.0",
        tagName: "svg",
        bounds: { left: 1180, top: 40, width: 120, height: 120 },
        svg: { outerHTML: '<svg viewBox="0 0 120 120"></svg>' },
        layout: { clientWidth: 120, clientHeight: 120, scrollWidth: 120, scrollHeight: 120 },
      }),
    ]),
  );

  assert.equal(report.metrics.offCanvasElementCount, 1);
  assert.equal(report.hardGateCandidate, false);
  assert.equal(report.metrics.hardGateCandidateCount, 0);
  assert.equal(
    report.issues.some((issue) => issue.code === "off_canvas_element"),
    true,
  );
});
