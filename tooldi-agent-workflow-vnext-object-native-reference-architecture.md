# Tooldi Agent Workflow vNext Object-Native Reference Architecture

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow vNext Object-Native Reference Architecture |
| 문서 목적 | `retrieval_prior_v2_reset`의 semantic-slot hybrid 한계를 명시하고, object-native reference execution으로 전환할 아키텍처 철학과 정상 동작 목표를 고정한다. |
| 상태 | Working Draft |
| 문서 유형 | TO-BE Architecture / Design Reset |
| 작성일 | 2026-04-15 |
| 기준 시스템 | `toolditor` FE spike, `agent-api`, `agent-worker`, `retrieval_prior_v2`, `retrieval_prior_v2_reset` |
| 대상 독자 | PM, FE, Agent Backend, Worker, QA, Reviewer |
| Owner | TBD |

## 1. 이 문서가 닫는 질문

- 왜 `retrieval_prior_v2_reset`을 계속 미세 조정해도 브라우저 결과가 거의 안 바뀌는가
- 왜 `reference-first`를 표방하면서도 실제로는 비슷한 fallback 결과만 반복되는가
- 다음 구현은 무엇을 더 고치는 것이 아니라, 어떤 실행 계약을 버리고 무엇으로 교체해야 하는가
- 새 시스템이 정상적으로 동작할 때 사용자는 무엇을 보게 되는가

이 문서는 세부 구현 순서보다 먼저 `철학`, `contract`, `정상 동작 모습`, `현재 확보된 것`, `현재 없는 것`을 고정한다.

## 2. 현재 시스템에 대한 판정

### 2.1 지금 실제로 동작하는 방식

현재 `retrieval_prior_v2_reset`은 이름상으로는 `reference-first`지만, 실행 시점에는 여전히 좁은 semantic contract를 사용한다.

현재 stable admission이 실질적으로 요구하는 것은 아래와 같다.

- 제목으로 쓸 수 있는 블록 1개
- promo surface/text 1세트
- CTA surface/text 1세트
- footer 1개
- safe decor 0~1개

즉 planner는 reference를 더 자유롭게 읽으려 하지만, 마지막에는 다시 `headline / offer / cta / footer` 성격의 구조로 압축해 실행 가능 여부를 판단한다.

### 2.2 왜 브라우저 결과가 거의 안 바뀌는가

최근 작업은 대부분 아래 성격이었다.

- unsafe stable 방지
- style-only fallback 안전화
- text height / promo surface-text 정합성 보정
- off-canvas / zone conflict guard

이 작업들은 모두 필요했지만, 공통적으로 **안전성** 중심이었다.  
즉 “깨지지 않게” 만들었지, “reference object composition이 실제로 살아나게” 만들지는 못했다.

대표 사례는 `19046887349`다.

- 검색상으로는 strong hit다
- 하지만 parsed object는 `할인해`, `봄` 같은 장식성 대형 text와 cue text 위주다
- 현재 semantic stable contract가 요구하는 `canonical headline block`은 없다
- 그래서 runtime은 계속 `style_only`로 downgrade 한다
- 브라우저에서는 결국 비슷한 fallback 배너가 나온다

결론적으로 현재 병목은 heuristic 하나가 아니라 `execution contract`다.

## 3. 왜 아키텍처를 바꿔야 하는가

현재 구조의 한계는 세 가지다.

### 3.1 검색 품질과 실행 품질이 분리된다

search는 reference를 잘 고를 수 있어도, execution contract가 그 reference를 받아들이지 못하면 결과는 다시 generic fallback으로 수렴한다.

### 3.2 reference를 읽어도 결국 semantic slot으로 환원된다

현재 구조에서는 decorative display pair, object cluster, band-text pair, corner image cluster 같은 실제 reference composition을 있는 그대로 실행할 수 없다.

### 3.3 fallback이 점점 메인 엔진처럼 비대해진다

`style_only`를 안전하게 만들수록 결과는 덜 깨지지만, 동시에 reference-relatedness는 올라가지 않는다.  
이 상태로 fallback polish를 더하는 건 과적합 위험만 키우고 visible quality는 거의 못 올린다.

따라서 다음 단계는 `reset을 더 미세 조정`하는 것이 아니라, `semantic-slot hybrid`를 버리고 `object-native reference execution`으로 전환하는 것이다.

## 4. 새 철학

새 시스템은 다음 철학으로 움직여야 한다.

- retrieval은 “좋아 보이는 템플릿”을 찾는 단계가 아니라 “실행 가능한 reference object graph”를 찾는 단계다
- planner의 최종 산출물은 semantic slot이 아니라 `editable object graph`다
- copy는 구조를 결정하지 않는다. copy는 선택된 object/cluster에 bind된다
- stable 여부는 “headline이 있나?”가 아니라 “이 object graph가 editable하고 render-safe한가?”로 판정한다
- support refs는 geometry authority를 갖지 않는다. style evidence만 제공한다
- `잘못된 stable`보다 `안전한 fallback`이 낫지만, fallback을 계속 두껍게 만들지는 않는다
- 브라우저에서 visible change가 예상되지 않으면 기능 커밋하지 않는다

이 철학에서 semantic label은 완전히 사라지지 않을 수 있다. 다만 그것은 설명용 힌트이며, 통과 조건이 아니다.

## 5. 새 시스템이 정상적으로 동작할 때의 모습

정상적인 run은 아래처럼 흘러야 한다.

1. retrieval이 top-k reference를 수집한다.
2. 각 candidate에 대해 `reference-object-audit`를 수행한다.
3. audit은 실제 object family를 판정한다.
   - large text object
   - band-like surface
   - text + surface pair
   - image/group decor
   - microtext
   - background
4. candidate마다 `object-native readiness`를 계산한다.
   - editable object로 유지 가능한가
   - text replacement 후 render-safe한가
   - cluster 간 충돌이 허용 범위 안인가
5. 가장 search-relevant하면서도 object-native readiness를 통과하는 candidate를 고른다.
6. 선택된 reference에서 `cluster graph`를 만든다.
   - big text cluster
   - promo band cluster
   - CTA cluster
   - decor cluster
   - microtext cluster
7. prompt/copy에서 만든 `message atoms`를 cluster에 bind한다.
8. `object-execution-plan`을 만든다.
   - text는 replacement + fit
   - shape/image/group은 최대한 reference 구조 유지
9. 마지막 `renderability guard`를 통과하면 stable 실행
10. guard 실패 시에만 `style_only fallback`

여기서 중요한 것은:

- object cluster가 먼저다
- copy atom은 나중에 붙는다
- semantic slot은 실행의 진실(source of truth)이 아니다

정상 동작하는 시스템의 브라우저 결과는 아래를 만족해야 한다.

- 현재 `style_only fallback`과 visibly different 해야 한다
- reference의 object composition이 하나 이상 실제로 살아남아야 한다
- text/shape/image/group이 editable 상태로 남아야 한다
- render-safe 해야 한다

## 6. 새 실행 계약

현재 `v2_reset`의 최종 진실은 사실상 `freeform copy blocks + narrow semantic stable contract`다.  
새 계약에서는 최종 진실을 아래처럼 바꾼다.

### 6.1 Core artifacts

- `reference-object-audit`
  - 후보별 object-native readiness와 rejection reason
- `reference-cluster-graph`
  - 실제 object를 cluster로 묶은 결과
- `message-atom-plan`
  - `primary`, `offer`, `cta`, `detail` 등 느슨한 메시지 단위
- `cluster-binding-plan`
  - 어떤 atom을 어떤 cluster에 넣을지
- `object-execution-plan`
  - 실제 editable object 실행 계획
- `renderability-report`
  - canvas fit, overlap, text replacement safety, decor collision 결과

### 6.2 Cluster contract

cluster는 descriptive label만 가진다.

예:

- `big_text_cluster`
- `promo_band_cluster`
- `cta_cluster`
- `corner_decor_cluster`
- `microtext_cluster`

하지만 아래 같은 규칙은 두지 않는다.

- “반드시 headline cluster가 있어야 stable”
- “반드시 cta slot이 있어야 stable”
- “support cluster가 없으면 weak”

### 6.3 Stable 판정 기준

stable은 semantic completeness가 아니라 renderability로 판정한다.

- 모든 emitted object가 캔버스 안에 있음
- text replacement 후 실제 bounds 안에 들어감
- cluster끼리 충돌이 허용 범위 안임
- decor/image/group이 copy cluster를 심하게 가리지 않음
- text/shape/image/group으로 editable하게 남음

## 7. 현재 확보된 것과 재사용할 것

완전히 처음부터 다시 만드는 것은 아니다. 이미 확보한 기반은 재사용한다.

### 7.1 이미 확보된 기반

- `v2_freeform` execution carrier
- legacy execution과 V2 execution 분리
- FE text-height invariant 수정
- FE semantic custom font contract 보강 기반
- runtime style-only fallback 안전화
- runtime renderability guard
- mutation cleanup / ownership model

### 7.2 재사용 원칙

- FE apply surface는 당분간 그대로 둔다
- `shape / text / group / image` editable object 실행은 유지한다
- 현재 `renderability guard`는 새 path에서도 마지막 단계 safety net으로 재사용한다
- style-only fallback은 baseline / safety path로만 유지한다

즉 바꿔야 하는 것은 FE renderer가 아니라 planner truth와 admission contract다.

## 8. 현재 안 된 것

현재 기준으로 아직 없는 것, 혹은 구조상 막힌 것은 아래다.

- object-native readiness audit
- candidate reselection based on readiness
- cluster graph 기반 planner truth
- cluster binding 기반 execution
- semantic slot 없이 stable을 판정하는 contract
- decorative display pair / object pair를 재사용 가능한 cluster로 보는 규칙
- visible-change-first commit discipline

중요한 것은 이 중 첫 네 가지가 없으면, 그 뒤의 품질 개선은 모두 다시 fallback polish로 흘러간다는 점이다.

## 9. 현재 경로에서 중단할 것

아래는 당분간 중단한다.

- `retrieval_prior_v2_reset`의 fallback polish 추가
- `headline/promo/cta/footer` 규칙 미세 조정
- stable threshold 미세 조정
- decor 조금씩 붙이는 작업
- graphics/shapes/vectors 확장
- recovery/resume 인프라 수정

이것들은 지금 visible quality bottleneck이 아니다.

## 10. 앞으로 브라우저 없이 판단할 단계와 브라우저가 필요한 단계

### 10.1 브라우저 없이 가능한 단계

아래는 data-only로 먼저 판단한다.

- top-k 후보별 `reference-object-audit`
- candidate별 readiness score / reason
- hostile vs stable-capable 분류
- cluster graph 생성 가능 여부
- text replacement 후 renderability data 검사

이 단계에서 변화가 없으면 브라우저를 돌리지 않는다.

### 10.2 브라우저가 필요한 단계

브라우저는 아래 중 하나가 있을 때만 본다.

- candidate reselection이 실제로 일어났다
- `style_only -> stable` 실제 승격이 일어났다
- object-native cluster가 살아서 기존 fallback과 visibly different 할 것이 예상된다

즉 artifact가 그대로인데 브라우저만 반복해서 누르는 건 금지한다.

## 11. 현재 기준 Done / Not Done

### 11.1 Done

- `retrieval_prior_v2_reset` safety hardening
  - unsafe stable reject
  - style-only readable fallback
  - promo surface/text contrast 분리
  - text height invariant 보정
- FE freeform execution을 통한 editable text/shape/group/image apply 기반
- recovery 에러와 품질 이슈를 분리해서 보는 운영 판단

### 11.2 Not Done

- object-native reference audit
- object-native candidate reselection
- cluster graph planner truth
- object-native stable execution
- visible change를 보장하는 reference carry-over

## 12. 다음 구현이 따라야 할 규칙

- 다음 경로는 `retrieval_prior_v2_reset`의 연장이 아니라 별도 실험 경로로 분리한다
- 현재 `v2_reset`은 baseline으로 동결한다
- 새 경로는 `object-native`를 contract로 삼는다
- visible change가 없으면 기능 커밋하지 않는다
- 브라우저 검증은 candidate reselection 또는 stable 승격이 데이터상 확인된 뒤에만 한다

## 13. 실무적 결론

지금은 `reset`을 더 손볼 때가 아니다.  
지금 필요한 건 `semantic-slot hybrid`를 끝내고 `object-native reference execution`으로 넘어가는 것이다.

최근 커밋들이 쌓였는데 브라우저 결과가 거의 안 바뀐 이유는, safety hardening은 계속 있었지만 execution truth는 여전히 좁은 semantic contract에 묶여 있었기 때문이다.

따라서 다음 시스템은 아래처럼 바뀌어야 한다.

- search strong + extraction weak = fallback
- search strong + object-native ready = stable
- stable 여부는 semantic slot completeness가 아니라 renderability로 판정
- 브라우저에서 visible change가 없으면 그 작업은 아직 architecture 전환에 성공하지 못한 것이다
