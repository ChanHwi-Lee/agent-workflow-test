// M1 smoke — agent-worker dist 에서 v6 노드들이 상대 경로로 정상 import 되는지,
// 그리고 경량 gemini caller 가 모듈 차원에서 로드되는지만 확인한다.
// 실제 API 호출은 없다 (GOOGLE_API_KEY 불요).

import {
  V6_DEFAULT_MODEL,
  runV6HtmlGen,
  renderAndExtract,
  launchEphemeralBrowser,
  extractFromPage,
  stripMarkdownFences,
  buildV6UserMessage,
} from "./lib/agentWorkerImports.js";

import { callGeminiJson, GeminiJsonError } from "./lib/gemini.js";

const checks: Array<[string, boolean, unknown?]> = [];

checks.push([
  "V6_DEFAULT_MODEL === 'gemini-3.1-flash-lite-preview'",
  V6_DEFAULT_MODEL === "gemini-3.1-flash-lite-preview",
  V6_DEFAULT_MODEL,
]);
checks.push(["runV6HtmlGen is function", typeof runV6HtmlGen === "function"]);
checks.push([
  "renderAndExtract is function",
  typeof renderAndExtract === "function",
]);
checks.push([
  "extractFromPage is function",
  typeof extractFromPage === "function",
]);
checks.push([
  "launchEphemeralBrowser is function",
  typeof launchEphemeralBrowser === "function",
]);
checks.push([
  "stripMarkdownFences roundtrip",
  stripMarkdownFences("```html\n<div>x</div>\n```") === "<div>x</div>",
]);
checks.push([
  "buildV6UserMessage includes canvas size",
  buildV6UserMessage({
    canvasWidth: 1200,
    canvasHeight: 628,
    userPrompt: "hello",
  }).includes("1200px × 628px"),
]);
checks.push(["callGeminiJson is function", typeof callGeminiJson === "function"]);
checks.push([
  "GeminiJsonError is a class",
  typeof GeminiJsonError === "function" &&
    new GeminiJsonError("t", 500, null) instanceof Error,
]);

let failed = 0;
for (const [name, ok, detail] of checks) {
  const mark = ok ? "PASS" : "FAIL";
  if (!ok) failed++;
  console.log(
    `[smoke] ${mark} — ${name}${!ok && detail !== undefined ? ` (got: ${JSON.stringify(detail)})` : ""}`,
  );
}

if (failed > 0) {
  console.error(`[smoke] ${failed} check(s) failed`);
  process.exit(1);
}
console.log("[smoke] ALL OK");
