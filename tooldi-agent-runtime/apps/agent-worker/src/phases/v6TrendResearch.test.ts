import assert from "node:assert/strict";
import test from "node:test";

import { formatTrendForHtmlGen } from "./v6TrendResearch.js";

test("formatTrendForHtmlGen turns trend research into execution-oriented design instructions", () => {
  const context = formatTrendForHtmlGen({
    summary: "초여름 카페 음료는 청량한 과즙감과 부드러운 파스텔 대비가 중요하다.",
    palette: ["#FF7F50", "#A2CFFE", "#F0FFF0"],
    typography: {
      weight: "bold display",
      scale: "large headline",
      notes: "expressive but readable",
    },
    composition: "중앙 제품 중심에 반투명 레이어를 겹친다.",
    motifs: ["물방울 맺힌 유리 질감", "3D 복숭아 오브제", "스파클"],
    tone: "청량하고 감각적인 분위기",
    notes: "제품 질감이 약하면 일반 카드처럼 보일 수 있다.",
  });

  assert.match(context, /Design application brief/);
  assert.match(context, /Must express at least two visual cues/);
  assert.match(context, /Primary visual rule/);
  assert.match(context, /placeholder:\/\/ image hints/);
  assert.match(context, /Avoid: a generic flat card/);
  assert.match(context, /물방울 맺힌 유리 질감/);
});
