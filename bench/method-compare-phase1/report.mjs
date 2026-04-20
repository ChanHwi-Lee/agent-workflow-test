// Aggregator: reads grades/summary.json and writes REPORT.md.

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const summaryPath = resolve(__dirname, "grades", "summary.json");
const summary = JSON.parse(await readFile(summaryPath, "utf8"));

function stats(nums) {
  const arr = nums.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (arr.length === 0) return { n: 0, mean: null, median: null, p95: null, min: null, max: null };
  const sum = arr.reduce((a, b) => a + b, 0);
  const mean = sum / arr.length;
  const median = arr[Math.floor(arr.length / 2)];
  const p95 = arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.95))];
  return { n: arr.length, mean, median, p95, min: arr[0], max: arr[arr.length - 1] };
}

function fmt(v, digits = 1) {
  if (v == null) return "n/a";
  if (!Number.isFinite(v)) return String(v);
  return v.toFixed(digits);
}

function aggregateMethod(label, grades) {
  const total = grades.length;
  const successfulCalls = grades.filter((g) => g.callOk).length;

  const checkNames =
    total > 0 ? Object.keys(grades[0].checks) : [];
  const passCounts = {};
  for (const name of checkNames) {
    passCounts[name] = grades.filter((g) => g.checks[name] === true).length;
  }

  const avgRatio =
    grades.length > 0
      ? grades.reduce((s, g) => s + (g.scorecard?.ratio ?? 0), 0) / grades.length
      : 0;

  const latencyStats = stats(grades.map((g) => g.latencyMs));
  const bytesStats = stats(grades.map((g) => g.outputBytes));
  const inputTokStats = stats(grades.map((g) => g.promptTokenCount));
  const outputTokStats = stats(grades.map((g) => g.candidatesTokenCount));
  const elementCountStats = stats(grades.map((g) => g.elementCount));

  return {
    label,
    total,
    successfulCalls,
    checkNames,
    passCounts,
    avgRatio,
    latencyStats,
    bytesStats,
    inputTokStats,
    outputTokStats,
    elementCountStats,
  };
}

function pickFailureSamples(grades, k = 3) {
  const failed = grades.filter(
    (g) => !g.callOk || (g.scorecard && g.scorecard.passed < g.scorecard.total)
  );
  return failed.slice(0, k);
}

function renderTable(header, rows) {
  const head = `| ${header.join(" | ")} |`;
  const sep = `| ${header.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return [head, sep, body].join("\n");
}

const aGrades = summary.methods["method-a"] ?? [];
const bGrades = summary.methods["method-b"] ?? [];

const aAgg = aggregateMethod("method-a", aGrades);
const bAgg = aggregateMethod("method-b", bGrades);

function pctRow(agg, name) {
  const passN = agg.passCounts[name] ?? 0;
  const rate = agg.total > 0 ? (passN / agg.total) * 100 : 0;
  return [name, `${passN}/${agg.total} (${fmt(rate, 0)}%)`];
}

const aCheckRows = (aAgg.checkNames ?? []).map((n) => pctRow(aAgg, n));
const bCheckRows = (bAgg.checkNames ?? []).map((n) => pctRow(bAgg, n));

const latencyRows = [
  ["method-a", ...["mean", "median", "p95", "min", "max"].map((k) => fmt(aAgg.latencyStats[k], 0))],
  ["method-b", ...["mean", "median", "p95", "min", "max"].map((k) => fmt(bAgg.latencyStats[k], 0))],
];
const bytesRows = [
  ["method-a", ...["mean", "median", "p95", "min", "max"].map((k) => fmt(aAgg.bytesStats[k], 0))],
  ["method-b", ...["mean", "median", "p95", "min", "max"].map((k) => fmt(bAgg.bytesStats[k], 0))],
];
const outTokRows = [
  ["method-a", ...["mean", "median", "p95", "min", "max"].map((k) => fmt(aAgg.outputTokStats[k], 0))],
  ["method-b", ...["mean", "median", "p95", "min", "max"].map((k) => fmt(bAgg.outputTokStats[k], 0))],
];
const inTokRows = [
  ["method-a", ...["mean", "median", "p95", "min", "max"].map((k) => fmt(aAgg.inputTokStats[k], 0))],
  ["method-b", ...["mean", "median", "p95", "min", "max"].map((k) => fmt(bAgg.inputTokStats[k], 0))],
];
const elementCountRows = [
  ["method-a", ...["mean", "median", "p95", "min", "max"].map((k) => fmt(aAgg.elementCountStats[k], 1))],
  ["method-b", ...["mean", "median", "p95", "min", "max"].map((k) => fmt(bAgg.elementCountStats[k], 1))],
];

const aWeighted = (aAgg.avgRatio * 100).toFixed(1);
const bWeighted = (bAgg.avgRatio * 100).toFixed(1);
const winner = aAgg.avgRatio === bAgg.avgRatio ? "tie" : aAgg.avgRatio > bAgg.avgRatio ? "A" : "B";
const winnerRate = Math.max(aAgg.avgRatio, bAgg.avgRatio) * 100;
const loserRate = Math.min(aAgg.avgRatio, bAgg.avgRatio) * 100;
const deltaWeighted = Math.abs(aAgg.avgRatio - bAgg.avgRatio) * 100;

// failure samples
function renderFailureSample(g) {
  return [
    `- **${g.id}** (${g.domain}) — callOk=${g.callOk} ratio=${fmt((g.scorecard?.ratio ?? 0) * 100, 0)}%`,
    g.failureReasons?.length
      ? `  reasons: ${g.failureReasons.slice(0, 6).join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const aFails = pickFailureSamples(aGrades).map(renderFailureSample).join("\n\n");
const bFails = pickFailureSamples(bGrades).map(renderFailureSample).join("\n\n");

const md = `# Method-Compare Phase-1 Report

Generated: ${summary.generatedAt}
Model: gemini-2.5-pro (temperature 0.2, top_p 0.95)
Canvas: 1200 x 628
Prompts: ${aAgg.total}

## Pass-rate summary (weighted average of format checks)

- Method A (native JSON): **${aWeighted}%** (call_ok=${aAgg.successfulCalls}/${aAgg.total})
- Method B (constrained HTML): **${bWeighted}%** (call_ok=${bAgg.successfulCalls}/${bAgg.total})
- Delta (A - B): **${(aAgg.avgRatio - bAgg.avgRatio) * 100 >= 0 ? "+" : ""}${fmt((aAgg.avgRatio - bAgg.avgRatio) * 100, 1)}pp**

## Per-metric pass rates (only metrics applicable to each method)

### Method A — JSON format checks
${renderTable(["metric", "pass rate"], aCheckRows)}

### Method B — HTML format checks
${renderTable(["metric", "pass rate"], bCheckRows)}

## Latency (ms)

${renderTable(["method", "mean", "median", "p95", "min", "max"], latencyRows)}

## Output size (bytes)

${renderTable(["method", "mean", "median", "p95", "min", "max"], bytesRows)}

## Input tokens (prompt)

${renderTable(["method", "mean", "median", "p95", "min", "max"], inTokRows)}

## Output tokens (candidate)

${renderTable(["method", "mean", "median", "p95", "min", "max"], outTokRows)}

## Element count

${renderTable(["method", "mean", "median", "p95", "min", "max"], elementCountRows)}

## Failure samples

### Method A failures (first 3)
${aFails || "_no failures_"}

### Method B failures (first 3)
${bFails || "_no failures_"}

## Conclusion

Gemini 2.5 Pro zero-shot 기준, format-level 합격률은 Method ${winner === "tie" ? "동률" : winner} 가 ${fmt(winnerRate, 1)}% (vs ${fmt(loserRate, 1)}%, Δ ${fmt(deltaWeighted, 1)}pp) 우세.

## Limitations

- 자동 채점은 format-only (JSON parse / schema / bounds / DOM grammar / CSS whitelist / placeholder annotation / element count).
- **시각 품질(디자인 완성도)는 이 수치에 반영되지 않음.** 사람이 outputs/method-a, outputs/method-b 안의 원본을 직접 열어 확인 필요.
- 20 prompts × 1 sample/prompt. temperature 0.2 이므로 variance 제한적.
`;

const reportPath = resolve(__dirname, "REPORT.md");
await writeFile(reportPath, md, "utf8");

console.log(`[report] wrote ${reportPath}`);
console.log(
  `[report] A=${aWeighted}% (${aAgg.successfulCalls}/${aAgg.total} ok)  B=${bWeighted}% (${bAgg.successfulCalls}/${bAgg.total} ok)  winner=${winner}`
);
