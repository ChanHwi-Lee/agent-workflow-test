# AGW Admin Dashboard V1 — Implementation Handoff

## Goal
AGW (Agent Workflow) 내부 모니터링용 admin dashboard V1 을 design doc 에 따라 구현한다 — 로컬 전용, 인증 없음, read-only 뷰 + tag/note/star + RAG 결정 capture artifact.

## Current State
- **Design doc 완료** — 모든 구조·접근법·데이터 모델·빌드 순서 잠김.
- **인프라 60% 깔려있음** — `runs` / `run_attempts` / `run_events` / `agent_interview.interview_records` / artifact 저장 (`runs/<runId>/attempts/<N>/<kind>.json`) / SSE `/api/agent-workflow/runs/:runId/events`.
- **빈 자리**:
  - agent-api: list/detail/annotation admin endpoints 없음
  - agent-worker: RAG 후보·Gemini 메타가 artifact 로 안 남음 (`v6AssetResolver.ts` 내부에서 휘발)
  - 새 app `apps/agent-admin` 미구현
  - 새 테이블 `agent_admin.run_annotations` 마이그레이션 없음
- **직전 작업** (참고 컨텍스트, 이번 작업과 직접 의존 없음):
  - `v6-qa-markers` 체크포인트 — render-quality blocking force-through + 빨강 QA 마커 (commits `31efcc3` agent-runtime, `bfe3961c5` toolditor)

## Locked Decisions
- **Hosting**: sibling Next.js mini-app `apps/agent-admin` (port 3200), agent-api 와 별도 빌드/실행
- **Auth**: V1 없음. agent-api `/api/admin/*` 는 `process.env.NODE_ENV !== 'production'` 게이트만. 운영 배포·인증은 별도 §5b PR
- **DB 접근**: agent-admin 은 DB 직접 접근 X, 모든 read/write 는 agent-api 의 `/api/admin/*` 통함
- **Annotation 모델**: 1 run = 1 row, last-write-wins, history 안 남김. `tags TEXT[]` + GIN, `updated_by = "local"` 고정 V1
- **자동 갱신**: 리스트 5s polling (탭 hidden 시 stop), 상세는 SSE (active 시), terminal 은 stale snapshot
- **새 Capture 2종**: `v6-asset-resolution.json` (항상), `v6-asset-generated.json` (Gemini 발사 시만). resolver 는 데이터 반환만, persist 는 `v6PipelineNode.ts`
- **Interview 후보지 capture 는 V1 범위 밖** — 코드상 후보 단계 부재
- **Mutation 보호**: V1 인증 없음 → CSRF 도 생략. 운영 인증 도입 시 Server Actions 로 자동 보호

## Contracts

### Endpoints
```
GET  /api/admin/runs?limit=50&status=&before=&starred=&tag=
  → { runs: AdminRunSummary[], hasMore: boolean, nextBefore: string | null }

GET  /api/admin/runs/:runId
  → { run: AdminRunDetail, attempts: AttemptSummary[], phases: PhaseSummary[],
      annotation: RunAnnotation | null, artifactRefs: ArtifactRef[] }

POST /api/admin/runs/:runId/annotations
  body: { starred?: boolean, tags?: string[], note?: string }   // tags 는 전체 교체
  → { annotation: RunAnnotation }

GET  /api/admin/runs/_meta/tags
  → { tags: string[] }   // DISTINCT, 5분 메모리 캐시
```

### DB Migration
```sql
CREATE SCHEMA IF NOT EXISTS agent_admin;

CREATE TABLE agent_admin.run_annotations (
  run_id      TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  starred     BOOLEAN     NOT NULL DEFAULT FALSE,
  tags        TEXT[]      NOT NULL DEFAULT '{}',
  note        TEXT        NOT NULL DEFAULT '',
  updated_by  TEXT        NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_run_annotations_starred ON agent_admin.run_annotations (starred) WHERE starred;
CREATE INDEX idx_run_annotations_tags    ON agent_admin.run_annotations USING GIN (tags);
```

### Artifact Shapes (design doc §2)
- `v6-asset-resolution.json` — placeholder 별 후보 / score / 선택 / decision
- `v6-asset-generated.json` — Gemini 발사 항목 (model / prompt / latency / outputAssetKey)

상세 shape 은 design doc §2 참조.

### Env Vars
- agent-admin `.env.local`: `AGENT_API_INTERNAL_URL=http://localhost:3100`
- agent-api: 추가 없음 (NODE_ENV 가드만)

## Relevant Files

### 반드시 먼저 읽기
- `agent-workflow-test/docs/design/2026-05-08-agw-admin-dashboard.md` — **모든 결정의 source of truth**

### Backend 작업 대상
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v6AssetResolver.ts` — resolutionLog 반환 추가
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/graph/v6PipelineNode.ts` — 새 artifact 2종 persist 추가 (resolver 호출 직후)
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v6Types.ts` — `V6AssetResolutionLog` / `V6AssetGenerationLog` 타입 export
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-api/src/...` — 새 admin 라우트 그룹 (디렉터리 구조는 기존 라우트 컨벤션 따라)
- `agent-workflow-test/tooldi-agent-runtime/packages/persistence/drizzle/` — 새 마이그레이션
- `agent-workflow-test/tooldi-agent-runtime/packages/contracts/` — 새 타입 (`AdminRunSummary`, `RunAnnotation` 등)
- `agent-workflow-test/tooldi-agent-runtime/pnpm-workspace.yaml` — `apps/agent-admin` 등록

### Frontend 작업 대상
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-admin/` — 신규 (Next.js 14 App Router)

### 재사용 패턴 참고
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/graph/graphTasks.ts` — `persistArtifactTask` 사용 패턴
- 기존 SSE 핸들러 (`/api/agent-workflow/runs/:runId/events`) — 코드 위치는 `apps/agent-api/src/` 안에서 grep

## Open Risks
- **Qdrant 후보 srcUrl 외부 CDN ↔ iframe sandbox CSP 충돌** — Week 2 Day 4 (asset resolution UI) 에서 검증. 충돌 시 thumbnail proxy 필요
- **`runs.created_at` 인덱스 존재 여부 미확인** — list query 성능 기반. 없으면 마이그레이션에 포함
- **agent-admin 새 app 의 monorepo 등록** — `pnpm-workspace.yaml` 패턴 + tsconfig refs 정확히. 기존 `apps/agent-api` 패턴 모방
- **`v6AssetResolver.ts` 가 force-through 경로에서도 호출되는지** — `v6PipelineNode.ts` 의 force-through 분기는 mapping 직접 호출하고 끝, asset resolver 가 호출되는지 코드 확인 필요. 호출 안 되면 force-through 시 RAG capture 안 남는 것이 정상
- **PII**: agent-admin 컨테이너 로그에 prompt body 남기지 말 것 (req log scrub) — 운영 배포 §5b 에서 다룸, V1 로컬에선 무시 OK

## Acceptance Criteria
1. `/admin/runs` 에서 최신 run 이 5초 내 자동 반영된다.
2. 클릭 → 상세 화면에서 §A user input · §B phase timeline · §C interview (있으면) · §D trend research (있으면) · §E brief · §F v6 html iframe + render-quality issues 빨간 강조 · §G asset resolution (RAG 후보 grid + 선택 강조 + Gemini 패널) · §H final commands · §I raw events log 모두 보인다.
3. 한 run 에 ⭐ / tag chip / note 달면 즉시 저장되고, 페이지 새로고침 후에도 유지된다.
4. 리스트에서 `starred=true` / `tag=X` 필터가 동작한다.
5. 새 run 1건 돌리면 `v6-asset-resolution.json` 이 항상 emit, Gemini 발사된 경우 `v6-asset-generated.json` 도 emit 된다.
6. 모든 패키지 typecheck/build/test 통과. 기존 v6 파이프라인 회귀 0.

## Verification
- **Backend typecheck/test**:
  - `cd agent-workflow-test/tooldi-agent-runtime && pnpm --filter @tooldi/agent-api typecheck && pnpm --filter @tooldi/agent-api test`
  - `pnpm --filter @tooldi/agent-worker typecheck && pnpm --filter @tooldi/agent-worker test`
- **Frontend build/lint**:
  - `pnpm --filter @tooldi/agent-admin build`
  - `pnpm --filter @tooldi/agent-admin lint`
- **DB migration dry-run**:
  - `pnpm --filter @tooldi/agent-persistence drizzle:generate` (또는 리포 컨벤션의 동등 명령)
- **Manual end-to-end** (자동화 어려움 — 명시):
  1. 로컬 docker stack 또는 dev 모드로 agent-api / agent-worker / agent-admin 띄움
  2. toolditor 또는 직접 API 로 1 run 실행 (overflow 잘 나는 카피로)
  3. `/admin/runs` 에서 5s 안에 노출 확인
  4. 클릭 → 상세 모든 §섹션 데이터 채워지는지 확인
  5. ⭐ 토글 / tag 추가 / note 입력 → 새로고침 후 유지 확인
  6. starred 필터 / tag 필터 동작 확인
  7. artifact 폴더에 `v6-asset-resolution.json` 존재 확인
  8. Gemini 발사 케이스 한 번 더 돌려서 `v6-asset-generated.json` 도 emit 되는지 확인

## Start Prompt

```
AGW Admin Dashboard V1 구현 작업 시작.

먼저 두 문서 읽고 컨텍스트 잡아:
1. /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/design/2026-05-08-agw-admin-dashboard.md (design — 모든 결정 source of truth)
2. /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/handoff/2026-05-08-agw-admin-dashboard-implementation.md (handoff — 이 파일)

읽고 나서 첫 행동은 `tooldi-plan` 스킬 호출해서 plan.md 작성. design doc §6 의 Week 1 → Week 2 빌드 순서 그대로 PR 단위로 쪼개서 계획. plan 사용자 승인 받은 뒤에만 구현 진입.

작업 리포: /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime/

절대 V1 범위 밖 손대지 마:
- 인증 / 운영 배포 → §5b PR 로 deferred
- Interview 후보지 capture → 코드상 단계 부재
- Run re-run / live diff → non-goals

기억할 것 (auto memory):
- [No auto commit] — 사용자 명시 요청 시에만 커밋
- [커밋 메시지 형식] — [type] 대괄호 (feat/fix/refactor 등), Co-Authored-By 절대 금지
- [Implicit planning] — Plan 모드 호출 X, 단 구현 진입 전 내부 plan(읽을 파일/순서/검증/롤백) 은 항상 선수립
- [Toolditor uses npm] — toolditor 리포 건드릴 일은 이 작업엔 없음 (이번은 agent-runtime 만)

검증은 handoff 의 Acceptance Criteria + Verification 절차 그대로 따라. Manual 검증은 1회 끝낸 후 구현 완료 보고.
```
