# Tooldi Agent Workflow v1 Document Index

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow v1 Document Index |
| 문서 목적 | 현재 구현 상태와 sibling 설계 문서를 어떤 순서로 읽어야 하는지 인덱스와 업데이트 규칙을 제공한다. |
| 상태 | Draft |
| 문서 유형 | Index / Reading Guide |
| 작성일 | 2026-04-08 |
| 대상 독자 | PM, FE, Agent Backend, Worker, QA, Reviewer |

## 1. 먼저 읽을 문서

### 1.1 현재 구현 상태를 먼저 파악하려는 경우

1. [README.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/README.md)
2. [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)
3. [tooldi-agent-workflow-v1-next-implementation-roadmap.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-next-implementation-roadmap.md)

### 1.2 normative contract를 먼저 보려는 경우

1. [tooldi-natural-language-agent-v1-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-natural-language-agent-v1-architecture.md)
2. [tooldi-agent-workflow-v1-functional-spec-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-functional-spec-to-be.md)
3. [tooldi-agent-workflow-v1-backend-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-backend-boundary.md)
4. [toolditor-agent-workflow-v1-client-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/toolditor-agent-workflow-v1-client-boundary.md)
5. [tooldi-agent-workflow-v1-scope-operations-decisions.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-scope-operations-decisions.md)

## 2. 문서 분류

### 2.1 authority 문서

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
- [tooldi-agent-workflow-v1-create-template-representation-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-representation-design-lock.md)
  - `create_template` 내부 표현 전략 authority
  - `strict core schema + structured subplans` 기준선

### 2.2 current-state 문서

- [README.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/README.md)
  - bootstrap 이후 현재 구현 메모와 실행 가이드
- [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)
  - `create_template` skeleton 의 실제 구현 상태, artifact chain, known gap

### 2.3 slice / design-lock 문서

- [tooldi-agent-workflow-v1-template-intelligence-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-template-intelligence-design-lock.md)
  - capability catalog, intent/search/select hierarchy lock
- [tooldi-agent-workflow-v1-create-template-representation-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-representation-design-lock.md)
  - 표현 전략 lock
  - giant schema 대신 `core + subplans` 방향을 고정
- [tooldi-agent-workflow-v1-create-template-spring-vertical-slice.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-vertical-slice.md)
  - spring representative slice 기준선
- [tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-a.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-a.md)
  - photo branch selection spec lock
- [tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-b.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-b.md)
  - photo branch execution spec lock
- [tooldi-agent-workflow-v1-tooldi-content-discovery.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-tooldi-content-discovery.md)
  - real Tooldi source family / PHP API / DB seam

### 2.4 future-facing 문서

- [tooldi-agent-workflow-v1-next-implementation-roadmap.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-next-implementation-roadmap.md)
  - 다음 구현 축과 sequencing
- [tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md)
  - planner/search/judge hardening을 실제 Tooldi taxonomy와 asset prior에 grounded해 정의한 TO-BE spec
- [tooldi-agent-workflow-v1-semantic-retrieval-checklist.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-semantic-retrieval-checklist.md)
  - vector/semantic retrieval 도입 전 체크리스트
- [tooldi-agent-backend-v1-bootstrap-instructions.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-backend-v1-bootstrap-instructions.md)
  - bootstrap/rebuild oriented guide

## 3. 주제별 읽기 순서

### 3.1 처음 합류해서 현재 상태를 빠르게 파악

1. [README.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/README.md)
2. [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)
3. [tooldi-agent-workflow-v1-doc-index.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-doc-index.md)

### 3.2 backend / worker 구현

1. [tooldi-natural-language-agent-v1-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-natural-language-agent-v1-architecture.md)
2. [tooldi-agent-workflow-v1-backend-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-backend-boundary.md)
3. [tooldi-agent-workflow-v1-functional-spec-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-functional-spec-to-be.md)
4. [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)

### 3.3 planner / search / judge 품질 개선

1. [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)
2. [tooldi-agent-workflow-v1-template-intelligence-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-template-intelligence-design-lock.md)
3. [tooldi-agent-workflow-v1-create-template-representation-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-representation-design-lock.md)
4. [tooldi-agent-workflow-v1-tooldi-content-discovery.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-tooldi-content-discovery.md)
5. [tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md)
6. [tooldi-agent-workflow-v1-next-implementation-roadmap.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-next-implementation-roadmap.md)

### 3.4 표현 전략 / copy-layout-asset plan 설계

1. [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)
2. [tooldi-agent-workflow-v1-create-template-representation-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-representation-design-lock.md)
3. [tooldi-agent-workflow-v1-tooldi-content-discovery.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-tooldi-content-discovery.md)
4. [tooldi-agent-workflow-v1-template-intelligence-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-template-intelligence-design-lock.md)
5. [tooldi-agent-workflow-v1-next-implementation-roadmap.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-next-implementation-roadmap.md)

### 3.4 photo branch / real-source representative slice

1. [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)
2. [tooldi-agent-workflow-v1-create-template-spring-vertical-slice.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-vertical-slice.md)
3. [tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-a.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-a.md)
4. [tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-b.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-b.md)

### 3.5 semantic retrieval 준비

1. [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)
2. [tooldi-agent-workflow-v1-semantic-retrieval-checklist.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-semantic-retrieval-checklist.md)
3. [tooldi-agent-workflow-v1-next-implementation-roadmap.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-next-implementation-roadmap.md)

## 4. 어떤 문서를 언제 업데이트할지

- 현재 구현 truth가 바뀌면:
  - [README.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/README.md)
  - [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)
- public/API/상태/persistence contract가 바뀌면:
  - [tooldi-agent-workflow-v1-functional-spec-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-functional-spec-to-be.md)
  - [tooldi-agent-workflow-v1-backend-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-backend-boundary.md)
- stack/runtime/운영 방침이 바뀌면:
  - [tooldi-agent-workflow-v1-scope-operations-decisions.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-scope-operations-decisions.md)
- template intelligence vocabulary / selection policy가 바뀌면:
  - [tooldi-agent-workflow-v1-template-intelligence-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-template-intelligence-design-lock.md)
- `create_template` 내부 표현 전략, core schema / subplan 분리 기준이 바뀌면:
  - [tooldi-agent-workflow-v1-create-template-representation-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-representation-design-lock.md)
- 다음 단계 우선순위가 바뀌면:
  - [tooldi-agent-workflow-v1-next-implementation-roadmap.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-next-implementation-roadmap.md)

## 5. 현재 가장 중요한 문장

- 현재 문서 세트의 current truth 는 `spring/photo prototype` 을 넘어서 `generic create_template skeleton v1` 까지 구현됐다는 점이다.
- 다만 가장 큰 남은 품질 이슈는 planner/judge 정합성이다.
- 따라서 다음 구현은 새 capability 확장보다 `domain/facet contradiction`, `search-profile mismatch`, `photo subject mismatch` 를 더 잘 잡는 쪽이 우선이다.
