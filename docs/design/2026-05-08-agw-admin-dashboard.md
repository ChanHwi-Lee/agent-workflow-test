# AGW Admin Dashboard — Design

**Status**: Draft (브레인스토밍 산출물, 사용자 검토 대기)
**Date**: 2026-05-08
**Author**: ChanHwi-Lee + Claude (brainstorming skill)

## Purpose

상시 모니터링용 내부 대시보드. AGW (Agent Workflow) 한 run 의 모든 상세 (prompt / RAG 후보 / Gemini 생성 / interview / trend research / v6 HTML / render-quality issue / 최종 commands) 를 한 화면에서 보고, 발견한 개선점을 tag/note/star 로 누적해 추후 우선순위 자료로 활용한다.

## Non-Goals (V1)

- 외부 사용자 / 일반 toolditor 사용자 노출
- Run 재실행 (re-run) / live diff
- 운영 배포 + 인증 (별도 PR 로 deferred)
- Interview "질문 후보 → 거절 → 재생성" 캡처 (현재 코드상 그 단계가 없음)
- History / audit trail of annotation edits (last-write-wins)

## Audience & Use Loop

- 1차 사용자: 본인 + 소수 내부 팀, 상시 모니터링.
- 발견한 개선점은 **대시보드 안에서** tag/note/star 로 기록. 별도 시스템 안 둠.
- "이 run 은 RAG 이상" / "느림" / "재현필요" 같은 짧은 코멘트 위주.

## Context

직전 [[../../../]] 작업기록(2026-04 ~ 2026-05) 의 v6 파이프라인 ([2026-04-22-agw-v6-stage1-quality-hybrid-direction]] 결정, [2026-04-30 prompt-strip A/B], [2026-05-08 force-through + 빨강 QA 마커]) 위에서 **개선 포인트를 운영 중에 수집** 하기 위한 도구. 인프라 60% 는 이미 깔려있음 (run_events SSE / artifact 저장 / interview_records).

## §1. 컴포넌트 경계 / 데이터 흐름

```
┌───────────────────────────────────────────────────────────────┐
│  apps/agent-admin (Next.js 14)                       [LOCAL]  │
│  /admin/runs           list (auto-poll 5s)                     │
│  /admin/runs/[runId]   detail (SSE + artifact fetch)           │
└──────────────┬─────────────────────────────────┬──────────────┘
               │ HTTP (no auth in V1)            │ SSE
               ↓                                  ↓
┌───────────────────────────────────────────────────────────────┐
│  agent-api (Fastify, 기존)                                     │
│  NEW  GET  /api/admin/runs?limit&status&before&starred&tag    │
│  NEW  GET  /api/admin/runs/:runId    (metadata + phases       │
│                                       + annotation 통합)      │
│  NEW  POST /api/admin/runs/:runId/annotations                  │
│  EXIST GET /api/agent-workflow/runs/:runId/events  (SSE)       │
│  EXIST GET /api/agent-workflow/runs/:runId/artifacts?key=...   │
└──────────────┬────────────────────────────────────────────────┘
               │
               ↓
┌───────────────────────────────────────────────────────────────┐
│  Postgres (drizzle)                                            │
│   - runs / run_attempts / run_events / agent_interview.*       │
│   - NEW agent_admin.run_annotations                            │
└───────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  agent-worker (capture 확장)             │
│  NEW v6-asset-resolution.json artifact   │
│  NEW v6-asset-generated.json artifact    │
└─────────────────────────────────────────┘
```

핵심 결정:
- mini-app 은 DB 직접 접근 안 함 — agent-api 의 `/api/admin/*` 만 통한다 (단일 진입점).
- annotation 만 새 테이블; 기존 `runs` 에 컬럼 추가 안 함 (lifecycle 분리).
- 자동 갱신은 두 채널 — 리스트 5s polling + 상세 SSE (active 일 때만).
- 새 capture artifact 3종 모두 기존 `persistArtifactTask` 인프라 재사용.

## §2. 캡처 확장 — 새 Artifact 2종

### `v6-asset-resolution.json`

```ts
{
  version: 1,
  runId: string,
  attemptSeq: number,
  placeholders: [{
    sourceSerial: number,
    placeholderHint: string,
    family: "photo" | "graphic",
    candidates: [{
      rank: number,
      qdrantScore: number,
      originKey: string,
      srcUrl: string,
      selected: boolean,
      rejectReason: string | null,
    }],
    decision: "selected" | "generate" | "unresolved",
    decisionReason: string,
    selectedCandidateRank: number | null,
    fallbackGeneratedAssetId: string | null,
  }],
}
```

### `v6-asset-generated.json` (Gemini 발사 시에만)

```ts
{
  version: 1,
  runId: string,
  attemptSeq: number,
  items: [{
    placeholderHint: string,
    model: string,
    prompt: string,
    latencyMs: number,
    outputAssetKey: string,
    outputArtifactUrl: string,
    fileSizeBytes: number,
  }],
}
```

### 코드 변경 위치

| 파일 | 변경 |
|---|---|
| `apps/agent-worker/src/phases/v6AssetResolver.ts` | resolver 가 `resolutionLog` / `generatedLog` 데이터를 결과에 포함 (로직 그대로, 메타 노출만) |
| `apps/agent-worker/src/graph/v6PipelineNode.ts` | resolver 호출 직후 `persistArtifactTask` 2번 (resolution 항상, generated 는 items.length>0 일 때) |
| `apps/agent-worker/src/phases/v6Types.ts` | `V6AssetResolutionLog` / `V6AssetGenerationLog` 타입 export |

핵심 결정:
- Resolver 는 순수 — 데이터만 모아서 반환, persist 는 호출자.
- Interview 후보지는 V1 범위 밖 (코드 단계 부재).
- Gemini prompt 는 그대로 저장; admin app 만 보고 외부 노출 금지 (내부 전용).

## §3. UI 정보 위계 + 자동 갱신

### `/admin/runs` — 리스트 (auto-poll 5s)

```
┌──────────────────────────────────────────────────────────────┐
│ [filters: status ▾  starred ▾  tags ▾  search]   ⟳ 5s        │
├──────────────────────────────────────────────────────────────┤
│ ⭐ 14:23  run_xxx  ✓done  3att  "강아지 쿨매트 1+1..."  [tag]│
│    14:18  run_yyy  ✗fail  1att  "여름 카페 신메뉴..."  [tag]│
│    14:12  run_zzz  ▶run   2att  "결혼식 청첩장..."          │
└──────────────────────────────────────────────────────────────┘
```

컬럼: 시각 / runId(축약) / status badge / attempts / prompt 한 줄 프리뷰 / tag chip / star toggle.
페이지네이션: cursor (`before=<createdAt>`). 서버 limit 50.

### `/admin/runs/[runId]` — 상세 (SSE + artifact fetch)

세로 1단 스크롤. 상단 sticky bar 에 tag/note/star.

```
┌─────────────────────────────────────────────────────────────┐
│  STICKY  run_xxx  ✓done  3att  ⭐  [tag] [tag+]             │
│          [note textarea ──────────────────────────] [save]   │
├─────────────────────────────────────────────────────────────┤
│  §A  User Input    prompt / canvas / userSerial              │
│  §B  Phase Timeline (각 phase 클릭 → 해당 섹션 스크롤)       │
│  §C  Interview     (있으면) 질문+답후보+최종선택             │
│  §D  Trend Research (있으면) 인용+요약                      │
│  §E  Brief         canonical-design-brief JSON pretty        │
│  §F  HTML Generation                                         │
│       ├ system prompt collapsible                            │
│       ├ user message                                         │
│       ├ rendered HTML iframe sandbox                         │
│       └ render-quality report (issues 빨간 강조)            │
│  §G  Asset Resolution                                        │
│       └ placeholder 별 카드:                                │
│         - 후보 grid (thumbnail + score, 선택 강조)          │
│         - 거절 사유                                         │
│         - Gemini 생성됐다면 → prompt + 결과 이미지          │
│  §H  Final Commands  primitive list (filterable)            │
│  §I  Raw Events      collapsible, 최근 이벤트 자동 추가     │
└─────────────────────────────────────────────────────────────┘
```

### 자동 갱신 모델

| 화면 | 채널 | 동작 |
|---|---|---|
| 리스트 | 5s polling | `setInterval` + AbortController. 탭 hidden 일 땐 멈춤 (`document.visibilitychange`). |
| 상세 (active) | SSE | 기존 `/runs/:runId/events` 구독. 새 phase/log 이벤트 → §I prepend, 관련 섹션 artifact refetch. |
| 상세 (terminal) | stale snapshot | SSE close, "이 run 은 종료됨" 배지. polling 안 함. |
| Artifact | on-demand + SSE 트리거 refetch | active 일 때만, 새 phase 이벤트 트리거 시 그 phase 의 key 만 refetch. |

핵심 결정:
- §B (Phase Timeline) 가 nav 역할; 정보 많아져도 nav 하나로 컨트롤.
- §G 가 핵심 가치: 후보 grid + 선택 highlight + Gemini 결과 한눈에 비교.
- §F 의 iframe 은 같은 viewport 사이즈로 미리보기, CSP `sandbox` 격리.

## §4. tag/note/star 데이터 모델

### 새 테이블

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

핵심:
- 1 run = 1 row, partial upsert. history 안 남김 (last-write-wins; 내부 툴).
- `starred` partial index — `WHERE starred` 만 잡아서 가벼움.
- `tags` GIN — `WHERE 'X' = ANY(tags)` O(log n).

### API

```
POST /api/admin/runs/:runId/annotations
  body: { starred?, tags?, note? }    // tags 는 전체 교체
  → 200 { runId, starred, tags, note, updatedBy, updatedAt }
```

### 리스트 조회 SQL

```sql
SELECT r.*, a.starred, a.tags, LEFT(a.note, 80) AS note_preview
FROM runs r
LEFT JOIN agent_admin.run_annotations a ON a.run_id = r.id
WHERE ($status IS NULL OR r.status = $status)
  AND ($starred IS NULL OR a.starred = $starred)
  AND ($tag IS NULL OR $tag = ANY(a.tags))
ORDER BY r.created_at DESC
LIMIT 50;
```

### Tag UX

- 입력: chip input (Enter 추가, ✕ 제거).
- 자동완성: `GET /api/admin/runs/_meta/tags` → DISTINCT unnest, 5분 메모리 캐시.
- 추천 시드 (UI quick-add): `RAG-이상`, `interview-이상`, `overflow`, `느림`, `재현필요`, `좋은예`, `나쁜예`. 사용자 자유 추가 가능.

핵심 결정:
- history 안 남김; 향후 audit 필요하면 `run_annotation_history` 추가 (현재는 over-engineering).
- `note` 최대 1000자.
- `tags` 별도 테이블 안 만듦; TEXT[] + GIN 으로 충분.
- `updated_by` 는 string (FK 없음). V1 (no auth) 에선 고정값 `"local"` 기록. 운영 인증 도입 시 §5b 에서 실제 사용자 식별자로 교체.

## §5. 로컬 실행 (V1)

### 배포 형태
- agent-admin 은 로컬에서만 (`pnpm --filter @tooldi/agent-admin dev`).
- 운영 배포는 별도 PR (deferred).
- 포트: 3200 (`localhost:3200/admin/runs`). agent-api 는 3100.

### 인증
- **없음.** 로컬 전용.
- agent-api 의 `/api/admin/*` 는 `process.env.NODE_ENV !== 'production'` 가드만 (운영 실수 방지).

### 환경변수 (agent-admin, .env.local)
```
AGENT_API_INTERNAL_URL=http://localhost:3100
```

### 후속 (운영 배포 시)
별도 §5b brainstorming. 배포·ingress·인증·CSRF 그때 다룸. 지금 design doc 에는 deferred 로만.

## §6. 빌드 순서 (2주 + 버퍼)

각 단계는 그날 끝나면 화면에서 보이게 묶음. PR 단위로 끊기 좋음.

### Week 1 — bones

| Day | 산출물 |
|---|---|
| 1–2 | Scaffold + DB: `apps/agent-admin` Next.js 14 init, monorepo workspaces 등록. `packages/persistence/drizzle/<NNN>_run_annotations.sql` migration. agent-api 에 `/api/admin/runs` (list) + `/api/admin/runs/:runId` (detail) endpoint, env-gate. |
| 3 | 리스트 화면: `/admin/runs` page. 5s polling, status badge, prompt 한 줄. 필터 미구현 OK. |
| 4 | 상세 skeleton: `/admin/runs/[runId]` — sticky header, §A user input, §B phase timeline (단순 stepper). |
| 5 | 이벤트 스트림: §I raw events log + SSE 구독. 종료 run stale snapshot. |

### Week 2 — feature out

| Day | 산출물 |
|---|---|
| 1 | §C interview + §D trend research (기존 artifact/records). |
| 2 | §F HTML generation: iframe sandbox + render-quality issues 빨간 강조. |
| 3 | RAG capture (worker): `v6-asset-resolution.json` + `v6-asset-generated.json` artifact emit. |
| 4 | §G asset resolution UI: 후보 thumbnail grid + 선택 강조 + Gemini 패널. |
| 5 | annotation 묶음: server action POST + sticky bar tag/note/star + 리스트 필터. |

### Week 3 — buffer

- Filter/search 보강 (date range, tag autocomplete cache)
- Keyboard shortcut (j/k, ⭐ 토글)
- Copy runId / artifact key
- §H final commands JSON viewer 폴리싱
- 인터뷰 후보지 capture (필요 시)

### 마일스톤 체크포인트

- **End of Week 1 Day 5** — read-only monitor 가능. tag 못 다는 것만 빼면 거의 다 됨. 이 시점에서 한번 "써보고 평가" 권장.
- **End of Week 2 Day 5** — full feature MVP. RAG/Gemini 까지 시각화. tag/star 누적 시작.

핵심 결정:
- Scaffold + 빈 endpoint 먼저, UI 가 그걸 사용. 절대 UI 먼저 X.
- RAG capture (Week 2 Day 3) 는 worker 변경 → agent-worker 빌드/배포 사이클 따름. agent-admin 보다 sensitive.
- annotation 마지막 — 데이터 없이 화면부터 보고 며칠 운영 후 진짜 필요한 tag 결정.

## Open Questions / Risks

- **Interview "질문 후보" 캡처**: 현재 LLM 단일 호출이라 후보 단계 자체가 없음. 추후 interview LLM 을 multi-step 으로 바꾸면 그때 capture 추가.
- **Annotation 충돌**: 두 명이 동시 편집하면 last-write-wins. 내부 툴이라 OK 라고 가정. 실제 사용 후 충돌 빈도 보고 결정.
- **§G 후보 thumbnail**: Qdrant 후보의 srcUrl 이 외부 CDN 일 때 CSP 정책. iframe sandbox 와 충돌 없는지 Week 2 Day 4 검증 필요.
- **PII**: agent-admin 컨테이너 로그에 prompt body 안 남기기 (req log scrub). 운영 배포 §5b 에서 다시 다룸.
- **Run 폭증 시 리스트 성능**: `runs.created_at` index 필요 — 기존 인덱스 확인. 없으면 migration 에 포함.

## Implementation Plan 진입

본 design 승인되면 `writing-plans` 스킬 또는 `tooldi-plan` 으로 implementation plan 작성으로 이전.
