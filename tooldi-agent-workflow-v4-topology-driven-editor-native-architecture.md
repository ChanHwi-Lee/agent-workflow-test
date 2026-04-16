# Tooldi Agent Workflow v4 Topology-Driven Editor-Native Architecture

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow v4 Topology-Driven Editor-Native Architecture |
| 문서 목적 | v3의 object-native bootstrap slice 이후, 다음 설계를 `semantic slot` 이 아니라 `topology + editor-native object graph` 기준으로 재정의한다. |
| 상태 | Working Draft |
| 문서 유형 | TO-BE Architecture / Design Proposal |
| 작성일 | 2026-04-16 |
| 기준 시스템 | `toolditor` FE spike, `agent-api`, `agent-worker`, `object_native_v1` |
| 대상 독자 | PM, FE, Agent Backend, Worker, QA, Reviewer |
| Owner | TBD |

## 1. 이 문서가 닫는 질문

- `topology` 를 Tooldi 문맥에서 정확히 무엇으로 정의해야 하는가
- 왜 다음 단계가 `slot polish` 가 아니라 `topology-driven execution contract` 여야 하는가
- 실제 디자인 도메인과 웹 에디터 도메인을 보면 어떤 제약과 원칙이 생기는가
- v3의 어떤 부분은 유지하고, 어떤 부분을 v4 contract로 바꿔야 하는가
- 첫 v4에서 어떤 topology family를 열고 어떤 migration 순서로 가야 하는가

이 문서는 새 runtime을 처음부터 다시 만들자는 문서가 아니다.  
이 문서는 **v3 runtime spine을 유지하면서, planner truth / completion truth / execution admission contract를 topology-driven으로 교체**하기 위한 설계 문서다.

## 2. 현재 판정

### 2.1 유지해야 하는 것

현재 v3는 아래 기반을 이미 확보했다.

- `BullMQ + LangGraph` 기반 single-run orchestration
- `candidate audit -> selection -> judge -> refine -> finalize` artifact chain
- `object_native_v1` artifact family
  - `object-native-reference-audit`
  - `object-native-candidate-selection`
  - `object-native-renderability-report`
  - `object-native-cluster-graph`
- `saveEvidence + saveReceipt + finalRevision` 기반 save truth hardening
- toolditor FE의 실제 live-commit apply / ack / save 연결

즉 v3는 버릴 대상이 아니라 **다음 contract를 얹을 수 있는 spine** 이다.

### 2.2 교체해야 하는 것

현재 `object_native_v1` 는 철학적으로는 object-native를 지향하지만, 실제 contract는 아직 첫 bootstrap slice에 묶여 있다.

- semantic gate는 사실상 `display_text + promo_surface + action_surface` 존재 여부에 크게 의존한다.
- binding은 `headline / offer_line / cta` 중심이다.
- completion truth도 `requiredExecutionSlots=["background","headline","offer_line","cta"]` 로 닫힌다.

이 상태는 첫 vertical slice를 닫는 데는 유효했지만, 다음 문제가 남는다.

- 디자인 구조가 여전히 특정 프로모션 골격으로 수렴한다.
- topology diversity가 늘어나도 completion truth가 따라가지 못한다.
- CTA가 없는 editorial/banner composition 같은 합법적 초안도 구조적으로 불리해진다.
- slot을 더 늘리면 다시 v2식 completeness regression 으로 돌아간다.

## 3. 외부 도메인 grounding

### 3.1 디자인 도메인에서 중요한 것은 semantic slot보다 visual hierarchy와 relation이다

Canva의 visual hierarchy 가이드는 텍스트가 있는 디자인에서 기본적으로 **3-level typographic hierarchy**, spacing, grouping, section separation이 중요하다고 설명한다.  
즉 실제 디자인은 `headline/promo/cta` 같은 semantic 라벨보다:

- 무엇이 가장 먼저 보이는가
- 어떤 요소들이 함께 읽히는가
- 어떤 cluster가 section을 이루는가
- spacing이 hierarchy를 어떻게 만든는가

가 먼저다.  
Source: Canva Visual Hierarchy Guide, https://www.canva.com/learn/visual-hierarchy/

이 말은 Tooldi에서 `topology` 를 정의할 때도 **semantic slot schema** 가 아니라 아래를 기준으로 해야 한다는 뜻이다.

- focal cluster
- supporting cluster
- action affordance cluster
- media cluster
- accent/decor cluster
- fineprint/context cluster
- 이들 사이의 위치/정렬/중첩/우선순위 관계

### 3.2 실제 웹 기반 디자인 에디터는 layer tree / node graph를 진실로 다룬다

Figma 공식 개발자 문서는 모든 파일이 `DocumentNode -> PageNode -> node tree` 구조를 가지며, 각 subtree가 canvas 상의 layer/object를 나타낸다고 설명한다. node는 frame, component, vector, rectangle 같은 타입을 가진다.  
Source: Figma Plugin Docs, https://developers.figma.com/docs/plugins/

즉 브라우저 기반 디자인 에디터의 실제 진실은:

- semantic slot list가 아니라 node tree다
- geometry, z-order, parent-child 관계가 편집 가능성의 핵심이다
- 최종 산출물은 text/shape/group/image 같은 editor-native node로 남아야 한다

Tooldi도 같은 종류의 도메인 문제를 가진다.  
현재 contracts와 mutations 역시 `createLayer/updateLayer/deleteLayer/saveTemplate` 와 `group/shape/text/image` layer type을 source of truth로 갖는다.

### 3.3 AI design workflow도 “완성품 자동 생성”보다 editable handoff가 핵심이다

Canva AI connector와 MCP workflow 문서는 AI assistant가 design을 만들거나 수정한 뒤에도 사용자가 바로 editor에서 열어 수정할 수 있는 **design edit handoff** 를 항상 제공해야 한다고 설명한다.  
Source: Canva AI Connector, https://www.canva.com/ai-connector/  
Source: Canva Design Edit Handoff, https://www.canva.dev/docs/mcp/workflows/design-edit/

이건 Tooldi 방향과 직접 맞닿아 있다.

- AI는 최종 flattened deliverable을 닫는 엔진이 아니다.
- AI는 editable draft를 만들고 handoff하는 엔진이다.
- 따라서 topology도 “최종 카피 완성도”보다 “editor 안에서 살아남는 구조”를 우선해야 한다.

### 3.4 agent 설계도 workflow-first가 맞다

Anthropic은 가장 성공적인 agent 시스템이 복잡한 프레임워크보다 **simple, composable patterns** 를 쓴다고 설명하고, well-defined task에는 workflow의 예측 가능성이 더 적합하다고 본다. OpenAI Agent Builder도 typed node/edge 기반 workflow를 중심으로 설명한다.  
Source: Anthropic Building Effective Agents, https://www.anthropic.com/engineering/building-effective-agents  
Source: OpenAI Agent Builder, https://developers.openai.com/api/docs/guides/agent-builder

따라서 Tooldi의 다음 설계도:

- 다중 자율 디자이너 agent를 여럿 두는 방식보다
- **단일 orchestrator + topology registry + typed artifacts + bounded judge loop**

가 더 맞다.

## 4. Topology 정의

### 4.1 정의

이 문서에서 `topology` 는 다음을 뜻한다.

> **editable design draft를 구성하는 cluster 집합, cluster 간 relation, 허용되는 editor node type, bind 가능한 message atom 범위, completion contract를 함께 묶은 실행 가능한 composition family**

즉 topology는:

- 템플릿 1개가 아니다
- 카피 문안이 아니다
- style preset이 아니다
- global slot schema가 아니다

반대로 topology는 아래를 포함한다.

- 어떤 종류의 cluster가 존재할 수 있는가
- 어떤 cluster가 필수/선택인가
- cluster가 canvas에서 어떤 relation을 가져야 하는가
- 각 cluster가 어떤 node type으로 emit되어야 하는가
- 어떤 message atom을 어디까지 수용할 수 있는가
- 어떤 상태를 minimum editable success로 볼 것인가

### 4.2 topology와 slot의 차이

`slot` 은 보통 전역적으로 동일한 semantic name을 가진다.

- `headline`
- `cta`
- `supporting_copy`

반면 `topology` 는 전역 slot schema가 아니라 **family-specific composition contract** 다.

예:

- `centered_message_stack`
  - focal text는 필수
  - action affordance는 optional
  - media cluster는 없음
- `hero_visual_panel_split`
  - media cluster와 text panel은 필수
  - action affordance는 optional
- `editorial_asymmetric`
  - focal text와 supporting text는 필수
  - CTA는 아예 없음

즉 topology-driven system에서는 **모든 draft가 같은 slot set을 가져야 할 이유가 없다.**

## 5. v4의 핵심 개념 모델

### 5.1 상위 모델 분리

v4는 아래 다섯 층을 분리해야 한다.

1. `message atoms`
   - prompt에서 추출한 느슨한 의미 단위
   - 예: `primary`, `offer`, `cta`, `detail`, `brand_context`
2. `topology family`
   - draft 구조의 family
3. `style profile`
   - palette, typography, decoration density, tone
4. `reference object graph`
   - 실제 prior template나 reference에서 읽어낸 node/cluster graph
5. `editor execution plan`
   - 실제 `group/shape/text/image` layer mutation plan

현재 문제는 2번과 5번 사이에 1번의 semantic slot 논리가 너무 강하게 끼어드는 것이다.  
v4는 2번을 독립된 계약으로 승격해야 한다.

### 5.2 topology registry schema

초기 스키마는 아래 정도가 적절하다.

```ts
type TopologyDefinition = {
  topologyId: string;
  family: string;
  summary: string;
  supportedCanvasPresets: string[];
  intentFit: Array<"promotion" | "announcement" | "editorial" | "menu" | "product_focus">;
  clusterCapabilities: TopologyClusterCapability[];
  relationRules: TopologyRelationRule[];
  bindingPolicy: TopologyBindingPolicy;
  emissionProfile: TopologyEmissionProfile;
  completionContract: TopologyCompletionContract;
  renderabilityChecks: TopologyRenderabilityCheck[];
};

type TopologyClusterCapability = {
  capabilityId: string;
  role:
    | "focal_text"
    | "supporting_text"
    | "action_affordance"
    | "media_panel"
    | "accent_band"
    | "context_chip"
    | "fineprint"
    | "decor_cluster";
  required: boolean;
  minInstances: number;
  maxInstances: number;
  acceptedNodeTypes: Array<"text" | "shape" | "group" | "image">;
  acceptedAtomKinds: Array<"primary" | "offer" | "cta" | "detail" | "none">;
  editableTextRequired: boolean;
};
```

핵심은:

- `role vocabulary` 는 존재할 수 있다.
- 하지만 그것은 **전 topology 공통 required slot schema** 가 아니라 descriptive capability vocabulary다.
- required 여부는 topology마다 다르다.

### 5.3 relation rules

topology는 cluster list만으로는 부족하고 relation을 가져야 한다.

초기 relation rule 예:

- `dominates`
  - focal_text 는 supporting_text보다 시각적 우선순위가 높아야 한다.
- `adjacent_to`
  - action_affordance 는 focal/supporting cluster와 읽기 가능한 거리 안에 있어야 한다.
- `anchored_to_edge`
  - context_chip 이나 badge는 canvas edge나 panel edge에 붙을 수 있다.
- `inside`
  - promo text는 accent_band 내부에 위치할 수 있다.
- `avoid_overlap`
  - text-bearing cluster는 media/decor와 허용치 이상 겹치면 안 된다.
- `z_behind`
  - decor/background cluster는 text cluster 뒤에 있어야 한다.

이 relation rule이 있어야 topology가 그냥 “요소 모음”이 아니라 실제 layout family가 된다.

## 6. 초기 topology family 제안

초기 v4에서는 많은 family를 한 번에 열지 않는다.  
`1200x628` banner draft에서 자주 쓰이고 editor-native emission이 쉬운 family만 먼저 연다.

### 6.1 `centered_message_stack`

- 목적: generic promo, season sale, simple announcement
- 필수 capability
  - `focal_text`
  - `supporting_text`
- 선택 capability
  - `action_affordance`
  - `accent_band`
  - `decor_cluster`
- 특징
  - 중앙 stack
  - 비교적 단순한 위계
  - CTA가 없어도 합법적 completion 가능

### 6.2 `band_overlay_promo`

- 목적: 할인/혜택/행사성 프로모션
- 필수 capability
  - `focal_text`
  - `accent_band`
- 선택 capability
  - `action_affordance`
  - `context_chip`
  - `fineprint`
- 특징
  - promo band가 핵심 structural object
  - 현재 v3 native slice와 가장 가까운 family
  - 단, global truth가 아니라 family 하나로만 존재

### 6.3 `hero_visual_panel_split`

- 목적: 사진/제품 중심 banner
- 필수 capability
  - `media_panel`
  - `focal_text`
- 선택 capability
  - `supporting_text`
  - `action_affordance`
  - `context_chip`
- 특징
  - 좌우 분할 또는 hero + overlay text panel
  - photo path와 가장 직접적으로 연결 가능

### 6.4 `editorial_asymmetric`

- 목적: 브랜드 무드, season announcement, graphic-led draft
- 필수 capability
  - `focal_text`
  - `supporting_text`
- 선택 capability
  - `decor_cluster`
  - `media_panel`
- 특징
  - CTA가 필수가 아니다
  - 디자인적으로 가장 slot regression을 깨는 family

### 6.5 `badge_offer_card`

- 목적: coupon/offer/benefit card류
- 필수 capability
  - `focal_text`
  - `context_chip`
  - `accent_band` 또는 `shape card`
- 선택 capability
  - `action_affordance`
  - `fineprint`
- 특징
  - card-like container와 badge성 object가 중심

## 7. v4 runtime flow

### 7.1 개요

v4의 기본 흐름은 아래처럼 고정한다.

1. `canonical-design-brief`
2. `message-atom-plan`
3. `template/reference retrieval`
4. `reference-object-audit`
5. `topology-match-report`
6. `topology-selection`
7. `topology-binding-plan`
8. `topology-execution-plan`
9. `renderability-report`
10. `editor apply`
11. `save truth + completion`

### 7.2 단계별 의도

#### 7.2.1 Brief / atom 단계

- 시스템은 prompt를 바로 slot으로 파싱하지 않는다.
- 시스템은 먼저 `message atoms` 와 content policy만 만든다.
- 예:
  - `primary`: 봄 세일
  - `offer`: 시즌 특가
  - `cta`: 혜택 보기
  - `detail`: optional

#### 7.2.2 Audit / topology match 단계

- 각 prior candidate/reference graph에 대해 아래를 계산한다.
  - 어떤 topology family와 잘 맞는가
  - 어떤 cluster capability를 이미 갖고 있는가
  - text replacement 후 editor-native emission이 가능한가
  - 현재 canvas preset에서 render-safe한가

이 단계의 목표는 `headline slot이 있나` 가 아니다.  
이 단계의 목표는 **이 candidate가 어떤 topology family로 실행되기 좋은가** 다.

#### 7.2.3 Selection 단계

- selection truth는 `template code 단독` 이 아니라:
  - `(reference candidate, matched topology family, style retention mode)`
  - 의 3항 조합으로 본다.

즉 같은 template라도:

- `band_overlay_promo`
- `editorial_asymmetric`

중 어느 topology로 읽느냐에 따라 다른 실행 path를 가질 수 있다.

#### 7.2.4 Binding 단계

- message atom은 topology capability에 bind된다.
- bind는 1:1 slot 매핑이 아니라 capacity-aware assignment다.

예:

- `centered_message_stack`
  - `primary` -> `focal_text`
  - `offer` -> `supporting_text`
  - `cta` -> optional `action_affordance`
- `editorial_asymmetric`
  - `primary` -> `focal_text`
  - `offer/detail` -> `supporting_text`
  - `cta` atom이 있더라도 bind되지 않을 수 있음

#### 7.2.5 Execution 단계

- planner는 topology family가 허용한 node type으로만 emit한다.
- 현재 Tooldi 기준 기본 emission profile은 아래를 유지한다.
  - `text`
  - `shape`
  - `group`
  - `image`

즉 topology는 aesthetic abstraction이지만, 최종 산출물은 항상 **editor-native node tree** 로 닫힌다.

## 8. Completion truth와 warning semantics

### 8.1 전역 requiredExecutionSlots를 폐기한다

v4에서는 아래 방식이 더 적합하다.

- 전역 `requiredExecutionSlots=["background","headline","offer_line","cta"]` 폐기
- topology별 `completionContract` 도입

예:

```ts
type TopologyCompletionContract = {
  requiredCapabilities: string[];
  requiredEditableNodeTypes: Array<"text" | "shape" | "group" | "image">;
  requiredTextBearingClustersMin: number;
  actionRequired: boolean;
  mediaRequired: boolean;
};
```

이렇게 해야:

- CTA 없는 topology도 합법적으로 completed가 가능하고
- hero image가 필수인 topology는 그 조건을 스스로 가질 수 있다.

### 8.2 warning semantics는 “구조 실패”와 “품질 경고”를 분리한다

v4는 warning을 아래 두 종류로 분리해야 한다.

- `structural_warning`
  - topology match는 됐지만 optional cluster 일부가 빠진 경우
- `quality_warning`
  - copy polish, brand context 부족, spacing 미세 이슈

`copy_cta_subject_mismatch` 같은 이슈는 기본적으로 `quality_warning` 이다.  
이것이 native completion truth를 다시 흔들면 안 된다.

### 8.3 refine는 구조 엔진이 아니다

v4에서도 refine는 유지하되 역할을 제한한다.

- topology를 다시 짜는 엔진이 아니다.
- retrieval을 재실행하는 엔진이 아니다.
- post-execution bounded patch 엔진이다.

즉 refine는:

- copy polish
- spacing polish
- container 보정

정도만 맡아야 한다.

## 9. toolditor / editor domain 적용 원칙

### 9.1 topology는 editor가 실제 다룰 수 있는 node로만 닫혀야 한다

현재 Tooldi contracts와 runtime surface는 아래를 기준으로 한다.

- mutation ops
  - `createLayer`
  - `updateLayer`
  - `deleteLayer`
  - `saveTemplate`
- layer types
  - `group`
  - `shape`
  - `text`
  - `image`

따라서 topology registry는 이 surface를 무시하면 안 된다.

### 9.2 topology는 geometry와 tree를 함께 가진다

topology definition은 최소 아래를 산출할 수 있어야 한다.

- cluster bounds expectation
- parent-child grouping expectation
- z-order expectation
- editable text owner
- image/shape/text emission type

즉 topology는 `semantic layout name` 이 아니라 **editor apply 가능한 node graph sketch** 여야 한다.

### 9.3 사람 편집을 전제로 해야 한다

AI가 생성한 draft는 아래를 만족해야 한다.

- 사용자가 요소를 선택할 수 있다
- 텍스트를 직접 수정할 수 있다
- group 단위로 옮길 수 있다
- save 이후에도 동일한 layer graph 정체성을 유지한다

이 원칙 때문에 topology는 flattened raster output 중심으로 정의하면 안 된다.

## 10. v3에서 v4로의 migration

### 10.1 유지

- orchestration spine
- save truth invariant
- object-native audit artifact 패턴
- renderability guard
- FE live-commit / ack / save flow
- real-source evaluation harness

### 10.2 교체

- `big_text/promo_band/cta` 중심 semantic gate
- 전역 `requiredExecutionSlots`
- slot-centered binding truth
- native stable의 단일 bootstrap slice

### 10.3 추가

- `topology-registry`
- `topology-match-report`
- `topology-selection`
- `topology-binding-plan`
- `topology-execution-plan`
- `topology-completion-report`

### 10.4 단계별 rollout

#### Stage A. registry + match artifact만 추가

- 현재 object-native audit 옆에 topology match artifact를 추가한다.
- selection truth는 아직 기존 방식 유지 가능하다.

#### Stage B. 2개 topology family만 먼저 stable path에 연결

- `band_overlay_promo`
- `centered_message_stack`

를 먼저 연결한다.

#### Stage C. completion truth 전환

- `requiredExecutionSlots` 를 deprecated로 내리고
- topology completion contract를 primary truth로 승격한다.

#### Stage D. hero/media topology 확장

- `hero_visual_panel_split`
- `editorial_asymmetric`

를 연다.

이 순서가 좋은 이유는 runtime spine을 흔들지 않고 contract만 점진적으로 바꿀 수 있기 때문이다.

## 11. 첫 구현 범위 제안

첫 v4 구현은 아래까지만 연다.

- topology registry 정적 정의 2개
  - `centered_message_stack`
  - `band_overlay_promo`
- candidate별 topology match score 계산
- topology-aware binding artifact
- topology completion contract projection
- real eval harness에 topology 분포 집계 추가

첫 구현에서 하지 않을 것:

- topology family 5개 이상 동시 오픈
- multi-agent planner / critic 분리
- 무제한 self-refine loop
- vision-only judge로 stable 판정 교체
- slot vocabulary 완전 제거

slot vocabulary는 compat metadata로 남을 수 있다.  
다만 더 이상 global completion truth가 되면 안 된다.

## 12. Open Questions

| ID | 질문 | 필요한 결정 |
| --- | --- | --- |
| OQ-01 | `action_affordance` 를 capability vocabulary에 남길지, 더 느슨한 `interactive emphasis` 로 추상화할지 | PM + Worker |
| OQ-02 | `editorial_asymmetric` 같은 no-CTA topology를 대표 시나리오 acceptance에 언제 포함할지 | PM |
| OQ-03 | topology match score에서 search relevance와 geometry readiness의 상대 비중을 어떻게 둘지 | Worker |
| OQ-04 | `ExecutionSlotKey` 를 topology compat metadata로 얼마나 오래 유지할지 | FE + Backend |

## 13. Risks

| ID | 항목 | 영향 |
| --- | --- | --- |
| R-01 | topology vocabulary를 너무 많이 열면 다시 giant schema 문제가 생길 수 있다 | High |
| R-02 | topology가 aesthetic naming에 머물고 editor emission contract가 약하면 구현 가치가 없다 | High |
| R-03 | completion truth 전환을 너무 늦추면 v4 match artifact가 있어도 최종 판정은 계속 v3 slot에 묶인다 | High |
| R-04 | topology를 prompt/domain별 예외 규칙으로 운영하면 v2식 overfit가 재발한다 | High |

## 14. Implementation Trace

### 로컬 코드 / 문서 근거

- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/buildObjectNativePath.ts`
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/buildExecutablePlan.ts`
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/finalizeRun.ts`
- `agent-workflow-test/tooldi-agent-runtime/packages/contracts/src/common.ts`
- `agent-workflow-test/tooldi-agent-runtime/packages/contracts/src/canvas/canvas-mutation.ts`
- `agent-workflow-test/tooldi-agent-runtime/packages/contracts/src/artifacts/live-draft-artifact-bundle.ts`
- `agent-workflow-test/tooldi-agent-runtime/scripts/evaluate-object-native-real.mjs`
- `agent-workflow-test/tooldi-agent-workflow-vnext-object-native-reference-architecture.md`
- `/home/ubuntu/github/tooldi/toolditor/src/features/agent-workflow-spike/ui/AgentHappyPathPanel.tsx`

### 외부 도메인 근거

- Anthropic, Building Effective Agents  
  https://www.anthropic.com/engineering/building-effective-agents
- OpenAI, Agent Builder  
  https://developers.openai.com/api/docs/guides/agent-builder
- Figma Developer Docs, Plugin API / document structure  
  https://developers.figma.com/docs/plugins/
- Canva AI Connector  
  https://www.canva.com/ai-connector/
- Canva MCP, Design Edit Handoff  
  https://www.canva.dev/docs/mcp/workflows/design-edit/
- Canva Design School, Visual Hierarchy  
  https://www.canva.com/learn/visual-hierarchy/

## 15. 최종 결론

다음 단계는 `v3 폐기`가 아니다.  
다음 단계는 **v3 spine을 유지한 채, object-native bootstrap slice를 topology-driven editor-native contract로 승격하는 것** 이다.

짧게 쓰면:

- v3는 bootstrap workflow로 충분히 가치가 있다.
- v4는 새 runtime이 아니라 새 contract다.
- topology는 slot replacement가 아니라 **design relation + editor emission + completion truth** 를 함께 가진 실행 단위여야 한다.
