# Tooldi Agent Workflow Current State (AS-IS)

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow Current State (AS-IS) |
| 문서 목적 | 2026-04-28 기준 `agent-workflow-test/tooldi-agent-runtime`가 실제로 수행하는 v6-only 런타임 상태를 기록한다. |
| 상태 | Current |
| 문서 유형 | AS-IS |
| 갱신일 | 2026-04-28 |
| 기준 시스템 | Toolditor FE, Fastify Agent API, BullMQ Worker, LangGraph Runtime, PostgreSQL/Drizzle, LangGraph PostgresSaver |

## 1. 현재 결론

현재 제품 경로는 **`object_native_v1` 이름을 유지한 v6-only runtime** 이다. 이름은 Toolditor wire contract 호환을 위해 유지하지만, 내부 구현은 v1~v5의 template prior/adaptive composition/build/refinement graph가 아니다.

런타임 핵심은 다음 순서다.

```text
POST /runs
-> BullMQ enqueue/dequeue
-> worker normalize/prepare
-> v6 free HTML generation
-> security validate + browser render + DOM extraction
-> primitive map + create-layer command adaptation
-> SSE canvas.mutation
-> Toolditor mutation ack
-> save mutation / save ack
-> finalize with latestSaveReceipt
-> run.completed + artifact fetch
```

## 2. Public Contract

- `StartAgentWorkflowRunRequest.workflowVariant`는 required literal `"object_native_v1"` 이다.
- API는 omitted variant를 default로 보정하지 않는다.
- completed run finalize 입력은 full `latestSaveReceipt` payload를 요구한다.
- `latestSaveReceiptId`는 backward summary/read model 성격의 output field로는 남을 수 있지만 finalize input compat 경로는 아니다.
- Worker callback의 legacy `tool.result` branch는 live producer가 없으므로 제거됐다.
- Toolditor live contract는 SSE stream, mutation ack, save ack, finalize, cancel, artifact fetch를 유지한다.

## 3. Persistence / Runtime

- API persistence는 PostgreSQL/Drizzle `agent_runtime` 스키마다.
- API repository는 in-memory `Map`/array fallback이 아니라 Drizzle-backed PostgreSQL repository를 사용한다.
- API/worker boot는 PostgreSQL connect/migration 실패 시 실패해야 한다.
- LangGraph checkpoint는 PostgreSQL `PostgresSaver` 전용이다.
- `MemorySaver` fallback은 제거됐다.
- `.env.local`의 `LANGGRAPH_CHECKPOINTER_MODE=postgres`와 `AGENT_RUNTIME_POSTGRES_*` 값은 local HITL/interview resume 및 worker recovery 테스트에 사용된다.

## 4. Worker Path

현재 graph는 v6 경로만 실행한다.

- 유지: prompt normalization, v6 HTML generation, v6 render quality report, debug HTML preview, trend brief, execution plan, mutation ledger, save receipt, completion bundle.
- 제거: `build_template_prior_summary`, template prior candidate audit, rule judge, execution scene summary, judge plan, refine decision, legacy build/refinement graph edges.
- 제거: `TemplatePlanner` DI abstraction, `TEMPLATE_PLANNER_MODE`, heuristic/langchain planner mode switch.
- 제거: tool registry, tool adapters, primitive/storage/text-layout adapter packages 중 live v6 경로에 닿지 않는 패키지.
- 보존: `state.plan`은 v6 create-layer/save/finalize 경로의 live state라 제거 대상이 아니다.

## 5. Current Artifacts

현재 v6 path에서 의미 있는 artifact/read model은 다음 계열이다.

- semantic brief / canonical design brief
- trend brief, trend research source refs
- v6 HTML/debug HTML preview
- v6 render quality report
- v6 executable plan / compilation report
- mutation range / mutation ledger
- save receipt / save evidence
- live draft artifact bundle / completion record

아래 legacy artifact는 현재 v6 route의 acceptance requirement가 아니다.

- `object-native-reference-audit.json`
- `object-native-candidate-selection.json`
- `object-native-renderability-report.json`
- `object-native-cluster-graph.json`
- `rule-judge-verdict.json`
- `execution-scene-summary.json`
- `judge-plan.json`
- `refine-decision.json`

## 6. Local Stack

브라우저 검증은 repo-local stack script로 수행한다.

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test
bash scripts/local-stack.sh up
bash scripts/local-stack.sh status
```

브라우저 진입점:

```text
http://localhost:3010/editor
```

stack은 PostgreSQL, Redis, Qdrant, embedding service, agent API/worker, Toolditor를 함께 관리한다. `down`은 기본적으로 runtime 프로세스를 내리고 Docker 의존성은 보존한다. 의존성까지 내릴 때는 `KEEP_DEPS=0 bash scripts/local-stack.sh down`을 사용한다.

## 7. Verification

현재 기준 PR별 regression 검증은 아래 명령을 우선 사용한다.

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime
pnpm -r --if-present typecheck
pnpm build
pnpm -F @tooldi/agent-api test
pnpm -F @tooldi/agent-worker test
pnpm smoke:object-native
pnpm local:toolditor:eval:object-native:real
```

브라우저 수동 확인 범위:

- `http://localhost:3010/editor` 접속
- trend ON/OFF
- debug HTML preview load
- interview/resume
- SSE stream
- create-layer mutation
- save mutation / save ack
- finalize
- cancel
- artifact fetch

## 8. Known Risks / Next Work

- v6 visual quality는 자동 테스트만으로 충분히 닫히지 않는다. browser screenshot/HITL 평가 루프가 계속 필요하다.
- Phase 6 placeholder asset/RAG는 별도 설계 영역이다. 기존 template prior/RAG 코드를 runtime에 재연결하지 않는다.
- PostgreSQL-backed test DB와 local Docker stack drift는 `.env.example`, `scripts/local-stack.sh`, migration 경로를 함께 갱신해야 한다.
- v6 PoC/bench/handoff 자료는 historical evidence로 보존하되 current runtime truth로 읽지 않는다.
