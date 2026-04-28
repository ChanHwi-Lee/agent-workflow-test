# Tooldi Agent Workflow Document Index

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow Document Index |
| 문서 목적 | 현재 구현 상태와 sibling 설계 문서를 어떤 순서로 읽어야 하는지, 무엇이 authority이고 무엇이 projection/historical인지 분명히 정리한다. |
| 상태 | Draft |
| 문서 유형 | Index / Reading Guide |
| 작성일 | 2026-04-28 (v6-only cleanup PR7 반영) |
| 대상 독자 | PM, FE, Agent Backend, Worker, QA, Reviewer |

## 1. 먼저 읽을 문서

### 1.1 현재 구현 상태를 먼저 파악하려는 경우

1. [README.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/README.md)
2. [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)
3. [tooldi-agent-workflow-v6-layout-freedom-ssot.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v6-layout-freedom-ssot.md)
4. [tooldi-agent-workflow-v1-next-implementation-roadmap.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-next-implementation-roadmap.md)

### 1.2 normative contract를 먼저 보려는 경우

1. [tooldi-agent-workflow-v6-layout-freedom-ssot.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v6-layout-freedom-ssot.md)
2. [tooldi-natural-language-agent-v1-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-natural-language-agent-v1-architecture.md)
3. [tooldi-agent-workflow-v1-functional-spec-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-functional-spec-to-be.md)
4. [tooldi-agent-workflow-v1-backend-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-backend-boundary.md)
5. [toolditor-agent-workflow-v1-client-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/toolditor-agent-workflow-v1-client-boundary.md)
6. [tooldi-agent-workflow-v1-scope-operations-decisions.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-scope-operations-decisions.md)

## 2. 문서 분류

### 2.1 authority 문서

- [tooldi-agent-workflow-v6-layout-freedom-ssot.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v6-layout-freedom-ssot.md)
  - **설계 철학, 3단계 파이프라인, 재사용·폐기·신설 경계, 모델 선택 regime의 SSOT (v6)**
  - P1~P5 원칙, Stage 1~3 normative contract (free HTML → browser layout → primitive extract), reuse/remove/introduce boundary, default model lock (`gemini-3.1-flash-lite-preview`)
- [tooldi-natural-language-agent-v1-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-natural-language-agent-v1-architecture.md)
  - artifact identity, counted completion moment, lifecycle ownership, Canvas Mutation Protocol 구조 authority
  - v6 SSOT의 설계 철학과 정합을 유지해야 한다.
- [tooldi-agent-workflow-v1-functional-spec-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-functional-spec-to-be.md)
  - public/API/persistence projection authority. v6 파이프라인 계약을 구현 관점으로 투영한다.
- [tooldi-agent-workflow-v1-backend-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-backend-boundary.md)
  - backend/control-plane, worker/execution-plane, queue/store 경계 authority
- [toolditor-agent-workflow-v1-client-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/toolditor-agent-workflow-v1-client-boundary.md)
  - FE/toolditor 적용 경계 authority
- [tooldi-agent-workflow-v1-scope-operations-decisions.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-scope-operations-decisions.md)
  - v1 범위, stack, 운영 decision authority

### 2.2 historical (대체됨 — 배경 참고만)

- [tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md)
  - **2026-04-20자로 v6 SSOT에 의해 대체됨.** adaptive composition 시도의 철학/axiom/decision DSL 이해 용도.
- [tooldi-agent-workflow-v1-create-template-representation-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-representation-design-lock.md)
  - adaptive composition projection이었으므로 v5/v6로 폐기.
- [tooldi-agent-workflow-v1-template-intelligence-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-template-intelligence-design-lock.md)
  - reference discovery / addable vocabulary 개념 자체가 v5/v6에서 제거되므로 폐기.
- [tooldi-agent-workflow-vnext-object-native-reference-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-vnext-object-native-reference-architecture.md)
  - object-native 전환 동기 참고.
- [tooldi-agent-workflow-v4-topology-driven-editor-native-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v4-topology-driven-editor-native-architecture.md)
  - topology-driven 제안 참고.

### 2.3 current-state 문서

- [README.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/README.md)
  - 2026-04-28 v6-only runtime 기준선, local stack, 검증 명령
- [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)
  - 현재 코드가 실제로 무엇을 하는지 기록. PostgreSQL/Drizzle, PostgresSaver, v6-only path, live artifacts 기준.
- [tooldi-agent-workflow-v1-next-implementation-roadmap.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-next-implementation-roadmap.md)
  - cleanup 이후 다음 구현 축. visual quality, Phase 6 asset/RAG, local/production parity, recovery hardening.

### 2.4 cleanup evidence / handoff archive

- [docs/handoff/2026-04-28-agent-workflow-pr1-baseline-lock-evidence.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/handoff/2026-04-28-agent-workflow-pr1-baseline-lock-evidence.md)
  - v6 reachability와 legacy non-reachability baseline.
- [docs/handoff/2026-04-28-agent-workflow-pr3-graph-topology-prune-handoff.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/handoff/2026-04-28-agent-workflow-pr3-graph-topology-prune-handoff.md)
  - legacy graph topology prune 작업 근거.
- [docs/handoff/2026-04-28-agent-workflow-pr4-legacy-phase-deletion-handoff.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/handoff/2026-04-28-agent-workflow-pr4-legacy-phase-deletion-handoff.md)
  - legacy phase deletion 범위.
- [docs/handoff/2026-04-28-agent-workflow-pr5-mixed-cleanup-handoff.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/handoff/2026-04-28-agent-workflow-pr5-mixed-cleanup-handoff.md)
  - mixed runtime cleanup, planner abstraction, public contract cleanup.
- [docs/handoff/2026-04-28-agent-workflow-pr6-package-sweep-handoff.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/handoff/2026-04-28-agent-workflow-pr6-package-sweep-handoff.md)
  - package-level dead code sweep.
- [docs/handoff/2026-04-28-agent-workflow-pr6b-types-cascade-handoff.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/handoff/2026-04-28-agent-workflow-pr6b-types-cascade-handoff.md)
  - state/type cascade cleanup.

### 2.5 reference / historical 문서

- [tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md)
  - source-grounded retrieval/judge hardening reference. v6에서는 RAG(Phase 6) 자체가 다시 설계되므로 historical 로 취급.
- [tooldi-agent-workflow-v1-create-template-spring-vertical-slice.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-vertical-slice.md)
  - representative slice reference
- [tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-a.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-a.md)
  - photo branch selection proof reference
- [tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-b.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-b.md)
  - photo branch execution proof reference
- [tooldi-agent-workflow-v1-tooldi-content-discovery.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-tooldi-content-discovery.md)
  - real Tooldi source family / PHP API / DB seam reference
- [tooldi-agent-workflow-v1-semantic-retrieval-checklist.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-semantic-retrieval-checklist.md)
  - vector/semantic retrieval 도입 전 체크리스트. v6 Phase 6 RAG 설계 시 참고.
- [tooldi-agent-backend-v1-bootstrap-instructions.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-backend-v1-bootstrap-instructions.md)
  - bootstrap/rebuild oriented guide
- `v6-poc/`
  - live runtime이 아니라 v6 architecture proof/evidence. 삭제하지 않고 historical evidence로 보존.
- `bench/method-compare-phase1/`
  - 모델/방식 비교 evidence. 모델 default 변경 시 새 bench evidence를 추가.
- `docs/design/phase6-rag-assets/`
  - Phase 6 placeholder asset/RAG 설계 참고. template prior/adaptive composition을 되살리는 근거로 쓰지 않는다.

## 3. 주제별 읽기 순서

### 3.1 처음 합류해서 현재 상태를 빠르게 파악

1. [README.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/README.md)
2. [tooldi-agent-workflow-v1-doc-index.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-doc-index.md)
3. [tooldi-agent-workflow-v6-layout-freedom-ssot.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v6-layout-freedom-ssot.md)
4. [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)

### 3.2 backend / worker 구현

1. [tooldi-agent-workflow-v6-layout-freedom-ssot.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v6-layout-freedom-ssot.md)
2. [tooldi-natural-language-agent-v1-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-natural-language-agent-v1-architecture.md)
3. [tooldi-agent-workflow-v1-backend-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-backend-boundary.md)
4. [tooldi-agent-workflow-v1-functional-spec-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-functional-spec-to-be.md)
5. [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)

### 3.3 파이프라인 품질 개선 (프롬프트, 파서, post-processor, RAG)

1. [tooldi-agent-workflow-v6-layout-freedom-ssot.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v6-layout-freedom-ssot.md)
2. [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)
3. [tooldi-agent-workflow-v1-tooldi-content-discovery.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-tooldi-content-discovery.md)
4. [tooldi-agent-workflow-v1-semantic-retrieval-checklist.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-semantic-retrieval-checklist.md)
5. [tooldi-agent-workflow-v1-next-implementation-roadmap.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-next-implementation-roadmap.md)

## 4. 어떤 문서를 언제 업데이트할지

- 현재 구현 truth가 바뀌면:
  - [README.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/README.md)
  - [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)
- public/API/상태/persistence contract가 바뀌면:
  - [tooldi-agent-workflow-v1-functional-spec-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-functional-spec-to-be.md)
  - [tooldi-agent-workflow-v1-backend-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-backend-boundary.md)
  - [toolditor-agent-workflow-v1-client-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/toolditor-agent-workflow-v1-client-boundary.md)
- stack/runtime/운영 방침이 바뀌면:
  - [tooldi-agent-workflow-v1-scope-operations-decisions.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-scope-operations-decisions.md)
- 설계 철학 / P1~P5 원칙 / 3단계 파이프라인 / 재사용·폐기·신설 경계 / 모델 선택 regime이 바뀌면:
  - [tooldi-agent-workflow-v6-layout-freedom-ssot.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v6-layout-freedom-ssot.md)
  - 이후 `architecture`, `functional-spec`, `backend-boundary`, `client-boundary`, `scope-operations-decisions`, `current-state-as-is` 순서로 projection 한다.
- default 모델 교체:
  - `bench/method-compare-phase1/` 재실행 + parity/cost/latency 증거 제출
  - `v6 SSOT` §0.3 증거 섹션 / §6.2 cost 섹션 갱신
  - AGENTS.md 의 default 모델 레퍼런스 갱신
- 다음 단계 우선순위가 바뀌면:
  - [tooldi-agent-workflow-v1-next-implementation-roadmap.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-next-implementation-roadmap.md)

## 5. 현재 가장 중요한 문장

- 설계 철학은 **Layout Freedom Pipeline (v6)** 으로 확정되었다.
- 현재 runtime은 **v6-only `object_native_v1`** 이다. 이름은 Toolditor wire contract로 남지만 내부 graph는 template prior/adaptive/refinement path가 아니다.
- LLM 은 자유도 있는 HTML 을 출력하고, 브라우저가 layout 을 계산하며, 결정적 코드가 rendered DOM 을 Tooldi primitive 로 **추출**한다.
- Layout family / slot / role / CTA / topology 는 contract 로 승격되지 않는다. CTA 처럼 보이는 조합도 단지 rect + text 두 primitive 로 표현된다.
- primitive 매핑은 반드시 결정적이다 (LLM 2차 호출 금지). completion 은 `editability + renderability + save truth` 로 판정한다.
- default 모델은 `gemini-3.1-flash-lite-preview`. 교체는 `bench/method-compare-phase1/` 의 parity 증거를 전제한다.
- **v5 제약 HTML grammar (position:absolute 강제 · child 수 제한 · line-break sibling 분해)** 와 **Template-aware adaptive composition (v1~v4)** 개념은 모두 **폐기**되었다. PoC/bench/handoff는 evidence로 보존하지만 current runtime truth로 읽지 않는다.
