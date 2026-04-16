# Handoff: SSOT Adaptive Composition — Layer 2/3/4 구현 후 검증 및 다음 단계

## Goal

Layer 4 bridge (2b)를 실제 toolditor에서 end-to-end 검증하고, 결과물 품질을 확인한 뒤 다음 Phase로 진행한다.

---

## Current State

### 전체 설계 Phase 및 진행 현황

SSOT 문서(`tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md`)를 기준으로 한 구현 순서:

| Phase | 작업 | 상태 | 세부 |
|---|---|---|---|
| **1. Template Graph Projection (Layer 2)** | `projectTemplateGraph.ts` | **완료** | Fabric.js → projected format 변환. semantic classification 없음. visualWeight/zone computable annotation만 포함. 실제 run에서 artifact 검증됨 (2개 템플릿). |
| **2a. LLM Composition Decision (Layer 3)** | `buildAdaptiveCompositionDecision.ts` | **완료** | projected graph + copy plan → LLM structured output → retain/modify/remove/add 결정. addable vocabulary registry 포함 (4개 항목). 실제 run에서 artifact 검증됨 — LLM이 합리적 결정 생성 확인. |
| **2b. Executor adaptation (Layer 4 bridge)** | `emitAdaptiveCompositionMutations.ts` + executionNodes 수정 | **빌드 완료, E2E 미검증** | composition decision → SkeletonMutationBatch 변환. prepare_execution에서 adaptiveSkeletonBatch 우선 사용. **toolditor에서 v3 버튼으로 실제 테스트 필요.** |
| **3. Completion contract 교체** | buildExecutablePlan의 requiredExecutionSlots 제거 | **미착수** | SSOT Section 6: editability + renderability + save truth |
| **4. Addable Vocabulary Registry 확장** | registry 항목 추가/materializer 고도화 | **미착수** | 현재 4개 항목으로 시작 (cta_button, footer_text, badge_chip, accent_shape) |
| **5. Legacy 정리** | 고정 바인딩 코드 제거, 불필요한 slot 타입 deprecated | **미착수** | buildObjectNativePath의 display_text→headline 등 |

### 2b 검증 필요 사항

2b 코드는 빌드 성공했지만, **toolditor에서 실제 결과물을 아직 확인하지 않았다.** 다음 세션에서 가장 먼저 할 일:
1. `pnpm run local:toolditor:stack:real`로 스택 시작
2. toolditor에서 "experimental v3 생성" 버튼 클릭
3. 에디터 캔버스에서 결과물 확인 — **템플릿 원본 레이아웃이 살아있고, LLM이 결정한 텍스트 교체/추가가 반영되었는지**
4. artifact 확인: `projected-template-graph.json`, `adaptive-composition-decision.json`

### 기대 결과 vs 이전 결과

| 항목 | 이전 (고정 바인딩) | 기대 (adaptive composition) |
|---|---|---|
| 배경 | 흰색 solid (#f6e7bf) | 템플릿 원본 배경 이미지 retain |
| 텍스트 | CTA 하나만 | 원본 텍스트 위치에 modify된 content |
| 레이아웃 | 4-slot 고정 | 템플릿 구조 그대로 |

---

## Locked Decisions

**SSOT 5개 Axiom** (절대 변경 불가):
1. Template object graph가 구조의 1차 진실 (A1)
2. LLM은 "무엇을", 코드는 "어떻게" (A2)
3. retain/modify/remove는 graph에서, add는 vocabulary registry에서 (A3)
4. Completion = editability + renderability + save truth (A4)
5. Capability = execution vocabulary, topology = transitional adapter (A5)

**금지 패턴**: 고정 slot schema를 completion truth로, capability를 planning ontology로, LLM이 좌표 결정, refine이 primary quality, threshold micro-tuning, named-slot completeness regression

**FE 호환 전략**: adaptive composition의 mutation command에 executionSlotKey를 매핑하여 FE 수정 없이 동작:
- dominant text → `headline`, secondary text → `offer_line`, tertiary → `footer_note`
- add cta_button → `cta`, add footer_text → `footer_note`, add badge_chip → `badge_text`

---

## Contracts

### Projected Object Graph (Layer 2 output)
```typescript
interface ProjectedObject {
  objectId: string;                    // "obj-001"
  layerType: "text"|"shape"|"group"|"image";
  bounds: LayoutBounds;                // {x, y, width, height}
  sourceText: string | null;
  fontSize: number | null;
  fillColorHex: string | null;
  fontFamily: string | null;
  textAlign: "left"|"center"|"right" | null;
  visualWeight: "dominant"|"secondary"|"tertiary"|"decorative"|"background";
  zone: SpatialZone;                   // "center"|"top"|"bottom" etc.
  prominence: number;
  compositeHint: "button"|"badge" | null;
}
```

### Adaptive Composition Decision (Layer 3 output)
```typescript
interface AdaptiveCompositionDecision {
  decisionId: string;
  elementDecisions: ElementDecision[];  // retain/modify/remove per object
  addDecisions: AddDecision[];          // from addable vocabulary
  compositionSummary: string;
}
interface ElementDecision {
  objectId: string;
  operation: "retain"|"modify"|"remove";
  newText: string | null;
  newFillColor: string | null;
  reason: string;
}
interface AddDecision {
  vocabularyId: "cta_button"|"accent_shape"|"footer_text"|"badge_chip";
  text: string | null;
  placementZone: SpatialZone;
  reason: string;
}
```

### Pipeline Integration
```
object_native_v1 path in build_reference_composition_v2 node:
  buildObjectNativePath()           → 기존 artifact 생성 (유지)
  projectTemplateObjectGraph()      → projected-template-graph.json
  buildAdaptiveCompositionDecision() → adaptive-composition-decision.json (LLM call)
  emitAdaptiveCompositionMutations() → adaptiveSkeletonBatch (state)

prepare_execution node:
  if (state.adaptiveSkeletonBatch) → use it
  else → fallback to emitSkeletonMutations(state.plan)
```

---

## Relevant Files

### 새로 생성한 파일
| 파일 | 역할 | 라인 수 |
|---|---|---|
| `apps/agent-worker/src/phases/projectTemplateGraph.ts` | Layer 2: Fabric.js → projected graph | ~300 |
| `apps/agent-worker/src/phases/buildAdaptiveCompositionDecision.ts` | Layer 3: LLM composition decision + addable vocabulary registry | ~250 |
| `apps/agent-worker/src/phases/emitAdaptiveCompositionMutations.ts` | Layer 4 bridge: decision → SkeletonMutationBatch | ~280 |

### 수정한 파일
| 파일 | 변경 내용 |
|---|---|
| `apps/agent-worker/src/types.ts` | ProjectedObject, ProjectedObjectGraph, VisualWeight, SpatialZone, ElementDecision, AddDecision, AdaptiveCompositionDecision 타입 추가 |
| `apps/agent-worker/src/graph/runJobGraphState.ts` | projectedTemplateGraph, adaptiveCompositionDecision, adaptiveSkeletonBatch + ref 필드 추가 |
| `apps/agent-worker/src/graph/buildNodes.ts` | object_native_v1 경로에 Layer 2/3/4 bridge 삽입 |
| `apps/agent-worker/src/graph/executionNodes.ts` L51-59 | prepare_execution에서 adaptiveSkeletonBatch 우선 사용 |

### SSOT 문서
| 파일 | 역할 |
|---|---|
| `agent-workflow-test/tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md` | **Authority / Design Lock** — 모든 작업의 기준 |
| `agent-workflow-test/tooldi-agent-workflow-v1-doc-index.md` | 문서 인덱스 (SSOT가 authority로 등록됨) |
| `agent-workflow-test/AGENTS.md` | 에이전트 지침 (SSOT 참조) |
| `agent-workflow-test/CLAUDE.md` | Claude bootstrap (AGENTS.md 참조) |

### 기존 파이프라인 핵심 참조
| 파일 | 참조 목적 |
|---|---|
| `apps/agent-worker/src/phases/buildObjectNativePath.ts` L614 | 고정 바인딩 (display_text→headline) — 향후 교체 대상 |
| `apps/agent-worker/src/phases/buildExecutablePlan.ts` L421 | 고정 requiredExecutionSlots — 향후 교체 대상 |
| `apps/agent-worker/src/phases/layerCommandBuilder.ts` | buildCreateLayerCommand — adaptive mutations이 재사용 |
| `toolditor/src/features/agent-workflow-spike/lib/mutationObjectBuilder.ts` | FE materializer — executionSlotKey 기반 |
| `toolditor/src/features/agent-workflow-spike/lib/canvasObjectFactories.ts` | buildTextObject, buildRectObject, buildCtaGroupObject |

---

## Open Risks

1. **2b E2E 미검증**: 빌드는 성공했지만 toolditor에서 실제 렌더링 결과를 아직 확인하지 않음. FE materialization에서 executionSlotKey 매핑이 올바르게 동작하는지 확인 필요.
2. **Image retain**: 배경 이미지 retain 시 `sourceOriginUrl`이 FE에서 정상적으로 로드되는지 확인 필요. 현재 FE의 image materialization은 `parsePhotoSelection(command)`로 metadata에서 photo 정보를 읽는데, adaptive path의 metadata 구조가 호환되는지 미확인.
3. **LLM decision 품질**: 1개 run에서만 검증. 다양한 프롬프트/템플릿에서 결정 품질이 일관적인지 multi-run 검증 필요.
4. **기존 파이프라인과의 충돌**: adaptive path가 실패해도 기존 path가 fallback으로 동작해야 하는데, 현재 `adaptiveSkeletonBatch`가 set되면 기존 path를 완전히 bypass함. LLM 실패 시 null이므로 fallback은 동작하지만, mutation 생성 실패(non-null but broken batch)의 경우는 미처리.
5. **Completion contract**: 현재 `buildExecutablePlan`이 여전히 `requiredExecutionSlots = ["background","headline","offer_line","cta"]`를 설정함. adaptive path에서는 이게 무의미하지만, finalize 단계에서 이 값을 참조할 수 있음.

---

## Acceptance Criteria

1. toolditor에서 "experimental v3 생성" 시 **템플릿 원본 구조가 유지**되면서 텍스트가 교체된 결과물이 에디터에 나타남
2. `projected-template-graph.json`, `adaptive-composition-decision.json` artifact가 정상 생성됨
3. LLM decision의 retain/modify/remove가 실제 캔버스 결과물에 반영됨
4. add된 요소(CTA 버튼, footer 텍스트 등)가 에디터에 나타남
5. 기존 파이프라인(v2 reset 등)이 깨지지 않음

---

## Verification

```bash
# 1. 스택 시작
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime
pnpm run local:toolditor:stack:real

# 2. toolditor에서 "experimental v3 생성" 버튼 클릭 후 에디터 결과물 스크린샷 확인

# 3. artifact 확인
latest_run=$(ls -t /tmp/tooldi-agent-runtime-toolditor-local/tooldi-agent-runtime-toolditor-local/agent-runtime-toolditor-local/runs/ | head -1)

# projected graph
jq '.summary' /tmp/tooldi-agent-runtime-toolditor-local/tooldi-agent-runtime-toolditor-local/agent-runtime-toolditor-local/runs/$latest_run/attempts/1/projected-template-graph.json

# composition decision
jq '{summary: .compositionSummary, elements: [.elementDecisions[] | {objectId, operation, newText}], adds: .addDecisions}' /tmp/tooldi-agent-runtime-toolditor-local/tooldi-agent-runtime-toolditor-local/agent-runtime-toolditor-local/runs/$latest_run/attempts/1/adaptive-composition-decision.json

# 4. 기존 경로 regression check: "experimental v2 reset 생성" 버튼으로도 run 실행하여 기존 결과 확인
```

자동화된 E2E 테스트는 현재 없음. FE 렌더링 결과는 수동 스크린샷 확인 필요.

---

## Start Prompt

이 세션의 작업 컨텍스트를 이어받아라. 반드시 아래 파일들을 먼저 읽어라:

1. `agent-workflow-test/AGENTS.md`
2. `agent-workflow-test/tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md`
3. 이 handoff 문서

**즉시 실행할 작업:**

Phase 2b의 E2E 검증을 수행하라. toolditor에서 "experimental v3 생성"을 실행하고 결과물을 확인하라. 기대하는 결과는 **템플릿 원본 레이아웃(배경 이미지, 텍스트 위치)이 유지**되면서 **LLM이 결정한 텍스트 교체와 요소 추가가 반영**된 배너이다.

검증 후 발견되는 문제가 있으면:
- FE materialization 이슈 → mutationObjectBuilder.ts의 executionSlotKey 처리 확인
- Image 로드 실패 → metadata의 sourceOriginUrl/sourceWidth/sourceHeight 확인
- 텍스트 미반영 → metadata.copyText 확인
- 레이아웃 깨짐 → bounds 좌표 확인 (template projected graph의 bounds가 음수일 수 있음 — 캔버스 밖 오브젝트)

검증이 통과하면 다음 Phase (3. Completion contract 교체)의 플래닝으로 진행하라.
