// M3 smoke — seed 하나로 generateInterview 를 돌려 Q 생성 + 자동 답변 +
// derived_brief 가 정상 반환되는지 확인한다. 스크린샷 생성은 없음.

import { V6_DEFAULT_MODEL } from "./lib/agentWorkerImports.js";
import { requireGoogleApiKey } from "./lib/env.js";
import { generateInterview } from "./lib/interview.js";
import { loadSeeds } from "./lib/seeds.js";

async function main(): Promise<void> {
  const apiKey = requireGoogleApiKey();
  const seeds = await loadSeeds();
  const seed = seeds[0]!; // banner
  console.log(`[smoke-interview] seed=${seed.id} "${seed.prompt}"`);
  console.log(
    `[smoke-interview] canvas=${seed.canvas.width}x${seed.canvas.height} model=${V6_DEFAULT_MODEL}`,
  );

  const result = await generateInterview({
    apiKey,
    model: V6_DEFAULT_MODEL,
    prompt: seed.prompt,
    canvas: seed.canvas,
  });

  console.log(`\n=== QUESTIONS (${result.questions.length}) ===`);
  for (const q of result.questions) {
    console.log(` - [${q.type}] ${q.id}: ${q.title}`);
    if (q.choices) for (const c of q.choices) console.log(`     • ${c}`);
    if (q.allow_other) console.log("     (기타 자유입력 허용)");
    if (q.rationale) console.log(`     ※ ${q.rationale}`);
  }

  console.log(`\n=== ANSWERS (${result.answers.length}) ===`);
  for (const a of result.answers) {
    const val = a.values && a.values.length > 0 ? a.values.join(", ") : (a.value ?? "");
    console.log(` - ${a.id}: ${val}${a.is_other ? " [기타]" : ""}`);
  }

  console.log("\n=== DERIVED BRIEF ===");
  console.log(result.context.derived_brief);

  console.log("\n=== TIMINGS ===");
  console.log(`  questions: ${result.timings.genQuestionsMs}ms`);
  console.log(`  answers:   ${result.timings.genAnswersMs}ms`);
  console.log(`  brief:     ${result.timings.genBriefMs}ms`);
  console.log(`  total:     ${result.timings.totalMs}ms`);

  // sanity checks
  const issues: string[] = [];
  if (result.questions.length === 0) issues.push("questions=empty");
  if (result.questions.length > 5) issues.push("questions>5");
  if (result.answers.length !== result.questions.length)
    issues.push(
      `answers/questions mismatch ${result.answers.length} vs ${result.questions.length}`,
    );
  if (!result.context.derived_brief || result.context.derived_brief.trim().length < 20)
    issues.push("derived_brief too short");

  if (issues.length > 0) {
    console.error(`\n[smoke-interview] FAIL: ${issues.join("; ")}`);
    process.exit(1);
  }
  console.log("\n[smoke-interview] OK");
}

main().catch((e) => {
  console.error("[smoke-interview] FATAL", e);
  process.exit(1);
});
