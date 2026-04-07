# Tooldi Agent Workflow v1 Create Template Spring Photo Branch Phase A

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow v1 Create Template Spring Photo Branch Phase A |
| 문서 목적 | `spring template` vertical slice에 `photo branch` 를 selection-enabled / execution-deferred 상태로 추가하는 Phase A 기준을 잠근다. |
| 상태 | Draft |
| 문서 유형 | Phase Spec |
| 작성일 | 2026-04-07 |
| 기준 시스템 | `toolditor FE`, `Fastify Agent API`, `BullMQ Worker Runtime`, `Tooldi PHP content API` |
| 기준 데이터 | `tooldi-agent-workflow-v1-template-intelligence-design-lock.md`, `tooldi-agent-workflow-v1-create-template-spring-vertical-slice.md`, `tooldi-agent-workflow-v1-tooldi-content-discovery.md` |
| 대상 독자 | PM, FE, Agent Backend, Worker, QA |
| Owner | Ouroboros workflow |

## 1. 문서 성격

- 이 문서는 `봄 템플릿 만들어줘` vertical slice 안에서 `photo branch` 만 따로 잠그는 narrow phase spec 이다.
- 이 문서는 `photo execution` 완료 문서가 아니다.
- 이 문서가 잠그는 것은 `photo candidate assembly`, `photo compare rule`, `photo branch decision logging/artifact`, `graphic fallback rule` 이다.

## 2. 목표

Phase A 의 목표는 아래 하나다.

- worker 가 실제 Tooldi `picture` inventory 를 조회해 `photo branch` 를 평가하고, 그 결과를 artifact 와 `run.log` 에 명시적으로 남긴다.

즉 아래는 해야 한다.

- `photo` 후보를 실제 source 에서 가져온다
- `graphic-only` 와 `photo-right-hero` 를 비교한다
- 최종적으로 `photo branch` 를 택했는지/버렸는지 이유를 남긴다

반면 아래는 아직 하지 않는다.

- editor 에 photo object 를 실제 삽입
- multi-photo
- photo background 전체 치환
- auth/user-context source
- AI crop / rewrite / remove-background

## 3. Scope Lock

### 3.1 포함

- real Tooldi `get_pictures` query
- `photo_candidate_set`
- `photo branch` compare
- selection artifact 및 `run.log` 진단
- wide preset hero-photo suitability 판정

### 3.2 제외

- photo mutation execution
- square/story preset photo hero execution
- personalized ranking
- creator-private picture source
- direct MariaDB runtime query

## 4. Photo Source Policy

- source-of-truth 는 direct DB 가 아니라 Tooldi PHP API 다.
- runtime base URL 은 `localhost` 만 허용한다.
- public-ish search 만 사용한다.
- Phase A query 는 아래 waterfall 로 고정한다.
  1. `keyword=봄 + orientation match`
  2. `keyword=봄`
  3. `orientation match + initial load`

`follow`, personalized price, creator-private inventory 는 사용하지 않는다.

## 5. Photo Candidate Semantics

- `photo` 는 `hero visual candidate` 다.
- `photo` 는 `background candidate` 가 아니다.
- Phase A 에서 한 run 이 평가하는 photo 는 최대 1장이다.
- candidate ranking 은 최소 아래를 본다.
  - seasonal fit
  - focal safety
  - crop safety
  - copy separation support
  - fallback safety

## 6. Selection Rule

### 6.1 기본 원칙

- 기본 우선순위는 여전히 `graphic-first / photo-optional` 이다.
- `photo` 는 graphic 보다 명확한 이점이 있을 때만 선택 후보로 승격한다.

### 6.2 selection output

selection 단계는 최소 아래를 남겨야 한다.

- top photo candidate serial/category
- `photoBranchMode`
- `photoBranchReason`
- 최종 execution path 는 여전히 `graphic safe fallback` 이라는 사실

### 6.3 mode lock

`photoBranchMode` 는 아래 3개로 잠근다.

- `not_considered`
- `graphic_preferred`
- `photo_selected_execution_deferred`

의미:

- `not_considered`
  - tool policy 상 photo 가 꺼져 있거나
  - layout/preset 상 hero photo 비교 자체가 무의미한 경우
- `graphic_preferred`
  - photo 는 조회/비교했지만 graphic path 가 더 안전하거나 적절한 경우
- `photo_selected_execution_deferred`
  - photo 가 더 적합하다고 판단됐지만, Phase A 범위상 실제 mutation execution 은 다음 단계로 미루는 경우

## 7. Logging / Artifact Lock

worker 는 최소 아래 evidence 를 남겨야 한다.

- `source-search-summary` 에 photo family 결과
- `selection-decision` 에 top photo serial/category 및 branch mode
- `run.log`
  - `[source/photo] returned=... selectedSerial=... orientation=...`
  - `[source/photo-branch] mode=... reason=...`

즉 브라우저 패널만 봐도 “photo 를 실제로 조회했고 왜 안 썼는지”를 알 수 있어야 한다.

## 8. Success Criteria

Phase A 가 끝났다고 부를 기준은 아래다.

- real source mode 에서 `photo` query/result evidence 가 보인다
- top photo candidate 와 branch mode 가 artifact 로 남는다
- `photo_selected_execution_deferred` 와 `graphic_preferred` 가 구분된다
- current spring execution path 는 깨지지 않는다

## 9. References

- [tooldi-agent-workflow-v1-template-intelligence-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-template-intelligence-design-lock.md)
- [tooldi-agent-workflow-v1-create-template-spring-vertical-slice.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-vertical-slice.md)
- [tooldi-agent-workflow-v1-tooldi-content-discovery.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-tooldi-content-discovery.md)
