# Tooldi Agent Workflow Document Index

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow Document Index |
| 문서 목적 | 현재 구현 상태와 sibling 설계 문서를 어떤 순서로 읽어야 하는지, 무엇이 authority이고 무엇이 projection/historical인지 분명히 정리한다. |
| 상태 | Draft |
| 문서 유형 | Index / Reading Guide |
| 작성일 | 2026-04-20 (v5 SSOT 제정 반영) |
| 대상 독자 | PM, FE, Agent Backend, Worker, QA, Reviewer |

## 1. 먼저 읽을 문서

### 1.1 현재 구현 상태를 먼저 파악하려는 경우

1. [README.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/README.md)
2. [tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md)
3. [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)
4. [tooldi-agent-workflow-v1-next-implementation-roadmap.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-next-implementation-roadmap.md)

### 1.2 normative contract를 먼저 보려는 경우

1. [tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md)
2. [tooldi-natural-language-agent-v1-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-natural-language-agent-v1-architecture.md)
3. [tooldi-agent-workflow-v1-functional-spec-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-functional-spec-to-be.md)
4. [tooldi-agent-workflow-v1-backend-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-backend-boundary.md)
5. [toolditor-agent-workflow-v1-client-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/toolditor-agent-workflow-v1-client-boundary.md)
6. [tooldi-agent-workflow-v1-scope-operations-decisions.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-scope-operations-decisions.md)

## 2. 문서 분류

### 2.1 authority 문서

- [tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md)
  - **설계 철학, 6단계 파이프라인, 재사용·폐기·신설 경계, 모델 선택 regime의 SSOT (v5)**
  - V1~V5 axiom, Stage 1~6 normative contract, reuse/remove/introduce boundary, default model lock (`gemini-3.1-flash-lite-preview`)
- [tooldi-natural-language-agent-v1-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-natural-language-agent-v1-architecture.md)
  - artifact identity, counted completion moment, lifecycle ownership, Canvas Mutation Protocol 구조 authority
  - v5 SSOT의 설계 철학과 정합을 유지해야 한다.
- [tooldi-agent-workflow-v1-functional-spec-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-functional-spec-to-be.md)
  - public/API/persistence projection authority. v5 파이프라인 계약을 구현 관점으로 투영한다.
- [tooldi-agent-workflow-v1-backend-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-backend-boundary.md)
  - backend/control-plane, worker/execution-plane, queue/store 경계 authority
- [toolditor-agent-workflow-v1-client-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/toolditor-agent-workflow-v1-client-boundary.md)
  - FE/toolditor 적용 경계 authority
- [tooldi-agent-workflow-v1-scope-operations-decisions.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-scope-operations-decisions.md)
  - v1 범위, stack, 운영 decision authority

### 2.2 historical (대체됨 — 배경 참고만)

- [tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md)
  - **2026-04-20자로 v5 SSOT에 의해 대체됨.** adaptive composition 시도의 철학/axiom/decision DSL 이해 용도.
- [tooldi-agent-workflow-v1-create-template-representation-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-representation-design-lock.md)
  - adaptive composition projection이었으므로 v5로 폐기.
- [tooldi-agent-workflow-v1-template-intelligence-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-template-intelligence-design-lock.md)
  - reference discovery / addable vocabulary 개념 자체가 v5에서 제거되므로 폐기.
- [tooldi-agent-workflow-vnext-object-native-reference-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-vnext-object-native-reference-architecture.md)
  - object-native 전환 동기 참고.
- [tooldi-agent-workflow-v4-topology-driven-editor-native-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v4-topology-driven-editor-native-architecture.md)
  - topology-driven 제안 참고.

### 2.3 current-state 문서

- [README.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/README.md)
  - bootstrap 이후 현재 구현 메모와 실행 가이드
- [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)
  - 현재 코드가 실제로 무엇을 하는지와 v5 전환 진행 상황 gap 기록
- [tooldi-agent-workflow-v1-next-implementation-roadmap.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-next-implementation-roadmap.md)
  - v5 SSOT 기준 다음 구현 축과 sequencing

### 2.4 reference / historical 문서

- [tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md)
  - source-grounded retrieval/judge hardening reference. v5에서는 RAG Stage 4 자체가 다시 설계되므로 historical 로 취급.
- [tooldi-agent-workflow-v1-create-template-spring-vertical-slice.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-vertical-slice.md)
  - representative slice reference
- [tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-a.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-a.md)
  - photo branch selection proof reference
- [tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-b.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-b.md)
  - photo branch execution proof reference
- [tooldi-agent-workflow-v1-tooldi-content-discovery.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-tooldi-content-discovery.md)
  - real Tooldi source family / PHP API / DB seam reference
- [tooldi-agent-workflow-v1-semantic-retrieval-checklist.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-semantic-retrieval-checklist.md)
  - vector/semantic retrieval 도입 전 체크리스트. v5 Stage 4 설계 시 참고.
- [tooldi-agent-backend-v1-bootstrap-instructions.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-backend-v1-bootstrap-instructions.md)
  - bootstrap/rebuild oriented guide

## 3. 주제별 읽기 순서

### 3.1 처음 합류해서 현재 상태를 빠르게 파악

1. [README.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/README.md)
2. [tooldi-agent-workflow-v1-doc-index.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-doc-index.md)
3. [tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md)
4. [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)

### 3.2 backend / worker 구현

1. [tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md)
2. [tooldi-natural-language-agent-v1-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-natural-language-agent-v1-architecture.md)
3. [tooldi-agent-workflow-v1-backend-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-backend-boundary.md)
4. [tooldi-agent-workflow-v1-functional-spec-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-functional-spec-to-be.md)
5. [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)

### 3.3 파이프라인 품질 개선 (프롬프트, 파서, post-processor, RAG)

1. [tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md)
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
- 설계 철학 / V1~V5 axiom / 6단계 파이프라인 / 재사용·폐기·신설 경계 / 모델 선택 regime이 바뀌면:
  - [tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md)
  - 이후 `architecture`, `functional-spec`, `backend-boundary`, `client-boundary`, `scope-operations-decisions`, `current-state-as-is` 순서로 projection 한다.
- default 모델 교체:
  - `bench/method-compare-phase1/` 재실행 + parity/cost/latency 증거 제출
  - `v5 SSOT` §0.3 증거 섹션 / §6.2 cost 섹션 갱신
  - AGENTS.md 의 default 모델 레퍼런스 갱신
- 다음 단계 우선순위가 바뀌면:
  - [tooldi-agent-workflow-v1-next-implementation-roadmap.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-next-implementation-roadmap.md)

## 5. 현재 가장 중요한 문장

- 설계 철학은 **Constrained HTML Pipeline (v5)** 으로 확정되었다.
- LLM은 제약된 HTML/CSS 서브셋으로 **디자인 판단**만 수행하고, 결정적 코드가 DOM을 Tooldi layer graph로 **직렬화**한다.
- Pass-2는 반드시 결정적이다 (LLM 2차 호출 금지). completion은 `editability + renderability + save truth` 로 판정한다.
- default 모델은 `gemini-3.1-flash-lite-preview`. 교체는 `bench/method-compare-phase1/` 의 parity 증거를 전제한다.
- **Template-aware adaptive composition (v1~v4)** 의 template object graph · retain/modify/remove/add DSL · addable vocabulary · slot/cluster completeness 는 모두 **폐기된 개념**이다. 코드에서도 제거 대상.
