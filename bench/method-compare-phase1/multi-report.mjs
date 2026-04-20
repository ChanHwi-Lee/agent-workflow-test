// Multi-model aggregator: reads grades*/summary.json for every configured model
// and emits MULTI_MODEL_REPORT.md with pass-rate, latency, token and cost rollups.

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Models under comparison. Keep order = reporting order.
// Prices are *approximate* per Google's published tiers (listed below). Some
// Gemini-3 preview pricing is not finalized, so treat as estimates only.
//
//   - gemini-2.5-pro         : $1.25 / 1M input,  $10.00 / 1M output   (thinking included)
//   - gemini-3.1-pro-preview : $2.50 / 1M input,  $15.00 / 1M output   (ESTIMATE)
//   - gemini-3-pro-preview   : $1.25 / 1M input,  $10.00 / 1M output   (ESTIMATE)
//   - gemini-3-flash-preview : $0.30 / 1M input,  $2.50  / 1M output   (ESTIMATE)
//   - gemini-3.1-flash-lite-preview : $0.10 / 1M input, $0.40 / 1M output  (ESTIMATE)
//
// Thinking tokens are counted as output tokens for Google Gemini (per public docs),
// so we include thoughtsTokenCount in output-cost accounting.
const MODELS = [
  {
    alias: "2.5-pro",
    modelId: "gemini-2.5-pro",
    gradesSubdir: "grades",
    price: { inPerM: 1.25, outPerM: 10.0 },
  },
  {
    alias: "3-pro",
    modelId: "gemini-3-pro-preview",
    gradesSubdir: "grades-3-pro",
    price: { inPerM: 1.25, outPerM: 10.0 },
  },
  {
    alias: "3.1-pro",
    modelId: "gemini-3.1-pro-preview",
    gradesSubdir: "grades-3.1-pro",
    price: { inPerM: 2.5, outPerM: 15.0 },
  },
  {
    alias: "3-flash",
    modelId: "gemini-3-flash-preview",
    gradesSubdir: "grades-3-flash",
    price: { inPerM: 0.3, outPerM: 2.5 },
  },
  {
    alias: "3.1-flash-lite",
    modelId: "gemini-3.1-flash-lite-preview",
    gradesSubdir: "grades-3.1-flash-lite",
    price: { inPerM: 0.1, outPerM: 0.4 },
  },
];

function median(arr) {
  const a = arr.filter((x) => Number.isFinite(x)).slice().sort((x, y) => x - y);
  if (a.length === 0) return null;
  return a[Math.floor(a.length / 2)];
}
function mean(arr) {
  const a = arr.filter((x) => Number.isFinite(x));
  if (a.length === 0) return null;
  return a.reduce((s, v) => s + v, 0) / a.length;
}
function sum(arr) {
  return arr.filter((x) => Number.isFinite(x)).reduce((s, v) => s + v, 0);
}

function fmt(v, digits = 1) {
  if (v == null || !Number.isFinite(v)) return "n/a";
  return v.toFixed(digits);
}

function aggregateGrades(grades, price) {
  if (grades.length === 0) {
    return { n: 0, passRate: null, latencyMedian: null, costPer20: null, costPerPrompt: null, inTokSum: 0, outTokSum: 0, thoughtSum: 0 };
  }
  const passRate =
    grades.reduce((s, g) => s + (g.scorecard?.ratio ?? 0), 0) / grades.length;
  const lat = median(grades.map((g) => g.latencyMs));
  const inTok = sum(grades.map((g) => g.promptTokenCount ?? 0));
  const outTokCand = sum(grades.map((g) => g.candidatesTokenCount ?? 0));
  const thought = sum(grades.map((g) => g.thoughtsTokenCount ?? 0));
  const outTok = outTokCand + thought; // thinking counted as output in billing
  const costPer20 = (inTok / 1e6) * price.inPerM + (outTok / 1e6) * price.outPerM;
  return {
    n: grades.length,
    passRate,
    latencyMedian: lat,
    costPer20,
    costPerPrompt: costPer20 / grades.length,
    inTokSum: inTok,
    outTokSum: outTokCand,
    thoughtSum: thought,
    outputBillable: outTok,
  };
}

function countCheckPass(grades, checkName) {
  const applicable = grades.filter((g) => g.checks && checkName in g.checks);
  if (applicable.length === 0) return null;
  const p = applicable.filter((g) => g.checks[checkName] === true).length;
  return { p, total: applicable.length };
}

function dedupeFailureReasons(grades) {
  const counts = new Map();
  for (const g of grades) {
    for (const r of g.failureReasons ?? []) {
      const key = r.split(":")[0];
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function renderTable(header, rows) {
  const head = `| ${header.join(" | ")} |`;
  const sep = `| ${header.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return [head, sep, body].join("\n");
}

// --- load summaries ---
const loaded = [];
for (const m of MODELS) {
  const path = resolve(__dirname, m.gradesSubdir, "summary.json");
  if (!existsSync(path)) {
    console.warn(`[multi-report] MISSING ${path} — skipping ${m.alias}`);
    continue;
  }
  const s = JSON.parse(await readFile(path, "utf8"));
  loaded.push({
    ...m,
    a: s.methods["method-a"] ?? [],
    b: s.methods["method-b"] ?? [],
  });
}

if (loaded.length === 0) {
  console.error("[multi-report] no grades found. Run grade.mjs for each model first.");
  process.exit(1);
}

// --- tables ---
const overviewHeader = [
  "alias",
  "modelId",
  "A pass%",
  "B pass%",
  "A med-lat(s)",
  "B med-lat(s)",
  "A $/20p",
  "B $/20p",
  "A $/p",
  "B $/p",
];
const overviewRows = [];
const methodAStats = [];
const methodBStats = [];

for (const m of loaded) {
  const aStat = aggregateGrades(m.a, m.price);
  const bStat = aggregateGrades(m.b, m.price);
  methodAStats.push({ alias: m.alias, ...aStat });
  methodBStats.push({ alias: m.alias, ...bStat });
  overviewRows.push([
    m.alias,
    `\`${m.modelId}\``,
    aStat.passRate == null ? "n/a" : fmt(aStat.passRate * 100, 1),
    bStat.passRate == null ? "n/a" : fmt(bStat.passRate * 100, 1),
    aStat.latencyMedian == null ? "n/a" : fmt(aStat.latencyMedian / 1000, 2),
    bStat.latencyMedian == null ? "n/a" : fmt(bStat.latencyMedian / 1000, 2),
    aStat.costPer20 == null ? "n/a" : "$" + fmt(aStat.costPer20, 4),
    bStat.costPer20 == null ? "n/a" : "$" + fmt(bStat.costPer20, 4),
    aStat.costPerPrompt == null ? "n/a" : "$" + fmt(aStat.costPerPrompt, 5),
    bStat.costPerPrompt == null ? "n/a" : "$" + fmt(bStat.costPerPrompt, 5),
  ]);
}

// token table
const tokenRows = [];
for (const m of loaded) {
  const aStat = aggregateGrades(m.a, m.price);
  const bStat = aggregateGrades(m.b, m.price);
  tokenRows.push([
    m.alias,
    `A: in=${aStat.inTokSum} / out=${aStat.outTokSum} / thought=${aStat.thoughtSum}`,
    `B: in=${bStat.inTokSum} / out=${bStat.outTokSum} / thought=${bStat.thoughtSum}`,
  ]);
}

// per-check table (% per model, each method)
const checkNamesA = Object.keys(loaded[0].a[0]?.checks ?? {});
const checkNamesB = Object.keys(loaded[0].b[0]?.checks ?? {});

const checkATable = [];
for (const m of loaded) {
  const row = [m.alias];
  for (const c of checkNamesA) {
    const v = countCheckPass(m.a, c);
    row.push(v ? `${v.p}/${v.total}` : "n/a");
  }
  checkATable.push(row);
}
const checkBTable = [];
for (const m of loaded) {
  const row = [m.alias];
  for (const c of checkNamesB) {
    const v = countCheckPass(m.b, c);
    row.push(v ? `${v.p}/${v.total}` : "n/a");
  }
  checkBTable.push(row);
}

// --- Pareto frontier (best cost/pass/latency for each method) ---
function paretoFront(stats) {
  const points = stats.filter((s) => s.passRate != null && s.costPer20 != null);
  const front = [];
  for (const p of points) {
    const dominated = points.some(
      (q) =>
        q !== p &&
        q.passRate >= p.passRate &&
        q.costPer20 <= p.costPer20 &&
        q.latencyMedian <= p.latencyMedian &&
        (q.passRate > p.passRate ||
          q.costPer20 < p.costPer20 ||
          q.latencyMedian < p.latencyMedian)
    );
    if (!dominated) front.push(p);
  }
  return front.sort((a, b) => a.costPer20 - b.costPer20);
}

function bestValue(stats) {
  // "value" = passRate / costPer20 (higher = better gasungbi)
  let best = null;
  for (const s of stats) {
    if (s.passRate == null || !s.costPer20) continue;
    const score = s.passRate / s.costPer20;
    if (!best || score > best.score) best = { ...s, score };
  }
  return best;
}

const aFront = paretoFront(methodAStats);
const bFront = paretoFront(methodBStats);
const aBestValue = bestValue(methodAStats);
const bBestValue = bestValue(methodBStats);

// --- failure reason tallies ---
const failureTables = [];
for (const m of loaded) {
  const aR = dedupeFailureReasons(m.a).slice(0, 5);
  const bR = dedupeFailureReasons(m.b).slice(0, 5);
  failureTables.push({
    alias: m.alias,
    a: aR,
    b: bR,
  });
}

// --- render markdown ---
const md = `# Multi-Model Method-Compare Report (Phase-1 extended)

Generated: ${new Date().toISOString()}
Canvas: 1200 x 628 · Prompts: 20 · temperature=0.2 top_p=0.95 · concurrency per-run 2-3 · retries 2

## 1. Overview (per-model, per-method)

${renderTable(overviewHeader, overviewRows)}

> pass% = weighted average of format checks (ratio across metrics).
> $/20p = estimated API cost for all 20 prompts of that method (input + output + thinking billed as output).
> Prices are **approximations** — confirm current Gemini tariffs before relying on absolute figures.

## 2. Token totals (20 prompts per cell)

${renderTable(["alias", "Method A", "Method B"], tokenRows)}

## 3. Per-check pass rates (Method A — JSON format)

${renderTable(["alias", ...checkNamesA], checkATable)}

## 4. Per-check pass rates (Method B — HTML format)

${renderTable(["alias", ...checkNamesB], checkBTable)}

## 5. Cost / Quality / Latency (gasungbi plot)

### Method A (native JSON)
${renderTable(
  ["alias", "cost $/20p", "pass %", "median latency s"],
  methodAStats
    .filter((s) => s.passRate != null)
    .map((s) => [
      s.alias,
      "$" + fmt(s.costPer20, 4),
      fmt(s.passRate * 100, 1),
      fmt(s.latencyMedian / 1000, 2),
    ])
)}

**Pareto frontier A** (non-dominated on cost, pass, latency):  ${aFront.length ? aFront.map((x) => x.alias).join(" → ") : "none"}

**Best gasungbi A (pass%/$20p)**: ${aBestValue ? `${aBestValue.alias} — ${fmt(aBestValue.passRate * 100, 1)}% at $${fmt(aBestValue.costPer20, 4)}` : "n/a"}

### Method B (constrained HTML)
${renderTable(
  ["alias", "cost $/20p", "pass %", "median latency s"],
  methodBStats
    .filter((s) => s.passRate != null)
    .map((s) => [
      s.alias,
      "$" + fmt(s.costPer20, 4),
      fmt(s.passRate * 100, 1),
      fmt(s.latencyMedian / 1000, 2),
    ])
)}

**Pareto frontier B** (non-dominated):  ${bFront.length ? bFront.map((x) => x.alias).join(" → ") : "none"}

**Best gasungbi B (pass%/$20p)**: ${bBestValue ? `${bBestValue.alias} — ${fmt(bBestValue.passRate * 100, 1)}% at $${fmt(bBestValue.costPer20, 4)}` : "n/a"}

## 6. Failure patterns (top 5 reason keys per model)

${failureTables
  .map(
    (ft) => `### ${ft.alias}
- Method A: ${ft.a.length ? ft.a.map(([k, v]) => `\`${k}\`×${v}`).join(", ") : "clean"}
- Method B: ${ft.b.length ? ft.b.map(([k, v]) => `\`${k}\`×${v}`).join(", ") : "clean"}`
  )
  .join("\n\n")}

## 7. Conclusions

- **Method A (native JSON) — 가성비 최적 모델**: \`${aBestValue?.alias ?? "n/a"}\` (pass ${aBestValue ? fmt(aBestValue.passRate * 100, 1) : "n/a"}% @ $${aBestValue ? fmt(aBestValue.costPer20, 4) : "n/a"}/20p).
- **Method B (constrained HTML) — 가성비 최적 모델**: \`${bBestValue?.alias ?? "n/a"}\` (pass ${bBestValue ? fmt(bBestValue.passRate * 100, 1) : "n/a"}% @ $${bBestValue ? fmt(bBestValue.costPer20, 4) : "n/a"}/20p).

## 8. Caveats

- Automated scoring is **format-only**: JSON shape / bounds / DOM grammar / CSS whitelist / placeholder annotation / element count. **Visual design quality is NOT measured** and cannot be reliably diffed between 2.5-pro → 3-pro → 3.1-pro without human review (use \`viewer-multi.html\`).
- A 2.5→3→3.1 "visible quality jump" may exist in design harmony, layering, typography, copy cadence, yet be invisible to format-level graders. Compare side-by-side in the viewer before concluding.
- Preview model pricing is estimated; update \`MODELS[*].price\` in multi-report.mjs once Google publishes final numbers.
- Single sample per prompt @ T=0.2 — variance bounded but not zero.
- Thinking tokens (\`thoughtsTokenCount\`) are included in output-side cost accounting to reflect actual billing.
`;

const outPath = resolve(__dirname, "MULTI_MODEL_REPORT.md");
await writeFile(outPath, md, "utf8");

console.log(`[multi-report] wrote ${outPath}`);
for (const m of loaded) {
  const aStat = aggregateGrades(m.a, m.price);
  const bStat = aggregateGrades(m.b, m.price);
  console.log(
    `[multi-report] ${m.alias.padEnd(16)} A pass=${fmt((aStat.passRate ?? 0) * 100, 1)}% $${fmt(aStat.costPer20 ?? 0, 4)}/20p  B pass=${fmt((bStat.passRate ?? 0) * 100, 1)}% $${fmt(bStat.costPer20 ?? 0, 4)}/20p`
  );
}
