# Tooldi Agent Workflow Next Implementation Roadmap

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow Next Implementation Roadmap |
| 문서 목적 | PR0~PR7 legacy cleanup 이후 v6-only runtime의 다음 개선 축을 정리한다. |
| 상태 | Current |
| 문서 유형 | Implementation Roadmap |
| 갱신일 | 2026-04-28 |
| 기준 시스템 | `agent-workflow-test/tooldi-agent-runtime`, `toolditor`, local Docker stack, `embedding-test` |

## 1. 완료된 전환

2026-04-28 기준 legacy cleanup series의 목적은 달성됐다.

- PostgreSQL/Drizzle persistence foundation.
- API in-memory repository fallback 제거.
- LangGraph `PostgresSaver` 전용화와 `MemorySaver` 제거.
- v6 reachability / legacy non-reachability baseline lock.
- legacy build/refinement graph topology prune.
- legacy phase files deletion.
- mixed runtime cleanup, planner abstraction removal, v6-only public contract lock.
- package-level dead code sweep.
- local stack script repo 이관.
- PR7 문서 projection.

현재부터의 roadmap은 삭제 작업이 아니라 **v6-only runtime 품질/운영 고도화**다.

## 2. Authority

- 철학/파이프라인 authority: [tooldi-agent-workflow-v6-layout-freedom-ssot.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v6-layout-freedom-ssot.md)
- 현재 구현 truth: [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)
- 로컬 실행/검증 entry: [README.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/README.md)

v1~v5 adaptive composition, topology, template intelligence, constrained HTML 문서는 historical context로만 읽는다.

## 3. 다음 우선순위

### 3.1 v6 Visual Quality / HITL Evaluation

자동 테스트는 contract regression을 막지만 디자인 품질을 판정하지 못한다. 다음 개선은 representative prompt set에 대해 자유 HTML preview, v6 HTML preview, 실제 Toolditor canvas를 함께 비교하는 평가 루프로 잡는다.

완료 기준:

- trend ON/OFF, debug preview, canvas 적용 화면을 한 평가 단위로 저장한다.
- 사람이 점수와 코멘트를 남길 수 있다.
- 평가 결과가 prompt/model/runtime 변경 전후 비교에 재사용된다.

### 3.2 Phase 6 Placeholder Asset / RAG

목표는 template prior를 되살리는 것이 아니라, v6 HTML의 `placeholder://<hint>` 이미지를 실제 Tooldi photo/graphic asset으로 치환하는 것이다.

원칙:

- 기존 template RAG collection을 production source로 승격하지 않는다.
- 기존 template prior/adaptive composition module을 runtime에 재연결하지 않는다.
- photo/graphic catalog와 Qdrant schema는 Phase 6 문서 기준으로 새로 검증한다.

참고:

- [docs/design/phase6-rag-assets/README.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/design/phase6-rag-assets/README.md)
- `embedding-test/`는 실행 경험과 Qdrant/Jina PoC 참고용이다.

### 3.3 Local Stack / CI Parity

local stack은 브라우저 검증의 재현성을 책임진다. 앞으로 runtime dependency가 바뀌면 `scripts/local-stack.sh`, `.env.example`, CI 환경 변수를 같이 갱신한다.

완료 기준:

- `bash scripts/local-stack.sh up/status/down`으로 browser test state가 재현된다.
- `http://localhost:3010/editor`가 canonical browser entry로 유지된다.
- PostgreSQL/Redis/Qdrant/embedding/API/worker/Toolditor drift를 status output에서 빠르게 판단할 수 있다.

### 3.4 Persistence / Recovery Hardening

PostgreSQL-backed persistence와 PostgresSaver가 live baseline이므로 recovery quality는 여기서부터 강화한다.

완료 기준:

- app/service reconstruction 후 event `listAfter`, mutation proposal/ack wait, finalization materialization, recovery, watchdog, cancel이 유지된다.
- HITL interview/resume interrupt 케이스가 local/CI에서 같은 PostgreSQL 설정으로 검증된다.

### 3.5 Production Runtime Parity

v6는 browser render에 의존한다. production/Lambda/Docker 환경의 Chromium, font, Playwright version drift를 관리해야 한다.

완료 기준:

- Linux local Docker와 production target에서 font/layout drift를 측정한다.
- browser render warm pool 또는 equivalent lifecycle 전략을 정한다.
- v6 render quality report가 production incident 분석에 충분한 artifact를 남긴다.

## 4. 열지 않는 것

아래는 현재 roadmap의 다음 작업이 아니다.

- v1~v5 template prior/adaptive composition/rule judge/refine graph 복구.
- `TemplatePlanner` abstraction 또는 `TEMPLATE_PLANNER_MODE` 부활.
- `MemorySaver` fallback 부활.
- Tool registry/tool adapters package path 재도입.
- `workflowVariant` optional defaulting 복구.
- finalize input `latestSaveReceiptId` compat 복구.

## 5. Acceptance Gates

큰 변경 전후에는 아래를 기본 gate로 본다.

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime
pnpm -r --if-present typecheck
pnpm build
pnpm -F @tooldi/agent-api test
pnpm -F @tooldi/agent-worker test
pnpm smoke:object-native
pnpm local:toolditor:eval:object-native:real
```

브라우저 수동 확인은 `http://localhost:3010/editor`에서 진행한다.

## 6. 한 줄 결론

현재 이후의 방향은 런타임을 다시 갈아엎는 것이 아니라, v6-only path의 visual quality, asset resolution, persistence/recovery, local/production parity를 점진적으로 강화하는 것이다.
