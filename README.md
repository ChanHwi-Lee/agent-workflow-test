# agent-workflow-test

2026-04-28 기준 Tooldi Agent Workflow 문서/검증 워크스페이스다. 실제 런타임 코드는 `tooldi-agent-runtime/`에 있고, 현재 제품 경로는 **v6-only `object_native_v1`** 이다.

## 현재 기준선

- 설계 SSOT는 [tooldi-agent-workflow-v6-layout-freedom-ssot.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v6-layout-freedom-ssot.md)다.
- API `workflowVariant`는 required literal `"object_native_v1"` 이다. API defaulting으로 variant를 보정하지 않는다.
- Worker는 v6 free HTML 생성 → 브라우저 렌더/DOM 추출 → Tooldi primitive mapping → SSE mutation → save ack → finalize 경로만 사용한다.
- API persistence는 PostgreSQL/Drizzle `agent_runtime` 스키마다. PostgreSQL 연결/마이그레이션 실패 시 boot는 실패해야 한다.
- LangGraph checkpoint는 PostgreSQL `PostgresSaver` 전용이다. `MemorySaver` fallback은 코드베이스에서 제거했다.
- `TemplatePlanner` abstraction, `TEMPLATE_PLANNER_MODE`, LangChain/heuristic planner mode switch, tool-registry/tool-adapters package path는 live runtime에서 제거했다.
- Trend ON/OFF, debug HTML preview artifact, interview/resume, SSE, mutation ack, save ack, finalize, cancel, artifact fetch는 현재 지원 범위다.
- `latestSaveReceipt`는 finalize 입력의 full payload로 요구한다. `latestSaveReceiptId`는 result/artifact summary 출력 필드로만 남을 수 있다.

## 먼저 읽을 문서

1. [tooldi-agent-workflow-v1-doc-index.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-doc-index.md)
2. [tooldi-agent-workflow-v6-layout-freedom-ssot.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v6-layout-freedom-ssot.md)
3. [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)
4. [tooldi-agent-workflow-v1-next-implementation-roadmap.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-next-implementation-roadmap.md)

## 로컬 실행

이 repo 안의 스크립트가 브라우저 검증에 필요한 프로세스와 Docker 의존성을 관리한다.

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test
bash scripts/local-stack.sh up
bash scripts/local-stack.sh status
```

브라우저 진입점은 반드시 아래 주소를 사용한다.

```text
http://localhost:3010/editor
```

`down`은 agent runtime/toolditor/embedding 프로세스를 내린다. PostgreSQL/Redis/Qdrant Docker 의존성까지 내리려면 `KEEP_DEPS=0`를 명시한다.

```bash
bash scripts/local-stack.sh down
KEEP_DEPS=0 bash scripts/local-stack.sh down
```

관리 대상:

- PostgreSQL: `127.0.0.1:55432`
- Redis: `127.0.0.1:6380`
- Qdrant: `127.0.0.1:6333`, `127.0.0.1:6334`
- embedding service: `127.0.0.1:7070`
- agent API/worker stack: `127.0.0.1:3100`
- Toolditor: `localhost:3010`

## 검증 명령

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime
pnpm -r --if-present typecheck
pnpm build
pnpm -F @tooldi/agent-api test
pnpm -F @tooldi/agent-worker test
pnpm smoke:object-native
pnpm local:toolditor:eval:object-native:real
```

`pnpm local:toolditor:eval:object-native:real`은 이미 떠 있는 local stack에 붙어 실제 SSE/mutation/save/finalize 흐름을 돌린다. v6-only 기준에서는 legacy `object-native-reference-audit`, `candidate-selection`, `renderability-report`, `cluster-graph` artifact가 필수가 아니다.

## Historical Assets

아래 자산은 삭제하지 않는다. 현재 runtime path가 아니라 설계 결정과 회귀 방지용 evidence로 보존한다.

- `v6-poc/`: v6 free HTML → browser render → primitive extraction 가능성을 증명한 PoC evidence.
- `bench/method-compare-phase1/`: 모델/방식 비교 evidence. 기본 모델 교체 시 새 bench evidence를 추가해야 한다.
- `docs/handoff/`: PR별 cleanup/evidence handoff archive.
- `docs/design/phase6-rag-assets/`: Phase 6 placeholder asset/RAG 설계 참고. 기존 template RAG를 live runtime에 재연결하면 안 된다.
- v1~v5/adaptive/object-native/topology 문서: 배경 참고용 historical context. 현재 authority는 v6 SSOT와 이 README의 기준선이다.
