import assert from "node:assert/strict";
import test from "node:test";

import {
  buildV6RenderQualityReport,
  formatV6RenderQualityRetryFeedback,
} from "./v6RenderQualityReport.js";
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
  position: "static",
  zIndex: "auto",
  boxShadow: "none",
  objectFit: "fill",
  overflow: "visible",
  display: "block",
  alignItems: "normal",
  justifyContent: "normal",
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
    layout: {
      clientWidth: 1200,
      clientHeight: 628,
      scrollWidth: 1200,
      scrollHeight: 628,
    },
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
        layout: {
          clientWidth: 480,
          clientHeight: 96,
          scrollWidth: 480,
          scrollHeight: 96,
        },
      }),
    ]),
  );

  assert.equal(report.status, "observed");
  assert.equal(report.passed, true);
  assert.equal(report.metrics.elementCount, 2);
  assert.equal(report.metrics.textElementCount, 1);
  assert.equal(report.hardGateCandidate, false);
  assert.equal(report.blockingIssues.length, 0);
  assert.equal(report.metrics.blockingIssueCount, 0);
  assert.equal(report.metrics.hardGateCandidateCount, 0);
  assert.equal(report.metrics.offCanvasElementCount, 0);
  assert.equal(report.metrics.scrollOverflowElementCount, 0);
  assert.equal(report.metrics.textOverlapPairCount, 0);
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
        layout: {
          clientWidth: 120,
          clientHeight: 80,
          scrollWidth: 310,
          scrollHeight: 128,
        },
      }),
    ]),
  );

  assert.equal(report.metrics.offCanvasElementCount, 1);
  assert.equal(report.metrics.scrollOverflowElementCount, 1);
  assert.equal(report.hardGateCandidate, true);
  assert.equal(report.blockingIssues.length, 2);
  assert.equal(report.metrics.blockingIssueCount, 2);
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

test("렌더 품질 리포트는 미세한 세로 스크롤 오차를 hard gate 후보로 보지 않는다", () => {
  const report = buildV6RenderQualityReport(
    extraction([
      element({ path: "0" }),
      element({
        serial: 1,
        path: "0.0",
        tagName: "h1",
        bounds: { left: 80, top: 80, width: 480, height: 160 },
        isTextLeaf: true,
        text: "아이스 복숭아 라떼",
        layout: {
          clientWidth: 480,
          clientHeight: 160,
          scrollWidth: 480,
          scrollHeight: 162,
        },
      }),
    ]),
  );

  assert.equal(report.metrics.scrollOverflowElementCount, 0);
  assert.equal(report.hardGateCandidate, false);
  assert.equal(report.blockingIssues.length, 0);
});

test("렌더 품질 리포트는 작은 수평 텍스트 스크롤 오버플로를 계속 blocking으로 표시한다", () => {
  const report = buildV6RenderQualityReport(
    extraction([
      element({ path: "0" }),
      element({
        serial: 1,
        path: "0.0",
        tagName: "h1",
        bounds: { left: 80, top: 80, width: 480, height: 160 },
        isTextLeaf: true,
        text: "아이스 복숭아 라떼",
        layout: {
          clientWidth: 480,
          clientHeight: 160,
          scrollWidth: 482,
          scrollHeight: 160,
        },
      }),
    ]),
  );

  assert.equal(report.metrics.scrollOverflowElementCount, 1);
  assert.equal(report.hardGateCandidate, true);
  assert.equal(report.blockingIssues.length, 1);
  assert.equal(report.blockingIssues[0]?.code, "scroll_overflow");
});

test("렌더 품질 리포트는 실제 텍스트 스크롤 오버플로는 계속 blocking으로 표시한다", () => {
  const report = buildV6RenderQualityReport(
    extraction([
      element({ path: "0" }),
      element({
        serial: 1,
        path: "0.0",
        tagName: "h1",
        bounds: { left: 80, top: 80, width: 480, height: 80 },
        isTextLeaf: true,
        text: "아이스 복숭아 라떼",
        layout: {
          clientWidth: 480,
          clientHeight: 80,
          scrollWidth: 480,
          scrollHeight: 128,
        },
      }),
    ]),
  );

  assert.equal(report.metrics.scrollOverflowElementCount, 1);
  assert.equal(report.hardGateCandidate, true);
  assert.equal(report.blockingIssues.length, 1);
  assert.equal(report.blockingIssues[0]?.code, "scroll_overflow");
});

test("렌더 품질 리포트는 겹친 텍스트 박스를 blocking으로 표시한다", () => {
  const report = buildV6RenderQualityReport(
    extraction([
      element({ path: "0" }),
      element({
        serial: 1,
        path: "0.0",
        tagName: "span",
        bounds: { left: 80, top: 470, width: 230, height: 54 },
        isTextLeaf: true,
        text: "5월 8일 오후 2시",
        layout: {
          clientWidth: 230,
          clientHeight: 54,
          scrollWidth: 230,
          scrollHeight: 54,
        },
      }),
      element({
        serial: 2,
        path: "0.1",
        tagName: "div",
        bounds: { left: 80, top: 486, width: 270, height: 72 },
        isTextLeaf: true,
        text: "지금 무료 신청하기",
        layout: {
          clientWidth: 270,
          clientHeight: 72,
          scrollWidth: 270,
          scrollHeight: 72,
        },
      }),
    ]),
  );

  assert.equal(report.metrics.textOverlapPairCount, 1);
  assert.equal(report.hardGateCandidate, true);
  assert.equal(report.blockingIssues.length, 1);
  assert.equal(report.blockingIssues[0]?.code, "text_overlap");
  assert.equal(report.blockingIssues[0]?.metrics.otherPath, "0.1");
});

test("렌더 품질 리포트는 부모-자식 경로 텍스트 중복을 overlap으로 보지 않는다", () => {
  const report = buildV6RenderQualityReport(
    extraction([
      element({ path: "0" }),
      element({
        serial: 1,
        path: "0.0",
        tagName: "h1",
        bounds: { left: 80, top: 80, width: 320, height: 80 },
        isTextLeaf: true,
        text: "영업 파이프라인",
        layout: {
          clientWidth: 320,
          clientHeight: 80,
          scrollWidth: 320,
          scrollHeight: 80,
        },
      }),
      element({
        serial: 2,
        path: "0.0.#text0",
        tagName: "#text",
        bounds: { left: 80, top: 80, width: 320, height: 80 },
        isTextLeaf: true,
        text: "영업 파이프라인",
        layout: null,
      }),
    ]),
  );

  assert.equal(report.metrics.textOverlapPairCount, 0);
  assert.equal(report.hardGateCandidate, false);
  assert.equal(report.blockingIssues.length, 0);
});

test("렌더 품질 리포트는 root border-box가 canvas보다 크면 hard gate 후보로 표시한다", () => {
  const report = buildV6RenderQualityReport(
    extraction([
      element({
        path: "0",
        bounds: { left: 0, top: 0, width: 1360, height: 628 },
        layout: {
          clientWidth: 1360,
          clientHeight: 628,
          scrollWidth: 1360,
          scrollHeight: 628,
        },
      }),
    ]),
  );

  assert.equal(report.hardGateCandidate, true);
  assert.equal(report.blockingIssues.length, 1);
  assert.equal(report.metrics.blockingIssueCount, 1);
  assert.equal(report.metrics.hardGateCandidateCount, 1);
  assert.equal(
    report.issues.some((issue) => issue.code === "root_bounds_mismatch"),
    true,
  );
});

test("렌더 품질 리포트는 내용 없는 그라디언트 장식 bleed를 off-canvas로 표시하지 않는다", () => {
  const report = buildV6RenderQualityReport(
    extraction([
      element({
        path: "0",
        style: { ...STYLE, overflow: "hidden" },
        layout: {
          clientWidth: 1200,
          clientHeight: 628,
          scrollWidth: 1300,
          scrollHeight: 628,
        },
      }),
      element({
        serial: 1,
        path: "0.0",
        tagName: "div",
        bounds: { left: 900, top: -100, width: 400, height: 400 },
        style: {
          ...STYLE,
          backgroundImage:
            "radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(10, 25, 47, 0) 70%)",
          borderTopLeftRadius: "50%",
          borderTopRightRadius: "50%",
          borderBottomRightRadius: "50%",
          borderBottomLeftRadius: "50%",
        },
        layout: {
          clientWidth: 400,
          clientHeight: 400,
          scrollWidth: 400,
          scrollHeight: 400,
        },
      }),
    ]),
  );

  assert.equal(report.metrics.offCanvasElementCount, 0);
  assert.equal(report.metrics.scrollOverflowElementCount, 0);
  assert.equal(report.hardGateCandidate, false);
  assert.equal(
    report.issues.some(
      (issue) =>
        issue.code === "off_canvas_element" || issue.code === "scroll_overflow",
    ),
    false,
  );
});

test("렌더 품질 리포트는 일반 non-text off-canvas 요소를 계속 관측한다", () => {
  const report = buildV6RenderQualityReport(
    extraction([
      element({ path: "0" }),
      element({
        serial: 1,
        path: "0.0",
        tagName: "div",
        bounds: { left: 1080, top: 40, width: 180, height: 120 },
        style: {
          ...STYLE,
          backgroundColor: "rgb(226, 232, 240)",
        },
        layout: {
          clientWidth: 180,
          clientHeight: 120,
          scrollWidth: 180,
          scrollHeight: 120,
        },
      }),
    ]),
  );

  assert.equal(report.metrics.offCanvasElementCount, 1);
  assert.equal(report.hardGateCandidate, false);
  assert.equal(
    report.issues.some((issue) => issue.code === "off_canvas_element"),
    true,
  );
});

test("렌더 품질 리포트는 낮은 opacity의 장식 SVG bleed를 off-canvas로 표시하지 않는다", () => {
  const report = buildV6RenderQualityReport(
    extraction([
      element({ path: "0" }),
      element({
        serial: 1,
        path: "0.0",
        tagName: "svg",
        bounds: { left: 950, top: -50, width: 300, height: 300 },
        style: {
          ...STYLE,
          opacity: "0.1",
        },
        svg: { outerHTML: '<svg viewBox="0 0 200 200"></svg>' },
        layout: {
          clientWidth: 300,
          clientHeight: 300,
          scrollWidth: 300,
          scrollHeight: 300,
        },
      }),
    ]),
  );

  assert.equal(report.metrics.offCanvasElementCount, 0);
  assert.equal(report.hardGateCandidate, false);
  assert.equal(
    report.issues.some((issue) => issue.code === "off_canvas_element"),
    false,
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
        layout: {
          clientWidth: 120,
          clientHeight: 120,
          scrollWidth: 120,
          scrollHeight: 120,
        },
      }),
    ]),
  );

  assert.equal(report.metrics.offCanvasElementCount, 1);
  assert.equal(report.hardGateCandidate, false);
  assert.equal(report.blockingIssues.length, 0);
  assert.equal(report.metrics.blockingIssueCount, 0);
  assert.equal(report.metrics.hardGateCandidateCount, 0);
  assert.equal(
    report.issues.some((issue) => issue.code === "off_canvas_element"),
    true,
  );
});

test("렌더 품질 리포트는 0 크기 이미지를 blocking issue로 표시한다", () => {
  const report = buildV6RenderQualityReport(
    extraction([
      element({ path: "0" }),
      element({
        serial: 1,
        path: "0.0",
        tagName: "img",
        bounds: { left: 400, top: 120, width: 0, height: 0 },
        img: {
          src: "placeholder://dog",
          naturalWidth: 0,
          naturalHeight: 0,
          alt: "",
        },
        visible: false,
        layout: {
          clientWidth: 0,
          clientHeight: 0,
          scrollWidth: 0,
          scrollHeight: 0,
        },
      }),
    ]),
  );

  assert.equal(report.hardGateCandidate, true);
  assert.equal(report.blockingIssues.length, 1);
  assert.equal(report.blockingIssues[0]?.code, "zero_area_element");
});

test("렌더 품질 리포트는 텍스트가 이미지 영역과 크게 겹치면 hard gate 후보로 표시한다", () => {
  const report = buildV6RenderQualityReport(
    extraction([
      element({ path: "0" }),
      element({
        serial: 1,
        path: "0.1",
        tagName: "img",
        bounds: { left: 680, top: 100, width: 440, height: 420 },
        img: {
          src: "placeholder://gift-set",
          naturalWidth: 1,
          naturalHeight: 1,
          alt: "",
        },
        layout: {
          clientWidth: 440,
          clientHeight: 420,
          scrollWidth: 440,
          scrollHeight: 420,
        },
      }),
      element({
        serial: 2,
        path: "0.2",
        tagName: "div",
        bounds: { left: 540, top: 190, width: 260, height: 90 },
        isTextLeaf: true,
        text: "프리미엄 선물세트 사전예약",
        layout: {
          clientWidth: 260,
          clientHeight: 90,
          scrollWidth: 260,
          scrollHeight: 90,
        },
      }),
    ]),
  );

  assert.equal(report.hardGateCandidate, true);
  assert.equal(report.metrics.textImageOverlapPairCount, 1);
  assert.equal(
    report.blockingIssues.some((issue) => issue.code === "text_image_overlap"),
    true,
  );
});

test("렌더 품질 리포트는 작은 배지성 text/image overlap을 관측하되 blocking하지 않는다", () => {
  const report = buildV6RenderQualityReport(
    extraction([
      element({ path: "0" }),
      element({
        serial: 1,
        path: "0.1",
        tagName: "img",
        bounds: { left: 240, top: 150, width: 600, height: 600 },
        img: {
          src: "placeholder://product",
          naturalWidth: 1,
          naturalHeight: 1,
          alt: "",
        },
        layout: {
          clientWidth: 600,
          clientHeight: 600,
          scrollWidth: 600,
          scrollHeight: 600,
        },
      }),
      element({
        serial: 2,
        path: "0.2",
        tagName: "div",
        bounds: { left: 780, top: 100, width: 180, height: 180 },
        isTextLeaf: true,
        text: "SEASON\nLIMITED",
        layout: {
          clientWidth: 180,
          clientHeight: 180,
          scrollWidth: 180,
          scrollHeight: 180,
        },
      }),
    ]),
  );

  assert.equal(report.metrics.textImageOverlapPairCount, 1);
  assert.equal(
    report.issues.some((issue) => issue.code === "text_image_overlap"),
    true,
  );
  assert.equal(
    report.blockingIssues.some((issue) => issue.code === "text_image_overlap"),
    false,
  );
});

test("렌더 품질 리포트는 분리된 텍스트와 이미지를 text_image_overlap으로 표시하지 않는다", () => {
  const report = buildV6RenderQualityReport(
    extraction([
      element({ path: "0" }),
      element({
        serial: 1,
        path: "0.1",
        tagName: "img",
        bounds: { left: 700, top: 100, width: 360, height: 360 },
        img: {
          src: "placeholder://product",
          naturalWidth: 1,
          naturalHeight: 1,
          alt: "",
        },
        layout: {
          clientWidth: 360,
          clientHeight: 360,
          scrollWidth: 360,
          scrollHeight: 360,
        },
      }),
      element({
        serial: 2,
        path: "0.2",
        tagName: "div",
        bounds: { left: 80, top: 120, width: 420, height: 100 },
        isTextLeaf: true,
        text: "분리된 안전한 텍스트",
        layout: {
          clientWidth: 420,
          clientHeight: 100,
          scrollWidth: 420,
          scrollHeight: 100,
        },
      }),
    ]),
  );

  assert.equal(report.metrics.textImageOverlapPairCount, 0);
  assert.equal(
    report.issues.some((issue) => issue.code === "text_image_overlap"),
    false,
  );
});

test("렌더 품질 리포트는 배경 이미지 위 텍스트를 text_image_overlap으로 표시하지 않는다", () => {
  const report = buildV6RenderQualityReport(
    extraction([
      element({ path: "0" }),
      element({
        serial: 1,
        path: "0.1",
        tagName: "img",
        bounds: { left: 0, top: 0, width: 1200, height: 628 },
        img: {
          src: "placeholder://background-photo",
          naturalWidth: 1,
          naturalHeight: 1,
          alt: "",
        },
        layout: {
          clientWidth: 1200,
          clientHeight: 628,
          scrollWidth: 1200,
          scrollHeight: 628,
        },
      }),
      element({
        serial: 2,
        path: "0.2",
        tagName: "div",
        bounds: { left: 80, top: 120, width: 420, height: 100 },
        isTextLeaf: true,
        text: "배경 이미지 위 안전한 제목",
        layout: {
          clientWidth: 420,
          clientHeight: 100,
          scrollWidth: 420,
          scrollHeight: 100,
        },
      }),
    ]),
  );

  assert.equal(report.metrics.textImageOverlapPairCount, 0);
  assert.equal(
    report.issues.some((issue) => issue.code === "text_image_overlap"),
    false,
  );
});

test("렌더 품질 재시도 피드백은 geometry 정보만 요약한다", () => {
  const report = buildV6RenderQualityReport(
    extraction([
      element({ path: "0" }),
      element({
        serial: 1,
        path: "0.0",
        tagName: "h1",
        bounds: { left: -12, top: 40, width: 120, height: 80 },
        isTextLeaf: true,
        text: "이 텍스트 내용은 피드백에 들어가면 안 된다",
        layout: {
          clientWidth: 120,
          clientHeight: 80,
          scrollWidth: 220,
          scrollHeight: 120,
        },
      }),
    ]),
  );

  const feedback = formatV6RenderQualityRetryFeedback(report);
  assert.match(feedback, /off_canvas_text/);
  assert.match(feedback, /scroll_overflow/);
  assert.match(feedback, /path=0\.0/);
  assert.match(feedback, /increase text box width\/height/);
  assert.match(feedback, /geometry\/layout safety/);
  assert.match(feedback, /natural phrase boundaries/);
  assert.match(feedback, /Do not hide overflow/);
  assert.doesNotMatch(feedback, /이 텍스트 내용/);
});
