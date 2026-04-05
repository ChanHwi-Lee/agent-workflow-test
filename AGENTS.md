# Tooldi Agent Workflow v1 Docs Guide

이 폴더는 Tooldi 자연어 agent/workflow v1 설계 문서 묶음을 모아 둔 전용 문서 폴더다.

## 포함 문서

- `tooldi-natural-language-agent-v1-architecture.md`
- `tooldi-agent-workflow-v1-functional-spec-to-be.md`
- `tooldi-agent-workflow-v1-backend-boundary.md`
- `toolditor-agent-workflow-v1-client-boundary.md`
- `tooldi-agent-workflow-v1-scope-operations-decisions.md`

## 문서 권한 순서

1. `tooldi-natural-language-agent-v1-architecture.md`
   - semantic contract의 최상위 authoritative source
   - canonical artifact identity, counted completion moment, lifecycle ownership, ordering, rollback semantics, primitive reuse boundary는 이 문서를 기준으로 닫는다.

2. `tooldi-agent-workflow-v1-functional-spec-to-be.md`
   - product/API/persistence projection 문서
   - FR/BR/NFR, northbound request, tool contract, persistence field를 구현 관점으로 푼다.
   - architecture 문서가 이미 닫은 의미를 override하면 안 된다.

3. `tooldi-agent-workflow-v1-backend-boundary.md`
   - backend/control-plane, worker/execution-plane, queue/store 경계 문서
   - sync/async split, canonical durable writer, northbound/southbound handoff를 설명한다.

4. `toolditor-agent-workflow-v1-client-boundary.md`
   - FE/toolditor 적용 경계 문서
   - 입력창, run visibility, SSE, live-commit apply, canvas command path 연결을 설명한다.

5. `tooldi-agent-workflow-v1-scope-operations-decisions.md`
   - v1 scope/non-scope, stack lock, operations decision을 잠그는 decision record
   - 무엇을 v1에서 하지 않을지와 운영자가 무엇을 day one부터 봐야 하는지 고정한다.

## 읽는 순서

- PM/아키텍처 리뷰:
  - `architecture` -> `scope-operations-decisions` -> `functional-spec`

- Backend/worker 구현:
  - `architecture` -> `backend-boundary` -> `functional-spec`

- FE/toolditor 구현:
  - `architecture` -> `client-boundary` -> `functional-spec`

- 운영/QA/리뷰:
  - `architecture` -> `scope-operations-decisions` -> `functional-spec`

## 수정 규칙

- artifact identity, completion semantics, authority ownership, ordering primitive, checkpoint/rollback을 바꾸면:
  - 먼저 `architecture` 를 수정하고
  - 그 다음 `functional-spec`, `backend-boundary`, `client-boundary`, `scope-operations-decisions` 로 projection을 맞춘다.

- public request/response/tool schema, FR/BR/NFR, persistence field를 바꾸면:
  - 먼저 `functional-spec` 를 수정하고
  - 필요하면 `backend-boundary` 와 `client-boundary` 를 맞춘다.

- v1 포함/제외 범위, stack choice, 운영 decision을 바꾸면:
  - 먼저 `scope-operations-decisions` 를 수정하고
  - 다른 문서의 표현을 동일하게 맞춘다.

## 고정된 대표 시나리오

- 빈 캔버스
- 입력: `봄 세일 이벤트 배너 만들어줘`
- 2분 이내
- live-commit
- 결과: 편집 가능한 배너 초안 1개

## 검증 힌트

- 이 문서 세트는 Markdown 중심 설계 문서다.
- 문서 간 의미 충돌을 볼 때는 `architecture` 의 `Verification Traceability Map` 과 `Document Authority and Verification Metadata` 를 먼저 본다.
- 문서 재평가 전에는 completion moment, authoritative source, scope wording이 sibling 문서에서 다시 어긋나지 않았는지 grep으로 확인하는 것이 좋다.
