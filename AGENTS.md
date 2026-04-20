# Tooldi Agent Workflow Docs Guide

이 폴더는 Tooldi 자연어 agent/workflow 문서 묶음이다.

**현재 authority / design lock**: [`tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md`](./tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md) (2026-04-20 제정).

v5 SSOT는 2026-04-16자 `Template-Aware Adaptive Composition SSOT` 를 **대체**한다. adaptive composition의 A1~A5 axiom, retain/modify/remove/add decision DSL, addable vocabulary registry, projected template object graph 는 전부 폐기되었다.

## 현재 normative 문서

- [`tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md`](./tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md) — **철학/파이프라인/재사용·폐기 경계/모델 선택 SSOT**
- [`tooldi-natural-language-agent-v1-architecture.md`](./tooldi-natural-language-agent-v1-architecture.md) — runtime semantic contract (artifact identity, completion moment, Canvas Mutation Protocol 구조). v5와 정합.
- [`tooldi-agent-workflow-v1-functional-spec-to-be.md`](./tooldi-agent-workflow-v1-functional-spec-to-be.md) — public/API/persistence projection. v5 SSOT와 재정렬 중.
- [`tooldi-agent-workflow-v1-backend-boundary.md`](./tooldi-agent-workflow-v1-backend-boundary.md) — backend/control-plane, worker/execution-plane, queue/store 경계.
- [`toolditor-agent-workflow-v1-client-boundary.md`](./toolditor-agent-workflow-v1-client-boundary.md) — FE/toolditor 적용 경계.
- [`tooldi-agent-workflow-v1-scope-operations-decisions.md`](./tooldi-agent-workflow-v1-scope-operations-decisions.md) — v1 scope/non-scope, stack lock, operations decision.
- [`tooldi-agent-workflow-v1-create-template-current-state-as-is.md`](./tooldi-agent-workflow-v1-create-template-current-state-as-is.md) — AS-IS current truth. v5 전환 진행 중 상태.
- [`tooldi-agent-workflow-v1-doc-index.md`](./tooldi-agent-workflow-v1-doc-index.md) — 읽기 순서 인덱스. v5 반영 상태.

## Historical (대체됨, 배경 참조만)

- [`tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md`](./tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md) — v5 SSOT로 대체. adaptive composition 배경 이해 시에만.
- [`tooldi-agent-workflow-v1-create-template-representation-design-lock.md`](./tooldi-agent-workflow-v1-create-template-representation-design-lock.md) — adaptive composition projection이었으므로 v5로 폐기.
- [`tooldi-agent-workflow-v1-template-intelligence-design-lock.md`](./tooldi-agent-workflow-v1-template-intelligence-design-lock.md) — reference discovery / addable vocabulary 개념 자체가 v5에서 제거되므로 폐기.
- [`tooldi-agent-workflow-vnext-object-native-reference-architecture.md`](./tooldi-agent-workflow-vnext-object-native-reference-architecture.md) — historical.
- [`tooldi-agent-workflow-v4-topology-driven-editor-native-architecture.md`](./tooldi-agent-workflow-v4-topology-driven-editor-native-architecture.md) — historical.

## 문서 권한 순서

1. `tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md`
   - 설계 철학 (V1~V5 axiom), 6단계 파이프라인, 재사용·폐기·신설 경계, 모델 선택 regime의 유일 SSOT.
   - 이 문서가 닫은 것은 다른 문서가 재정의할 수 없다.

2. `tooldi-natural-language-agent-v1-architecture.md`
   - runtime semantic contract authority.
   - canonical artifact identity, counted completion moment, lifecycle ownership, ordering, rollback, Canvas Mutation Protocol 구조를 닫는다.
   - 설계 철학 자체는 v5 SSOT로 소급한다.

3. `tooldi-agent-workflow-v1-functional-spec-to-be.md`
   - product/API/persistence projection.
   - v5 파이프라인 계약을 구현 관점으로 투영한다.

4. `tooldi-agent-workflow-v1-backend-boundary.md`
   - backend/worker/queue/store 경계.

5. `toolditor-agent-workflow-v1-client-boundary.md`
   - FE/toolditor 적용 경계 (Canvas Mutation Protocol ack/emit).

6. `tooldi-agent-workflow-v1-scope-operations-decisions.md`
   - v1 scope, stack, operations decision.

7. `tooldi-agent-workflow-v1-create-template-current-state-as-is.md`
   - current truth. v5 전환 진행 중 gap 기록.

8. `tooldi-agent-workflow-v1-doc-index.md`
   - 읽기 순서 인덱스.

## 읽는 순서

- PM/아키텍처 리뷰:
  - `doc-index` → `v5 SSOT` → `architecture` → `scope-operations-decisions` → `functional-spec`

- Backend/worker 구현:
  - `doc-index` → `v5 SSOT` → `current-state-as-is` → `architecture` → `backend-boundary` → `functional-spec`

- FE/toolditor 구현:
  - `doc-index` → `v5 SSOT` → `current-state-as-is` → `architecture` → `client-boundary` → `functional-spec`

- 운영/QA/리뷰:
  - `doc-index` → `v5 SSOT` → `current-state-as-is` → `architecture` → `scope-operations-decisions` → `functional-spec`

## 수정 규칙

- 설계 철학(v5 axiom), 6단계 파이프라인, 재사용·폐기·신설 경계, 모델 선택 regime이 바뀌면:
  - 먼저 `v5 SSOT` 를 수정하고
  - 그 다음 `architecture`, `functional-spec`, `backend-boundary`, `client-boundary`, `scope-operations-decisions` 로 projection을 맞춘다.

- artifact identity, counted completion moment, authority ownership, ordering primitive, checkpoint/rollback, Canvas Mutation Protocol 구조가 바뀌면:
  - 먼저 `architecture` 를 수정하고
  - 그 다음 `functional-spec`, `backend-boundary`, `client-boundary`, `scope-operations-decisions` 로 projection을 맞춘다.

- 현재 코드가 실제로 하는 일과 known gap이 바뀌면:
  - 먼저 `current-state-as-is` 를 수정하고
  - 필요하면 `README.md`, `doc-index` 를 함께 맞춘다.

- public request/response/tool schema, FR/BR/NFR, persistence field를 바꾸면:
  - 먼저 `functional-spec-to-be` 를 수정하고
  - 필요하면 `backend-boundary` 와 `client-boundary` 를 맞춘다.

- default 모델 교체(`gemini-3.1-flash-lite-preview` → 다른 모델):
  - `bench/method-compare-phase1/` 재실행 + parity/cost/latency 증거 제출 후
  - `v5 SSOT` 의 §0.3 "증거 기반" 및 §6.2 "cost 프로파일"을 갱신하고
  - `modelRegistry.ts` (구현 시) 와 AGENTS.md 를 갱신한다.

## 고정된 대표 시나리오

- 빈 캔버스 1200×628
- 입력: `봄 세일 이벤트 배너 만들어줘`
- 2분 이내
- live-commit
- 결과: 편집 가능한 배너 초안 1개

## 검증 힌트

- 설계 철학 충돌 여부는 먼저 `v5 SSOT` 의 §1.2 axiom 표와 §1.3 anti-pattern 표를 본다.
- runtime semantic contract 충돌 여부는 그 다음 `architecture` 의 `Verification Traceability Map` 과 `Document Authority and Verification Metadata` 를 본다.
- v5 전환이 코드 레벨로도 반영됐는지 확인하려면:
  ```
  rg -n "Template-Aware Adaptive Composition|ReferenceBlockKind|addableVocabulary|resolveRequiredExecutionSlots|retain/modify/remove/add|projectedObjectGraph|ObjectNativeClusterFamily" \
    agent-workflow-test/ --glob '!*v5-*' --glob '!*historical*'
  ```
  0 hits가 전환 완료 조건.
- 모델 교체 PR의 정합성은 `bench/method-compare-phase1/` 경로가 PR body에 포함되는지로 판단.
