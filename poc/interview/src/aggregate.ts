import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface ScoreEntry {
  readonly tsA: string;
  readonly tsB: string;
  readonly seedId: string;
  readonly runIdx: string;
  readonly axesA: Record<string, number>;
  readonly axesB: Record<string, number>;
  readonly comment: string;
  readonly savedAt: string;
}

const AXES = ["intent", "specificity", "consistency", "editEase"] as const;
type Axis = (typeof AXES)[number];

const AXIS_LABEL: Record<Axis, string> = {
  intent: "의도 반영도",
  specificity: "구체성",
  consistency: "일관성",
  editEase: "편집 불필요도(5=손 안대도 됨)",
};

const PASS_THRESHOLD = 0.5;

function pocRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..");
}

async function findTsBAuto(): Promise<string> {
  const runsDir = resolve(pocRoot(), "runs");
  const entries = await readdir(runsDir);
  const cand: Array<{ ts: string; mtime: number }> = [];
  for (const ts of entries) {
    const sp = resolve(runsDir, ts, "scores.json");
    try {
      const st = await stat(sp);
      cand.push({ ts, mtime: st.mtimeMs });
    } catch {
      // ignore
    }
  }
  cand.sort((a, b) => b.mtime - a.mtime);
  if (cand.length === 0) throw new Error("no scores.json found under runs/");
  return cand[0]!.ts;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return Number.NaN;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function fmt(x: number): string {
  return Number.isFinite(x) ? x.toFixed(2) : "—";
}

function fmtDiff(x: number): string {
  if (!Number.isFinite(x)) return "—";
  const sign = x >= 0 ? "+" : "";
  return `${sign}${x.toFixed(2)}`;
}

interface AxisAgg {
  A: number;
  B: number;
  diff: number;
}

function aggBlock(entries: ScoreEntry[]): Record<Axis, AxisAgg> {
  const out: Record<string, AxisAgg> = {};
  for (const ax of AXES) {
    const aVals = entries
      .map((e) => e.axesA[ax])
      .filter((v): v is number => typeof v === "number");
    const bVals = entries
      .map((e) => e.axesB[ax])
      .filter((v): v is number => typeof v === "number");
    const A = avg(aVals);
    const B = avg(bVals);
    out[ax] = { A, B, diff: B - A };
  }
  return out as Record<Axis, AxisAgg>;
}

function tableRows(agg: Record<Axis, AxisAgg>): string[] {
  return AXES.map(
    (ax) =>
      `| ${AXIS_LABEL[ax]} | ${fmt(agg[ax].A)} | ${fmt(agg[ax].B)} | ${fmtDiff(agg[ax].diff)} |`,
  );
}

async function main(): Promise<void> {
  const tsB = process.env.TS_B ?? (await findTsBAuto());
  const scoresPath = resolve(pocRoot(), "runs", tsB, "scores.json");
  const text = await readFile(scoresPath, "utf-8");
  const scores: ScoreEntry[] = JSON.parse(text);
  if (scores.length === 0) throw new Error("scores.json is empty");

  const tsA = scores[0]!.tsA;

  // 그룹화
  const bySeed = new Map<string, ScoreEntry[]>();
  for (const s of scores) {
    if (!bySeed.has(s.seedId)) bySeed.set(s.seedId, []);
    bySeed.get(s.seedId)!.push(s);
  }

  const totalAgg = aggBlock(scores);
  const seedAggs = Array.from(bySeed.entries()).map(([seedId, entries]) => ({
    seedId,
    n: entries.length,
    agg: aggBlock(entries),
  }));

  const passedAxes = AXES.filter(
    (ax) => totalAgg[ax].diff >= PASS_THRESHOLD,
  );
  const verdict = passedAxes.length === AXES.length ? "PASS" : "FAIL";

  // Markdown 빌드
  const lines: string[] = [];
  lines.push("# Interview HITL PoC — Evaluation Report");
  lines.push("");
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push(`- A set (no interview): \`${tsA}\``);
  lines.push(`- B set (interview):    \`${tsB}\``);
  lines.push(`- Pairs evaluated: ${scores.length}`);
  lines.push(
    `- Pass criterion: B − A ≥ ${PASS_THRESHOLD.toFixed(1)} across all ${AXES.length} axes`,
  );
  lines.push("");
  lines.push("## Total averages");
  lines.push("");
  lines.push("| Axis | A | B | Δ (B − A) |");
  lines.push("|---|---:|---:|---:|");
  for (const r of tableRows(totalAgg)) lines.push(r);
  lines.push("");
  lines.push("## Verdict");
  lines.push("");
  lines.push(
    `**${verdict}** — ${passedAxes.length}/${AXES.length} axes met threshold (${passedAxes.map((a) => AXIS_LABEL[a]).join(", ") || "none"}).`,
  );
  lines.push("");

  lines.push("## Per-seed breakdown");
  lines.push("");
  for (const sa of seedAggs) {
    lines.push(`### ${sa.seedId} (n=${sa.n})`);
    lines.push("");
    lines.push("| Axis | A | B | Δ |");
    lines.push("|---|---:|---:|---:|");
    for (const r of tableRows(sa.agg)) lines.push(r);
    lines.push("");
  }

  // 코멘트
  const withComments = scores.filter((s) => s.comment && s.comment.trim() !== "");
  if (withComments.length > 0) {
    lines.push("## Comments");
    lines.push("");
    lines.push("| seed | runIdx | comment |");
    lines.push("|---|---|---|");
    for (const s of withComments) {
      const safe = s.comment.replace(/\|/g, "\\|").replace(/\n/g, " ");
      lines.push(`| ${s.seedId} | ${s.runIdx} | ${safe} |`);
    }
    lines.push("");
  }

  const reportPath = resolve(pocRoot(), "runs", tsB, "REPORT.md");
  await writeFile(reportPath, lines.join("\n"), "utf-8");

  // 콘솔 요약
  console.log(`[aggregate] tsA=${tsA}`);
  console.log(`[aggregate] tsB=${tsB}`);
  console.log(`[aggregate] pairs=${scores.length}`);
  console.log("");
  console.log("총 평균:");
  for (const ax of AXES) {
    const a = totalAgg[ax];
    console.log(
      `  ${AXIS_LABEL[ax].padEnd(28, " ")}  A=${fmt(a.A)}  B=${fmt(a.B)}  Δ=${fmtDiff(a.diff)}`,
    );
  }
  console.log("");
  console.log(`판정: ${verdict} (${passedAxes.length}/${AXES.length} axes ≥ +${PASS_THRESHOLD})`);
  console.log(`리포트: ${reportPath}`);
}

main().catch((e) => {
  console.error("[aggregate] FATAL", e);
  process.exit(1);
});
