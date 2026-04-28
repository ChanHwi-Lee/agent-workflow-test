<!-- generated: 2026-04-28 -->

# Agent Workflow PR 1 Baseline Lock Evidence

## Scope
- PR: Agent Workflow Legacy Cleanup PR 1, baseline lock only.
- Runtime workdir: `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime`.
- Evidence log dir: `/tmp/tooldi-agent-runtime-pr1-baseline-20260428`.
- No PR 2/3 deletion, graph pruning, legacy file removal, or behavior change was performed.

## Automated Baseline Locks
- `apps/agent-worker/src/jobs/processRunJob.test.ts`
  - Locks `object_native_v1` onto the v6 route with deterministic v6 overrides.
  - Asserts `planSchemaVersion === "v6-freeform-layout"`, operation `v6_apply_freeform_layout`, and tool `v6-freeform-layout-pipeline`.
  - Asserts the run emits exactly two mutations: one all-`createLayer` envelope and one all-`saveTemplate` envelope.
  - Asserts both mutation IDs are awaited in order, the run finalizes as `completed`, and finalize includes the latest save receipt id.
  - Asserts legacy build/refinement outputs, artifact refs, and persisted artifact filenames are absent, including template prior, rule judge, execution scene summary, judge plan, and refine decision artifacts.
  - This fails if the current v6 path re-enters legacy build/refinement outputs or emits refinement patch mutations.
- `apps/agent-worker/src/jobs/processRunJob.test.ts`
  - Locks trend ON plus debug HTML preview on the same v6 route.
  - Uses a stub trend researcher and debug HTML fetch stub.
  - Asserts trend research is called once, run finalizes as `completed`, legacy build/refinement outputs remain absent, and `v6-trend-brief.json`, `debug-v6-html.json`, and `debug-unrestricted-html.json` are persisted and loadable.
- `apps/agent-worker/src/testFixtures/processRunJobFixtures.ts`
  - Holds the slimmed process-run test harness, deterministic v6 overrides, recording callback client, object-store tracker, and legacy build/refinement absence assertion.
- `apps/agent-api/src/app.test.ts`
  - Adds public cancel route coverage proving an active run records `run.cancel_requested` with the caller reason.

## Coverage Matrix
- Trend OFF: worker `object_native_v1` v6 baseline test.
- Trend ON: worker trend/debug preview v6 test.
- Debug HTML preview artifact load: worker trend/debug preview v6 test.
- Interview answer/resume: existing API tests in `apps/agent-api/src/app.test.ts` passed in this run.
- SSE stream: existing `SSE backlog replay uses event repository offsets with Last-Event-ID` API test passed in this run.
- Create-layer mutation ack: worker v6 baseline test and `pnpm smoke:object-native`.
- Save mutation ack: worker v6 baseline test and `pnpm smoke:object-native`.
- Finalize: worker v6 baseline test, API finalize tests, and `pnpm smoke:object-native`.
- Cancel: new API cancel route test.
- Artifact fetch: local artifact endpoint curl against the real-eval run bundle, documented below.

## Verification Commands
All commands below were run from:

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime
```

```bash
pnpm -r --if-present typecheck
```

Status: PASS.
Log: `/tmp/tooldi-agent-runtime-pr1-baseline-20260428/01-typecheck.log`.

```bash
pnpm build
```

Status: PASS.
Log: `/tmp/tooldi-agent-runtime-pr1-baseline-20260428/02-build.log`.

```bash
pnpm -F @tooldi/agent-api test
```

Status: PASS.
Result: `tests 31`, `pass 31`, `fail 0`, `skipped 0`.
Log: `/tmp/tooldi-agent-runtime-pr1-baseline-20260428/03-agent-api-test.log`.

```bash
pnpm -F @tooldi/agent-worker test
```

Status: PASS.
Result: `tests 313`, `pass 312`, `fail 0`, `skipped 1`.
Skip note: the optional PostgresSaver interrupt test stayed skipped because `AGENT_RUNTIME_POSTGRES_*` was not sourced.
Log: `/tmp/tooldi-agent-runtime-pr1-baseline-20260428/04-agent-worker-test.log`.

```bash
pnpm smoke:object-native
```

Status: PASS.
Log: `/tmp/tooldi-agent-runtime-pr1-baseline-20260428/05-smoke-object-native.log`.
Observed smoke run:
- runId: `run_20260428_023043_331_ca9bdcd3`
- traceId: `d9794a49-993e-4b16-a658-da3220e65efa`
- create-layer mutation acked: `req_20260428_023043_615_30775b1c`, seq `1`
- save mutation acked: `req_20260428_023043_680_a477aac4`, seq `2`
- observed `run.completed` SSE
- final status: `completed`
- v6 pipeline emitted `3` createLayer commands through `v6-freeform-layout-pipeline`

## Real Toolditor Eval Attempt
Command:

```bash
pnpm local:toolditor:eval:object-native:real --limit 1 --timeout-ms 30000 --output /tmp/tooldi-agent-runtime-pr1-baseline-20260428/06-real-eval-report.json
```

Status: FAILED / unavailable as PR 1 real-stack proof.
Log: `/tmp/tooldi-agent-runtime-pr1-baseline-20260428/06-real-eval.log`.
Report: `/tmp/tooldi-agent-runtime-pr1-baseline-20260428/06-real-eval-report.json`.

The command reached the local stack at `http://127.0.0.1:3100` and created:
- runId: `run_20260428_021757_290_5fa46eff`
- traceId: `5a11e620-cb07-4d67-8f69-ab3cbe7a3ce2`

The eval harness failed because it still waits for the legacy artifact:

```text
Timed out while reading .../attempts/1/object-native-reference-audit.json: ENOENT
```

Fallback artifact inspection for that run showed the v6 route did execute:
- `attempts/1/executable-plan.json` exists.
- `attempts/1/v6-render-quality-report.json` exists.
- `artifacts/bundle_run_20260428_021757_290_5fa46eff.json` exists.
- `object-native-reference-audit.json` does not exist.
- `executable-plan.json` contains `planSchemaVersion: "v6-freeform-layout"`, operation `v6_apply_freeform_layout`, tool `v6-freeform-layout-pipeline`, and `commandCount: 12`.
- The bundle has latest save receipt `save_receipt_run_20260428_021757_290_5fa46eff_2_req_20260428_021815_050_c6efff77` and `checkpointCount: 1`.

Artifact endpoint fetch:

```bash
curl -fsS "http://127.0.0.1:3100/api/agent-workflow/runs/run_20260428_021757_290_5fa46eff/artifacts?key=runs/run_20260428_021757_290_5fa46eff/artifacts/bundle_run_20260428_021757_290_5fa46eff.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const b=JSON.parse(s);console.log(JSON.stringify({hasLatestSaveReceipt:Boolean(b.latestSaveReceipt),checkpointCount:b.checkpoints?.length ?? 0},null,2));})'
```

Status: PASS.
Log: `/tmp/tooldi-agent-runtime-pr1-baseline-20260428/07-artifact-fetch.log`.
Output:

```json
{
  "hasLatestSaveReceipt": true,
  "checkpointCount": 1
}
```

## PR 1 Conclusion
- Automated worker/API tests now lock the current v6 reachability baseline and legacy-node non-reachability.
- Smoke evidence proves create-layer ack, save ack, SSE completion observation, and finalize on the object-native route.
- Real Toolditor eval is not counted as successful because the local harness still expects a legacy audit artifact that the v6 path does not produce.
- The best local fallback evidence is the passing v6 smoke plus direct artifact fetch from the run created by the real-eval attempt.
