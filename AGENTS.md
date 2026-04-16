# Tooldi Agent Workflow v1 Docs Guide

이 폴더는 Tooldi 자연어 agent/workflow v1 문서 묶음이다. 최근 기준선은 `Template-Aware Adaptive Composition SSOT` 하나로 잠긴다.

## 포함 문서

- `tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md`
- `tooldi-agent-workflow-v1-doc-index.md`
- `tooldi-agent-workflow-v1-create-template-current-state-as-is.md`
- `tooldi-agent-workflow-v1-create-template-representation-design-lock.md`
- `tooldi-agent-workflow-v1-template-intelligence-design-lock.md`
- `tooldi-natural-language-agent-v1-architecture.md`
- `tooldi-agent-workflow-v1-functional-spec-to-be.md`
- `tooldi-agent-workflow-v1-backend-boundary.md`
- `toolditor-agent-workflow-v1-client-boundary.md`
- `tooldi-agent-workflow-v1-scope-operations-decisions.md`

## 문서 권한 순서

1. `tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md`
   - 설계 철학, adaptive composition axiom, completion definition, addable vocabulary, migration direction의 유일한 SSOT다.
   - template object graph, message atoms, retain/modify/remove/add, editability/renderability/save truth는 이 문서를 기준으로 닫는다.

2. `tooldi-natural-language-agent-v1-architecture.md`
   - v1 runtime semantic contract authority다.
   - canonical artifact identity, counted completion moment, lifecycle ownership, ordering, rollback semantics, primitive reuse boundary를 닫는다.
   - 단, 설계 철학 자체를 다시 정의하면 안 된다.

3. `tooldi-agent-workflow-v1-functional-spec-to-be.md`
   - product/API/persistence projection 문서다.
   - SSOT와 architecture가 닫은 의미를 구현 관점으로 푼다.

4. `tooldi-agent-workflow-v1-backend-boundary.md`
   - backend/control-plane, worker/execution-plane, queue/store 경계 문서다.

5. `toolditor-agent-workflow-v1-client-boundary.md`
   - FE/toolditor 적용 경계 문서다.

6. `tooldi-agent-workflow-v1-scope-operations-decisions.md`
   - v1 scope/non-scope, stack lock, operations decision 문서다.

7. `tooldi-agent-workflow-v1-create-template-representation-design-lock.md`
   - SSOT 표현 전략을 worker/runtime 표현으로 투영하는 projection 문서다.
   - template object graph, message atoms, adaptive composition decision, executor materialization 경계를 정리한다.

8. `tooldi-agent-workflow-v1-template-intelligence-design-lock.md`
   - source discovery, reference selection, addable vocabulary, executor capability registry를 잠그는 projection 문서다.

9. `tooldi-agent-workflow-v1-create-template-current-state-as-is.md`
   - current truth 문서다.
   - 현재 코드가 아직 남겨 둔 legacy slot/plan drift도 여기서만 AS-IS로 기록한다.

10. `tooldi-agent-workflow-v1-doc-index.md`
   - 읽기 순서와 문서 업데이트 기준을 정리한 인덱스다.

## 읽는 순서

- PM/아키텍처 리뷰:
  - `doc-index` -> `SSOT` -> `architecture` -> `scope-operations-decisions` -> `functional-spec`

- Backend/worker 구현:
  - `doc-index` -> `SSOT` -> `current-state-as-is` -> `representation-design-lock` -> `template-intelligence-design-lock` -> `architecture` -> `backend-boundary` -> `functional-spec`

- FE/toolditor 구현:
  - `doc-index` -> `SSOT` -> `current-state-as-is` -> `representation-design-lock` -> `architecture` -> `client-boundary` -> `functional-spec`

- 운영/QA/리뷰:
  - `doc-index` -> `SSOT` -> `current-state-as-is` -> `architecture` -> `scope-operations-decisions` -> `functional-spec`

## 수정 규칙

- 설계 철학, adaptive composition axiom, completion definition, addable vocabulary, migration map이 바뀌면:
  - 먼저 `SSOT` 를 수정하고
  - 그 다음 `architecture`, `functional-spec`, `backend-boundary`, `client-boundary`, `scope-operations-decisions`, `representation-design-lock`, `template-intelligence-design-lock` 순으로 projection을 맞춘다.

- artifact identity, counted completion moment, authority ownership, ordering primitive, checkpoint/rollback이 바뀌면:
  - 먼저 `architecture` 를 수정하고
  - 그 다음 `functional-spec`, `backend-boundary`, `client-boundary`, `scope-operations-decisions` 로 projection을 맞춘다.

- 현재 코드가 실제로 하는 일과 known gap이 바뀌면:
  - 먼저 `tooldi-agent-workflow-v1-create-template-current-state-as-is.md` 를 수정하고
  - 필요하면 `README.md`, `tooldi-agent-workflow-v1-doc-index.md` 를 함께 맞춘다.

- public request/response/tool schema, FR/BR/NFR, persistence field를 바꾸면:
  - 먼저 `functional-spec` 를 수정하고
  - 필요하면 `backend-boundary` 와 `client-boundary` 를 맞춘다.

- source discovery, reference selection, addable vocabulary, executor capability registry가 바뀌면:
  - 먼저 `template-intelligence-design-lock` 을 수정하고
  - 그 다음 `representation-design-lock`, `current-state-as-is`, `next-implementation-roadmap` 를 projection 한다.

- worker/runtime 표현 전략과 adaptive composition projection이 바뀌면:
  - 먼저 `representation-design-lock` 을 수정하고
  - 그 다음 `current-state-as-is`, `next-implementation-roadmap`, 필요한 sibling 문서를 projection 한다.

## 고정된 대표 시나리오

- 빈 캔버스
- 입력: `봄 세일 이벤트 배너 만들어줘`
- 2분 이내
- live-commit
- 결과: 편집 가능한 배너 초안 1개

## 검증 힌트

- 이 문서 세트는 Markdown 중심 설계 문서다.
- 설계 철학 충돌 여부는 먼저 `SSOT` 의 axiom과 anti-pattern 표를 본다.
- runtime semantic contract 충돌 여부는 그 다음 `architecture` 의 `Verification Traceability Map` 과 `Document Authority and Verification Metadata` 를 본다.
- 문서 재평가 전에는 `requiredSlots`, `slot completeness`, `strict core schema`, `structured subplans`, `vnext-object-native-reference-architecture` 같은 옛 표현이 normative 문서에 남아 있는지 grep으로 확인하는 것이 좋다.
