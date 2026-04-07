# Tooldi Agent Workflow v1 Create Template Spring Photo Branch Phase B

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow v1 Create Template Spring Photo Branch Phase B |
| 문서 목적 | `spring template` vertical slice에 `photo branch` 를 `wide preset` 한정 execution-enabled 상태로 추가하는 기준을 잠근다. |
| 상태 | Draft |
| 문서 유형 | Phase Spec |
| 작성일 | 2026-04-07 |
| 기준 시스템 | `toolditor FE`, `Fastify Agent API`, `BullMQ Worker Runtime`, `Tooldi PHP content API` |
| 기준 데이터 | `tooldi-agent-workflow-v1-template-intelligence-design-lock.md`, `tooldi-agent-workflow-v1-create-template-spring-vertical-slice.md`, `tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-a.md` |
| 대상 독자 | PM, FE, Agent Backend, Worker, QA |
| Owner | Ouroboros workflow |

## 1. 문서 성격

- 이 문서는 `photo branch` 의 실제 canvas execution 기준을 잠근다.
- 이 문서는 `wide_1200x628` hero-photo path 만 다룬다.
- 이 문서는 multi-photo, photo background, auth/user-context source, AI crop/rewrite 를 잠그지 않는다.

## 2. 목표

Phase B 의 목표는 아래 하나다.

- worker 가 `photo branch` 를 선택한 경우, 실제 editor 에 hero photo object 1개를 deterministic bounds 로 삽입한다.

즉 아래는 해야 한다.

- `photo_selected` 와 `graphic_preferred` 를 실제 execution path 에 반영
- `place_photo_hero` action 및 `hero_image` mutation 생성
- `toolditor` 가 exact hero bounds + centered cover crop 으로 image object 를 추가

반면 아래는 아직 하지 않는다.

- same-run graphic fallback
- multi-photo collage
- square/story photo hero execution
- photo background replacement
- auth/user-context source

## 3. Scope Lock

### 3.1 포함

- `wide_1200x628` preset 전용 photo hero execution
- `foundation -> photo -> copy -> polish` 4-stage path
- `hero_image` slot
- centered cover crop
- fail-fast photo execution policy

### 3.2 제외

- same-run fallback retry
- non-wide preset photo execution
- photo object 추가 이후 별도 crop UI 자동 진입
- remove-background / rewrite / outpaint

## 4. Execution Rule

- `photoBranchMode=photo_selected` 인 경우에만 `place_photo_hero` action 을 생성한다.
- `photo_selected` 는 executable photo metadata 와 dedicated photo layout candidate 가 모두 있을 때만 허용한다.
- 실제 mutation 은 `slotKey=hero_image`, `layerType=image` 로 내려간다.
- `photo` 는 `background` 가 아니라 `hero visual object` 다.
- outer frame 는 hero bounds 를 그대로 사용하고, inner viewport 는 `centered_cover` 로 계산한다.
- image metadata 가 부족하거나 picture load 가 실패하면 run 은 fail-fast 로 종료한다.
- selection 단계의 `graphic fallback` 과 execution 단계의 `fail-fast` 는 별개다.
- photo stage 가 `rejected` 또는 `timed_out` 이면 worker 는 같은 run 안에서 copy/polish stage 를 더 진행하지 않는다.

## 5. Logging / Artifact Lock

worker 는 최소 아래 evidence 를 남겨야 한다.

- `selection-decision` 에 `photo_selected` execution metadata
- `run.log`
  - `[source/photo-execution] serial=... url=... fit=cover crop=centered_cover`
  - `[source/photo-stage] seq=... heroBounds=...`

즉 브라우저 패널만 봐도 “photo 가 실제로 실행 경로에 들어갔는지”를 알 수 있어야 한다.

## 6. Success Criteria

Phase B 가 끝났다고 부를 기준은 아래다.

- `wide_1200x628` 에서 `photo_selected` 경로가 실제 `hero_image` mutation 을 만든다
- toolditor 가 image object 를 exact hero bounds 로 추가한다
- `run.completed` 까지 유지된다
- photo metadata 누락/삽입 실패 시 reject code/message 가 그대로 surface 된다

## 7. References

- [tooldi-agent-workflow-v1-template-intelligence-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-template-intelligence-design-lock.md)
- [tooldi-agent-workflow-v1-create-template-spring-vertical-slice.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-vertical-slice.md)
- [tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-a.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-a.md)

## 8. Deferred Checklist

- Toolditor spike 의 `hero_image` 삽입 경로를 canonical serial-backed picture insertion seam 과 정렬할지 별도 턴에서 결정한다.

## 9. Verification Note

- 2026-04-07 localhost manual proof 에서 real-source `wide_1200x628` run 2종을 확인했다.
- hardening 전 run `run_20260407_052030_280_9f75f208` 은 `graphic_preferred` 로 완료됐고, 선택 evidence 는 아래와 같았다.
  - background `233`
  - graphic `1543358`
  - photo `185590`
  - reason: `graphic-first path remains safer for readability and execution despite the available photo candidate`
- hardening 후 run `run_20260407_052404_187_4e08e433` 은 `photo_selected` 로 완료됐고, evidence 는 아래와 같았다.
  - background `233`
  - graphic `1543358`
  - photo `185590`
  - layout `copy_left_with_right_photo`
  - `hero_image` stage applied
- 즉 Phase B 는 localhost real-source mode 에서
  - `graphic_preferred` fallback reasoning 이 실제로 surface 되고
  - narrow tolerance hardening 후 `photo_selected` execution path 도 실제로 적용되는 상태까지 확인됐다.
