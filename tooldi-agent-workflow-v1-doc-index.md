# Tooldi Agent Workflow v1 Document Index

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow v1 Document Index |
| 문서 목적 | 현재 구현 상태와 sibling 설계 문서를 어떤 순서로 읽어야 하는지, 무엇이 authority이고 무엇이 projection/reference인지 분명히 정리한다. |
| 상태 | Draft |
| 문서 유형 | Index / Reading Guide |
| 작성일 | 2026-04-16 |
| 대상 독자 | PM, FE, Agent Backend, Worker, QA, Reviewer |

## 1. 먼저 읽을 문서

### 1.1 현재 구현 상태를 먼저 파악하려는 경우

1. [README.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/README.md)
2. [tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md)
3. [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)
4. [tooldi-agent-workflow-v1-next-implementation-roadmap.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-next-implementation-roadmap.md)

### 1.2 normative contract를 먼저 보려는 경우

1. [tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md)
2. [tooldi-natural-language-agent-v1-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-natural-language-agent-v1-architecture.md)
3. [tooldi-agent-workflow-v1-functional-spec-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-functional-spec-to-be.md)
4. [tooldi-agent-workflow-v1-backend-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-backend-boundary.md)
5. [toolditor-agent-workflow-v1-client-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/toolditor-agent-workflow-v1-client-boundary.md)
6. [tooldi-agent-workflow-v1-scope-operations-decisions.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-scope-operations-decisions.md)

## 2. 문서 분류

### 2.1 authority 문서

- [tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md)
  - **설계 철학 및 adaptive composition authority (SSOT)**
  - template-aware adaptive composition 철학, 5개 axiom, 4-layer 개념 모델, operation 모델(retain/modify/remove/add), completion contract, addable vocabulary registry, migration map
- [tooldi-natural-language-agent-v1-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-natural-language-agent-v1-architecture.md)
  - artifact identity, completion semantics, lifecycle ownership authority
- [tooldi-agent-workflow-v1-functional-spec-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-functional-spec-to-be.md)
  - public/API/persistence projection authority
- [tooldi-agent-workflow-v1-backend-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-backend-boundary.md)
  - backend/control-plane, worker/execution-plane, queue/store 경계 authority
- [toolditor-agent-workflow-v1-client-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/toolditor-agent-workflow-v1-client-boundary.md)
  - FE/toolditor 적용 경계 authority
- [tooldi-agent-workflow-v1-scope-operations-decisions.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-scope-operations-decisions.md)
  - v1 범위, stack, 운영 decision authority

### 2.2 projection / design-lock 문서

- [tooldi-agent-workflow-v1-create-template-representation-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-representation-design-lock.md)
  - SSOT 표현 전략을 worker/runtime 표현으로 투영
  - template object graph, message atoms, adaptive composition decision, executor materialization
- [tooldi-agent-workflow-v1-template-intelligence-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-template-intelligence-design-lock.md)
  - reference discovery, source family registry, addable vocabulary, executor capability registry projection

### 2.3 current-state 문서

- [README.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/README.md)
  - bootstrap 이후 현재 구현 메모와 실행 가이드
- [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)
  - 현재 코드가 실제로 무엇을 하는지와 SSOT와의 drift를 기록
- [tooldi-agent-workflow-v1-next-implementation-roadmap.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-next-implementation-roadmap.md)
  - SSOT 기준 다음 구현 축과 sequencing

### 2.4 reference / historical 문서

- [tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md)
  - source-grounded retrieval/judge hardening reference
  - planning ontology authority가 아니라 evidence/reference 문서로 읽는다
- [tooldi-agent-workflow-v1-create-template-spring-vertical-slice.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-vertical-slice.md)
  - representative slice reference
  - slot world를 normative로 잠그지 않고 실험적 slice 기록으로 읽는다
- [tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-a.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-a.md)
  - photo branch selection proof reference
- [tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-b.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-b.md)
  - photo branch execution proof reference
- [tooldi-agent-workflow-v1-tooldi-content-discovery.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-tooldi-content-discovery.md)
  - real Tooldi source family / PHP API / DB seam reference
- [tooldi-agent-workflow-vnext-object-native-reference-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-vnext-object-native-reference-architecture.md)
  - **Historical context (superseded by SSOT)** — object-native 전환 동기와 배경 참고용
- [tooldi-agent-workflow-v4-topology-driven-editor-native-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v4-topology-driven-editor-native-architecture.md)
  - **Historical context (superseded by SSOT)** — topology-driven 제안 참고용
- [tooldi-agent-workflow-v1-semantic-retrieval-checklist.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-semantic-retrieval-checklist.md)
  - vector/semantic retrieval 도입 전 체크리스트
- [tooldi-agent-backend-v1-bootstrap-instructions.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-backend-v1-bootstrap-instructions.md)
  - bootstrap/rebuild oriented guide

## 3. 주제별 읽기 순서

### 3.1 처음 합류해서 현재 상태를 빠르게 파악

1. [README.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/README.md)
2. [tooldi-agent-workflow-v1-doc-index.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-doc-index.md)
3. [tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md)
4. [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)

### 3.2 backend / worker 구현

1. [tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md)
2. [tooldi-natural-language-agent-v1-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-natural-language-agent-v1-architecture.md)
3. [tooldi-agent-workflow-v1-create-template-representation-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-representation-design-lock.md)
4. [tooldi-agent-workflow-v1-template-intelligence-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-template-intelligence-design-lock.md)
5. [tooldi-agent-workflow-v1-backend-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-backend-boundary.md)
6. [tooldi-agent-workflow-v1-functional-spec-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-functional-spec-to-be.md)
7. [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)

### 3.3 planner / search / judge / composition 품질 개선

1. [tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md)
2. [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)
3. [tooldi-agent-workflow-v1-create-template-representation-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-representation-design-lock.md)
4. [tooldi-agent-workflow-v1-template-intelligence-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-template-intelligence-design-lock.md)
5. [tooldi-agent-workflow-v1-tooldi-content-discovery.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-tooldi-content-discovery.md)
6. [tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md)
7. [tooldi-agent-workflow-v1-next-implementation-roadmap.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-next-implementation-roadmap.md)

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
- source discovery, reference selection, addable vocabulary, executor capability registry가 바뀌면:
  - [tooldi-agent-workflow-v1-template-intelligence-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-template-intelligence-design-lock.md)
- adaptive composition projection, template object graph 표현, executor materialization 경계가 바뀌면:
  - [tooldi-agent-workflow-v1-create-template-representation-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-representation-design-lock.md)
- 설계 철학, axiom, completion contract, operation 모델이 바뀌면:
  - [tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md)
  - 이후 authority/projection/current-state 문서를 순서대로 projection 한다
- 다음 단계 우선순위가 바뀌면:
  - [tooldi-agent-workflow-v1-next-implementation-roadmap.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-next-implementation-roadmap.md)

## 5. 현재 가장 중요한 문장

- 설계 철학은 **template-aware adaptive composition** 하나로 확정되었다.
- template object graph가 구조의 1차 진실이고, message atoms는 content hint이며, completion은 `editability + renderability + save truth` 로 판정한다.
- 고정 slot completeness, giant core schema, capability-as-planning-ontology는 모두 금지 패턴이다.
