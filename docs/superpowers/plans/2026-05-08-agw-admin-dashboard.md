# AGW Admin Dashboard V1 Implementation Plan

> **STATUS — 2026-05-08:** 본 plan 은 fully-loaded 버전 (annotation/SSE replay/필터/추가 섹션 모두 포함). V0 slice 로 먼저 진행하기로 결정 → 실제 실행 plan 은 [`./2026-05-08-agw-result-dashboard-v0.md`](./2026-05-08-agw-result-dashboard-v0.md). 본 V1 plan 은 V0 후속 작업 시 annotation / SSE replay (Codex finding 3) / If-Match concurrency (Codex finding 5) / §C·§D·§E 섹션 / 필터 디테일을 옮겨오는 reference 로 보존.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AGW (Agent Workflow) 내부 모니터링용 admin dashboard V1 — `/admin/runs` 리스트 + 상세 (§A~§I), tag/note/star annotation, RAG decision capture artifact 2종.

**Architecture:** 신규 sibling Next.js 14 mini-app `apps/agent-admin` (port 3200, App Router) 가 기존 agent-api Fastify (port 3000) 의 새 `/api/admin/*` 엔드포인트만 호출. 신규 테이블 `agent_admin.run_annotations` (1 run = 1 row, last-write-wins). 기존 `persistArtifactTask` 재사용해 worker 가 `v6-asset-resolution.json` (항상) 과 `v6-asset-generated.json` (Gemini 발사 시) 두 artifact 추가 emit. V1 은 로컬 전용 + 인증 없음 (`NODE_ENV !== 'production'` 가드만).

**Tech Stack:** TypeScript + pnpm workspace · Fastify 5 (agent-api) · Next.js 14 App Router + Tailwind CSS (agent-admin, 첫 frontend) · Drizzle ORM + Postgres · TypeBox (contracts) · Node.js built-in test runner (`node --test`) · TDD (red → green → refactor) · 기존 `persistArtifactTask` / `objectStore` / `agent_runtime` schema 재사용.

**Source of truth:**
- Design: [`../../design/2026-05-08-agw-admin-dashboard.md`](../../design/2026-05-08-agw-admin-dashboard.md)
- Handoff: [`../../handoff/2026-05-08-agw-admin-dashboard-implementation.md`](../../handoff/2026-05-08-agw-admin-dashboard-implementation.md)

**Repo root:** `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime/`

**Convention notes (코드 1차 조사 결과 — design 과 충돌 시 코드를 ground truth):**
- agent-api 실제 포트: **3000** (design 의 3100 과 다름). 본 plan 은 실제값 3000 사용. env var 이름 `AGENT_API_INTERNAL_URL` 은 design 명세 따름.
- agent-api 라우트 컨벤션: `apps/agent-api/src/routes/{public|internal}/<name>.<method>.ts` → `app.ts` 에서 manual `await app.register(...)`. Auto-discovery 없음.
- DB 액세스: `apps/agent-api/src/repositories/*.ts` 에 repository 클래스. Drizzle ORM 직접 사용.
- contracts: TypeBox (`Type.Object`, `Type.Union` 등). `packages/contracts/src/<group>/<name>.ts` + `index.ts` 재export.
- Drizzle schema: `packages/persistence/src/schema/*.ts`. 기존 `agentRuntimePgSchema` (`agent_runtime`) 와 별도로 새 `agent_admin` schema 추가 예정.
- Drizzle 마이그레이션: `packages/persistence/drizzle/NNNN_name.sql` (현재 0000~0002 존재 → 새 것은 `0003_run_annotations.sql`). `pnpm drizzle:generate` 로 생성, 시작 시 advisory-lock 자동 적용.
- Test runner: `node --test`, `*.test.ts` 소스 옆에 co-locate.
- agent-admin 은 첫 Next.js 앱 → workspace 루트에 Tailwind/ESLint 공유 config 없음. 앱 안에서 self-contained 로 셋업.

**Ground truth pinned (Codex adversarial review 후 정정 — 절대 새 enum/string 만들지 말 것):**
- **Run status — `RunStatusValues` 13개** (from `packages/contracts/src/common.ts`):
  `enqueue_pending`, `planning_queued`, `planning`, `plan_ready`, `executing`, `awaiting_apply_ack`, `saving`, `finalizing`, `cancel_requested`, `completed`, `save_failed_after_apply`, `failed`, `cancelled`. → `RunStatusSchema` 재사용.
- **Terminal status — `TerminalRunStatusValues` 4개**: `completed`, `save_failed_after_apply`, `failed`, `cancelled`. → `isTerminalRunStatus` from `@tooldi/agent-domain` 재사용. `succeeded` 같은 단어 plan 어디에도 등장 금지.
- **실제 emit artifact kinds + 파일명 (kind ≠ filename 케이스 주의)**:

  | artifactKind | 파일명 |
  |---|---|
  | `brief-compilation-report` | `brief-compilation-report.json` |
  | `canonical-design-brief` | `canonical-design-brief.json` |
  | `v6-trend-brief` | `v6-trend-brief.json` |
  | `v6-render-quality-report` | `v6-render-quality-report.json` (+ per-attempt `v6-render-quality-report-attempt-N.json`) |
  | `v6-render-quality-failure` | `v6-render-quality-failure-attempt-N.json` |
  | `debug-v6-html-preview` | `debug-v6-html.json` |
  | `debug-unrestricted-html-preview` | `debug-unrestricted-html.json` |
  | `executable-plan` | `executable-plan.json` |
  | `v6-asset-resolution` (신규) | `v6-asset-resolution.json` |
  | `v6-asset-generated` (신규, 조건부) | `v6-asset-generated.json` |

  중앙 enum 없음 — 본 plan 에서 신규 추가 (`packages/contracts/src/admin/artifact-kinds.ts`) 해서 admin 측이 type-safe 하게 import.
- **artifactRefs 출처 — `RunCompletionRecord.sourceRefs` 는 일부만 포함** (canonical-design-brief, brief-compilation-report, executable-plan, semantic-brief-draft). debug/render-quality/trend/RAG 신규는 빠짐. → admin detail 은 별도 list endpoint 로 object-store 에서 prefix `runs/<runId>/attempts/<seq>/` 직접 enumerate.
- **SSE resume — 서버는 이미 replay 지원** (`apps/agent-api/src/routes/public/run-events.sse.ts:32-54`):
  query `afterEventId` 우선, 없으면 `Last-Event-ID` header coerce. `id: ${eventId}` line emit. → admin proxy 는 `Last-Event-ID` 헤더 forward 만 하면 EventSource 자동 재연결로 충분. plan 어디에서도 첫 error 에 `es.close()` 호출 금지 (브라우저 EventSource 자체 재연결 동작 보존).
- **Capture 실패 정책 패턴 — best-effort try/catch + warn event** (mirror `apps/agent-worker/src/graph/v6PipelineNode.ts:582-624` 의 unrestricted preview):

  ```typescript
  try {
    ref = await persistArtifactTask(...);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    await appendEventTask(state.job.runId, {
      event: { type: "log", level: "warn", message: `[<kind>] persist failed: ${message}` },
    });
  }
  ```

  RAG capture 두 개 모두 admin observability 전용 → user-visible draft 영향 없음 → best-effort.

---

## File Structure (분담)

신규/수정 파일을 책임 단위로 미리 잠금. 각 task 가 이 파일 슬롯들의 부분을 채워간다.

### packages/persistence (drizzle)
- **신규** `packages/persistence/drizzle/0003_run_annotations.sql` — schema + table + index 마이그레이션
- **신규** `packages/persistence/src/schema/admin.ts` — `agentAdminPgSchema` + `runAnnotations` table
- **수정** `packages/persistence/src/schema/index.ts` — admin schema export 추가
- **수정** `packages/persistence/src/pg/client.ts` — `AgentRuntimeDb` 타입에 admin 테이블 포함되도록 schema 합치기

### packages/contracts
- **신규** `packages/contracts/src/admin/run-summary.ts` — `AdminRunSummarySchema` (TypeBox, status는 `RunStatusSchema` 재사용)
- **신규** `packages/contracts/src/admin/run-detail.ts` — `AdminRunDetailSchema`, `AttemptSummarySchema`, `PhaseSummarySchema`, `ArtifactRefSchema`
- **신규** `packages/contracts/src/admin/run-annotation.ts` — `RunAnnotationSchema`, `AnnotationUpsertBodySchema` (`ifMatchUpdatedAt` 포함)
- **신규** `packages/contracts/src/admin/artifact-kinds.ts` — `AdminArtifactKindValues` (실제 worker emit kind 9종 + 신규 RAG 2종) + `AdminArtifactKindSchema`
- **신규** `packages/contracts/src/admin/index.ts` — 그룹 export
- **수정** `packages/contracts/src/index.ts` — `./admin/index` re-export

### apps/agent-api (Fastify)
- **신규** `apps/agent-api/src/repositories/AdminRunRepository.ts` — list/detail/tag-meta SQL
- **신규** `apps/agent-api/src/repositories/RunAnnotationRepository.ts` — upsert (If-Match) + fetch
- **신규** `apps/agent-api/src/services/AdminArtifactDiscoveryService.ts` — object-store prefix list → ArtifactRef[]
- **신규** `apps/agent-api/src/routes/internal/admin-runs-list.get.ts` — `GET /api/admin/runs`
- **신규** `apps/agent-api/src/routes/internal/admin-run-detail.get.ts` — `GET /api/admin/runs/:runId`
- **신규** `apps/agent-api/src/routes/internal/admin-annotation-upsert.post.ts` — `POST /api/admin/runs/:runId/annotations` (409 on If-Match mismatch)
- **신규** `apps/agent-api/src/routes/internal/admin-tags-meta.get.ts` — `GET /api/admin/runs/_meta/tags` (5분 메모리 캐시)
- **신규** `apps/agent-api/src/lib/adminGuard.ts` — `NODE_ENV !== 'production'` preHandler
- **수정** `apps/agent-api/src/app.ts` — 4개 admin route + adminGuard 등록
- **신규 테스트** 위 6개 파일 옆에 `*.test.ts`

### apps/agent-worker (RAG capture)
- **수정** `apps/agent-worker/src/phases/v6Types.ts` — `V6AssetResolutionLog`, `V6AssetGenerationLog` 타입 export
- **수정** `apps/agent-worker/src/phases/v6AssetResolver.ts` — return shape 에 `resolutionLog`, `generatedLog` 추가 (로직 무변경)
- **수정** `apps/agent-worker/src/graph/v6PipelineNode.ts` — resolver 호출 직후 `persistArtifactTask` 2회 (resolution always, generated 조건부)
- **신규 테스트** `apps/agent-worker/src/phases/v6AssetResolver.test.ts` (resolutionLog 형태 검증), `apps/agent-worker/src/graph/v6PipelineNode.artifact.test.ts` (artifact emit smoke)

### apps/agent-admin (Next.js 14, 신규 앱)
- **신규** `apps/agent-admin/package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `.eslintrc.json`, `.env.local.example`
- **신규** `apps/agent-admin/src/app/layout.tsx`, `apps/agent-admin/src/app/globals.css`
- **신규** `apps/agent-admin/src/app/admin/runs/page.tsx` — 리스트
- **신규** `apps/agent-admin/src/app/admin/runs/[runId]/page.tsx` — 상세 (server component)
- **신규** `apps/agent-admin/src/components/RunsList.tsx` — 5s polling client component
- **신규** `apps/agent-admin/src/components/RunDetailLive.tsx` — SSE 구독 client component (active runs)
- **신규** `apps/agent-admin/src/components/sections/SectionUserInput.tsx` (§A)
- **신규** `apps/agent-admin/src/components/sections/SectionPhaseTimeline.tsx` (§B)
- **신규** `apps/agent-admin/src/components/sections/SectionInterview.tsx` (§C)
- **신규** `apps/agent-admin/src/components/sections/SectionTrendResearch.tsx` (§D)
- **신규** `apps/agent-admin/src/components/sections/SectionBrief.tsx` (§E)
- **신규** `apps/agent-admin/src/components/sections/SectionHtmlGeneration.tsx` (§F, iframe sandbox + render-quality 빨강)
- **신규** `apps/agent-admin/src/components/sections/SectionAssetResolution.tsx` (§G, RAG 후보 grid + Gemini 패널)
- **신규** `apps/agent-admin/src/components/sections/SectionFinalCommands.tsx` (§H)
- **신규** `apps/agent-admin/src/components/sections/SectionRawEvents.tsx` (§I)
- **신규** `apps/agent-admin/src/components/AnnotationStickyBar.tsx` — tag/note/star
- **신규** `apps/agent-admin/src/lib/adminApi.ts` — server-side fetch wrapper (uses `AGENT_API_INTERNAL_URL`)
- **신규** `apps/agent-admin/src/app/admin/runs/actions.ts` — server action: annotation upsert
- **수정** `pnpm-workspace.yaml` — 변경 없음 (`apps/*` glob 으로 자동 픽업, **확인만**)

---

## Task 1: Workspace scaffold + DB migration + admin contracts (Day 1–2 of Week 1)

**1 PR — 빌드 가능한 빈 골격까지.**

**Files:**
- Create: `packages/persistence/drizzle/0003_run_annotations.sql`
- Create: `packages/persistence/src/schema/admin.ts`
- Modify: `packages/persistence/src/schema/index.ts`
- Modify: `packages/persistence/src/pg/client.ts`
- Create: `packages/contracts/src/admin/run-summary.ts`, `run-detail.ts`, `run-annotation.ts`, `artifact-kinds.ts`, `index.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/agent-admin/package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `.eslintrc.json`, `.env.local.example`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/admin/runs/page.tsx` (placeholder)
- Test: `packages/contracts/src/admin/run-annotation.test.ts`

- [ ] **Step 1: Drizzle schema for admin.run_annotations**

Create `packages/persistence/src/schema/admin.ts`:

```typescript
import {
  boolean,
  pgSchema,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { runs } from "./runtime.js";

export const agentAdminPgSchema = pgSchema("agent_admin");

export const runAnnotations = agentAdminPgSchema.table(
  "run_annotations",
  {
    runId: text("run_id")
      .primaryKey()
      .references(() => runs.id, { onDelete: "cascade" }),
    starred: boolean("starred").notNull().default(false),
    tags: text("tags").array().notNull().default([]),
    note: text("note").notNull().default(""),
    updatedBy: text("updated_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const agentAdminSchema = {
  runAnnotations,
};
```

- [ ] **Step 2: Re-export admin schema**

Modify `packages/persistence/src/schema/index.ts` — append:

```typescript
export * from "./admin.js";
export { agentAdminPgSchema, agentAdminSchema } from "./admin.js";
```

- [ ] **Step 3: Merge admin schema into AgentRuntimeDb type**

Modify `packages/persistence/src/pg/client.ts` — find the line that constructs the drizzle schema generic (currently `NodePgDatabase<typeof agentRuntimeSchema>`) and merge admin schema:

```typescript
import { agentRuntimeSchema } from "../schema/runtime.js";
import { agentAdminSchema } from "../schema/admin.js";

const fullSchema = { ...agentRuntimeSchema, ...agentAdminSchema };
export type AgentRuntimeDb = NodePgDatabase<typeof fullSchema>;
// ... pass fullSchema to drizzle({ schema: fullSchema })
```

- [ ] **Step 4: Generate drizzle migration**

Run from `packages/persistence`:

```bash
pnpm drizzle:generate
```

Expected: produces `packages/persistence/drizzle/0003_<auto-name>.sql`. Rename to `0003_run_annotations.sql`. Verify content:

```sql
CREATE SCHEMA IF NOT EXISTS "agent_admin";

CREATE TABLE IF NOT EXISTS "agent_admin"."run_annotations" (
  "run_id" text PRIMARY KEY NOT NULL,
  "starred" boolean DEFAULT false NOT NULL,
  "tags" text[] DEFAULT '{}'::text[] NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "updated_by" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "run_annotations_run_id_runs_id_fk" FOREIGN KEY ("run_id")
    REFERENCES "agent_runtime"."runs"("id") ON DELETE cascade ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "idx_run_annotations_starred"
  ON "agent_admin"."run_annotations" ("starred") WHERE "starred";
CREATE INDEX IF NOT EXISTS "idx_run_annotations_tags"
  ON "agent_admin"."run_annotations" USING gin ("tags");
```

(drizzle-kit 이 partial / GIN index 직접 생성을 안 하면 SQL 끝에 두 줄 수동 추가.)

- [ ] **Step 5: Verify migration round-trip**

Run a local Postgres against the persistence package:

```bash
pnpm --filter @tooldi/agent-persistence test
```

Expected: 모든 기존 테스트 + 새 schema 가 import 되어도 통과.

- [ ] **Step 6: Add TypeBox contract — RunAnnotation**

Create `packages/contracts/src/admin/run-annotation.ts`:

```typescript
import { Type, type Static } from "@sinclair/typebox";

export const RunAnnotationSchema = Type.Object({
  runId: Type.String({ minLength: 1 }),
  starred: Type.Boolean(),
  tags: Type.Array(Type.String({ minLength: 1, maxLength: 64 })),
  note: Type.String({ maxLength: 1000 }),
  updatedBy: Type.String({ minLength: 1 }),
  updatedAt: Type.String({ format: "date-time" }),
});
export type RunAnnotation = Static<typeof RunAnnotationSchema>;

export const AnnotationUpsertBodySchema = Type.Object({
  starred: Type.Optional(Type.Boolean()),
  tags: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 64 }))),
  note: Type.Optional(Type.String({ maxLength: 1000 })),
  // ← Codex finding 5: optimistic concurrency
  // 클라이언트가 본 마지막 updatedAt 을 If-Match 로 보냄. 서버는 현재 row 와 mismatch 시 409.
  // 첫 작성 (row 없음) 일 때는 omit 또는 null 허용.
  ifMatchUpdatedAt: Type.Optional(Type.Union([Type.String({ format: "date-time" }), Type.Null()])),
});
export type AnnotationUpsertBody = Static<typeof AnnotationUpsertBodySchema>;
```

- [ ] **Step 7: TDD — failing test for RunAnnotation contract**

Create `packages/contracts/src/admin/run-annotation.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Value } from "@sinclair/typebox/value";
import { AnnotationUpsertBodySchema, RunAnnotationSchema } from "./run-annotation.js";

describe("RunAnnotation contract", () => {
  it("note 1000자 초과는 거절", () => {
    const tooLong = "x".repeat(1001);
    assert.equal(Value.Check(AnnotationUpsertBodySchema, { note: tooLong }), false);
  });

  it("tag 길이 64자 이하만 허용", () => {
    assert.equal(Value.Check(AnnotationUpsertBodySchema, { tags: ["x".repeat(65)] }), false);
    assert.equal(Value.Check(AnnotationUpsertBodySchema, { tags: ["overflow"] }), true);
  });

  it("RunAnnotation 응답 shape 통과", () => {
    const sample = {
      runId: "run_xxx",
      starred: true,
      tags: ["RAG-이상"],
      note: "메모",
      updatedBy: "local",
      updatedAt: "2026-05-08T05:00:00.000Z",
    };
    assert.equal(Value.Check(RunAnnotationSchema, sample), true);
  });
});
```

- [ ] **Step 8: Run failing test**

```bash
cd packages/contracts && pnpm test
```

Expected: `Cannot find module './run-annotation.js'` or test failure if Step 6 file 없으면. (Step 6 가 먼저 작성됐으면 PASS — 그래도 좋은 sanity check.)

- [ ] **Step 9: Add AdminRunSummary + AdminRunDetail contracts**

Create `packages/contracts/src/admin/run-summary.ts`:

```typescript
import { Type, type Static } from "@sinclair/typebox";
import { RunStatusSchema } from "../common.js";   // 13-value enum 재사용 — admin 전용 status 만들지 말 것

export const AdminRunSummarySchema = Type.Object({
  runId: Type.String(),
  status: RunStatusSchema,                          // ← Codex finding 1: drift 방지
  createdAt: Type.String({ format: "date-time" }),
  attempts: Type.Integer({ minimum: 0 }),
  promptPreview: Type.String(),  // 최대 120자
  starred: Type.Boolean(),
  tags: Type.Array(Type.String()),
  notePreview: Type.String(),    // 최대 80자
});
export type AdminRunSummary = Static<typeof AdminRunSummarySchema>;

export const AdminRunsListResponseSchema = Type.Object({
  runs: Type.Array(AdminRunSummarySchema),
  hasMore: Type.Boolean(),
  nextBefore: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
});
export type AdminRunsListResponse = Static<typeof AdminRunsListResponseSchema>;
```

Create `packages/contracts/src/admin/artifact-kinds.ts`:

```typescript
import { Type, type Static } from "@sinclair/typebox";

// 워커가 실제로 emit 하는 artifactKind (코드 grep 결과 9종) + admin 신규 RAG 2종.
// 새 종류 추가는 워커 변경과 동시에 이 enum 도 갱신해야 함.
export const AdminArtifactKindValues = [
  "brief-compilation-report",
  "canonical-design-brief",
  "v6-trend-brief",
  "v6-render-quality-report",
  "v6-render-quality-failure",
  "debug-v6-html-preview",
  "debug-unrestricted-html-preview",
  "executable-plan",
  "v6-asset-resolution",     // 신규 (Task 8)
  "v6-asset-generated",      // 신규 (Task 8, 조건부 emit)
] as const;

export const AdminArtifactKindSchema = Type.Union(
  AdminArtifactKindValues.map((v) => Type.Literal(v)),
);
export type AdminArtifactKind = Static<typeof AdminArtifactKindSchema>;

// kind → 파일명 매핑 (kind 와 filename 이 다른 케이스 — debug-v6-html-preview ↔ debug-v6-html.json)
// 단, render-quality 처럼 per-attempt 변종이 있는 경우 prefix 만 보장.
export const AdminArtifactFilenameByKind: Record<AdminArtifactKind, string> = {
  "brief-compilation-report":          "brief-compilation-report.json",
  "canonical-design-brief":            "canonical-design-brief.json",
  "v6-trend-brief":                    "v6-trend-brief.json",
  "v6-render-quality-report":          "v6-render-quality-report.json",
  "v6-render-quality-failure":         "v6-render-quality-failure.json",
  "debug-v6-html-preview":             "debug-v6-html.json",
  "debug-unrestricted-html-preview":   "debug-unrestricted-html.json",
  "executable-plan":                   "executable-plan.json",
  "v6-asset-resolution":               "v6-asset-resolution.json",
  "v6-asset-generated":                "v6-asset-generated.json",
};
```

Create `packages/contracts/src/admin/run-detail.ts`:

```typescript
import { Type, type Static } from "@sinclair/typebox";
import { AdminRunSummarySchema } from "./run-summary.js";
import { RunAnnotationSchema } from "./run-annotation.js";
import { AdminArtifactKindSchema } from "./artifact-kinds.js";

export const AttemptSummarySchema = Type.Object({
  attemptSeq: Type.Integer({ minimum: 0 }),
  status: Type.String(),
  startedAt: Type.String({ format: "date-time" }),
  finishedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
});
export type AttemptSummary = Static<typeof AttemptSummarySchema>;

export const PhaseSummarySchema = Type.Object({
  phase: Type.String(),
  status: Type.Union(["pending", "running", "ok", "fail"].map((s) => Type.Literal(s))),
  startedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  finishedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
});
export type PhaseSummary = Static<typeof PhaseSummarySchema>;

export const ArtifactRefSchema = Type.Object({
  kind: AdminArtifactKindSchema,            // ← Codex finding 2: 실제 worker emit kind 만 허용
  key: Type.String(),                       //   `runs/<runId>/attempts/<seq>/<filename>` 풀패스
  attemptSeq: Type.Integer(),
  exists: Type.Boolean(),                   //   object-store HEAD 결과 — false 면 UI 가 fetch 안 함
});
export type ArtifactRef = Static<typeof ArtifactRefSchema>;

export const AdminRunDetailSchema = Type.Object({
  run: AdminRunSummarySchema,
  attempts: Type.Array(AttemptSummarySchema),
  phases: Type.Array(PhaseSummarySchema),
  annotation: Type.Union([RunAnnotationSchema, Type.Null()]),
  artifactRefs: Type.Array(ArtifactRefSchema),
});
export type AdminRunDetail = Static<typeof AdminRunDetailSchema>;
```

Create `packages/contracts/src/admin/index.ts`:

```typescript
export * from "./artifact-kinds.js";
export * from "./run-summary.js";
export * from "./run-detail.js";
export * from "./run-annotation.js";
```

Modify `packages/contracts/src/index.ts` — append:

```typescript
export * from "./admin/index.js";
```

- [ ] **Step 10: Verify contracts test PASS**

```bash
cd packages/contracts && pnpm test
```

Expected: all tests PASS, including 3 new RunAnnotation tests.

- [ ] **Step 11: Scaffold Next.js 14 app — package.json**

Create `apps/agent-admin/package.json`:

```json
{
  "name": "@tooldi/agent-admin",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3200",
    "build": "next build",
    "start": "next start -p 3200",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tooldi/agent-contracts": "workspace:*",
    "next": "14.2.15",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0",
    "autoprefixer": "^10.4.20",
    "eslint": "^8.57.0",
    "eslint-config-next": "14.2.15",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 12: Scaffold tsconfig.json**

Create `apps/agent-admin/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "incremental": true,
    "noEmit": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "allowJs": true,
    "skipLibCheck": true,
    "composite": false,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "src/**/*", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 13: Scaffold next.config.mjs**

Create `apps/agent-admin/next.config.mjs`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3200"] },
  },
  // 운영 빌드 차단 — V1 은 dev 모드 전용
};

export default nextConfig;
```

- [ ] **Step 14: Scaffold Tailwind**

Create `apps/agent-admin/tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
export default config;
```

Create `apps/agent-admin/postcss.config.mjs`:

```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 15: globals.css + layout.tsx**

Create `apps/agent-admin/src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Create `apps/agent-admin/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AGW Admin",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-zinc-50 text-zinc-900 min-h-screen">{children}</body>
    </html>
  );
}
```

- [ ] **Step 16: Placeholder runs page**

Create `apps/agent-admin/src/app/admin/runs/page.tsx`:

```tsx
export default function RunsPage() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">AGW Runs (placeholder)</h1>
      <p className="text-sm text-zinc-600">Task 2 에서 구현됩니다.</p>
    </main>
  );
}
```

- [ ] **Step 17: env.local.example + .eslintrc**

Create `apps/agent-admin/.env.local.example`:

```
AGENT_API_INTERNAL_URL=http://localhost:3000
```

Create `apps/agent-admin/.eslintrc.json`:

```json
{ "extends": "next/core-web-vitals" }
```

- [ ] **Step 18: Install + build smoke**

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime
pnpm install
pnpm --filter @tooldi/agent-admin build
```

Expected: Next.js build 통과, `.next/` 산출. 경고는 OK, 에러 0.

- [ ] **Step 19: Commit**

```bash
git add packages/persistence packages/contracts apps/agent-admin
git commit -m "[feat] AGW admin 스카폴드 + run_annotations 마이그레이션 + admin contracts"
```

---

## Task 2: agent-api admin endpoints + repositories (Day 1–2 후반 / 수반)

**1 PR — agent-api 측 새 라우트 4종 작동.**

**Files:**
- Create: `apps/agent-api/src/lib/adminGuard.ts`
- Create: `apps/agent-api/src/repositories/AdminRunRepository.ts`
- Create: `apps/agent-api/src/repositories/RunAnnotationRepository.ts`
- Create: `apps/agent-api/src/routes/internal/admin-runs-list.get.ts`
- Create: `apps/agent-api/src/routes/internal/admin-run-detail.get.ts`
- Create: `apps/agent-api/src/routes/internal/admin-annotation-upsert.post.ts`
- Create: `apps/agent-api/src/routes/internal/admin-tags-meta.get.ts`
- Modify: `apps/agent-api/src/app.ts`
- Test: 위 6개 옆에 `*.test.ts`

- [ ] **Step 1: TDD — adminGuard test**

Create `apps/agent-api/src/lib/adminGuard.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { adminGuard } from "./adminGuard.js";

describe("adminGuard", () => {
  it("NODE_ENV=production 일 때 404", async () => {
    process.env.NODE_ENV = "production";
    const app = Fastify();
    app.addHook("preHandler", adminGuard);
    app.get("/api/admin/x", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/api/admin/x" });
    assert.equal(res.statusCode, 404);
    await app.close();
  });

  it("NODE_ENV=development 일 때 통과", async () => {
    process.env.NODE_ENV = "development";
    const app = Fastify();
    app.addHook("preHandler", adminGuard);
    app.get("/api/admin/x", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/api/admin/x" });
    assert.equal(res.statusCode, 200);
    await app.close();
  });
});
```

- [ ] **Step 2: Implement adminGuard**

Create `apps/agent-api/src/lib/adminGuard.ts`:

```typescript
import type { onRequestAsyncHookHandler } from "fastify";

export const adminGuard: onRequestAsyncHookHandler = async (request, reply) => {
  if (!request.url.startsWith("/api/admin/")) return;
  if (process.env.NODE_ENV === "production") {
    void reply.code(404).send({ error: "not_found" });
    return reply;
  }
};
```

- [ ] **Step 3: Run guard tests**

```bash
pnpm --filter @tooldi/agent-api test --test-name-pattern adminGuard
```

Expected: 2 PASS.

- [ ] **Step 4: TDD — RunAnnotationRepository upsert test**

Create `apps/agent-api/src/repositories/RunAnnotationRepository.test.ts`:

```typescript
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createTestDb } from "@tooldi/agent-testkit";
import { RunAnnotationRepository } from "./RunAnnotationRepository.js";

describe("RunAnnotationRepository", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  before(async () => { ctx = await createTestDb(); });
  after(async () => { await ctx.close(); });

  it("기존 row 가 없으면 INSERT, 있으면 partial UPDATE", async () => {
    await ctx.seedRun("run_a");
    const repo = new RunAnnotationRepository(ctx.db);

    const a = await repo.upsert("run_a", { starred: true, tags: ["RAG-이상"], note: "x" }, "local");
    assert.equal(a.starred, true);
    assert.deepEqual(a.tags, ["RAG-이상"]);

    const b = await repo.upsert("run_a", { note: "수정" }, "local");
    assert.equal(b.starred, true);             // 보존
    assert.deepEqual(b.tags, ["RAG-이상"]);    // 보존
    assert.equal(b.note, "수정");              // 갱신
  });

  it("findByRunId — 없으면 null", async () => {
    const repo = new RunAnnotationRepository(ctx.db);
    assert.equal(await repo.findByRunId("missing"), null);
  });

  it("If-Match — updatedAt mismatch 시 AnnotationConflictError throw (Codex finding 5)", async () => {
    await ctx.seedRun("run_b");
    const repo = new RunAnnotationRepository(ctx.db);
    const first = await repo.upsert("run_b", { tags: ["a"] }, "local");
    await assert.rejects(
      repo.upsert("run_b", { tags: ["b"], ifMatchUpdatedAt: "2026-01-01T00:00:00.000Z" }, "local"),
      (err: Error) => err.name === "AnnotationConflictError",
    );
    // 정상 — 직전 updatedAt 사용
    const ok = await repo.upsert("run_b", { tags: ["c"], ifMatchUpdatedAt: first.updatedAt }, "local");
    assert.deepEqual(ok.tags, ["c"]);
  });
});
```

> **참고:** `createTestDb` / `seedRun` 가 testkit 에 없으면 이 task 첫 step 은 testkit 확장 — `packages/testkit/src/db.ts` 에 helper 추가. 기존 testkit 컨벤션 `agent-api` 다른 repository 테스트에서 어떻게 db 띄우는지 mirror. (agent-api 의 다른 `*.test.ts` 가 이미 db helper 를 쓴다면 그거 그대로 사용.)

- [ ] **Step 5: Implement RunAnnotationRepository**

Create `apps/agent-api/src/repositories/RunAnnotationRepository.ts`:

```typescript
import { eq } from "drizzle-orm";
import type { AgentRuntimeDb } from "@tooldi/agent-persistence";
import { runAnnotations } from "@tooldi/agent-persistence";
import type { RunAnnotation, AnnotationUpsertBody } from "@tooldi/agent-contracts";

export class AnnotationConflictError extends Error {
  constructor(public readonly current: RunAnnotation) {
    super("annotation_version_conflict");
    this.name = "AnnotationConflictError";
  }
}

export class RunAnnotationRepository {
  constructor(private db: AgentRuntimeDb) {}

  async findByRunId(runId: string): Promise<RunAnnotation | null> {
    const rows = await this.db
      .select()
      .from(runAnnotations)
      .where(eq(runAnnotations.runId, runId))
      .limit(1);
    if (rows.length === 0) return null;
    return this.toContract(rows[0]);
  }

  // ← Codex finding 5: If-Match optimistic concurrency
  // ifMatchUpdatedAt 가 지정됐으면 현재 row 의 updatedAt 과 일치할 때만 update.
  // mismatch → AnnotationConflictError(현재 row) throw → route 에서 409 응답.
  async upsert(
    runId: string,
    patch: AnnotationUpsertBody,
    updatedBy: string,
  ): Promise<RunAnnotation> {
    const existing = await this.findByRunId(runId);
    if (patch.ifMatchUpdatedAt !== undefined) {
      const expected = patch.ifMatchUpdatedAt;
      if (existing === null && expected !== null) {
        throw new AnnotationConflictError({
          runId, starred: false, tags: [], note: "", updatedBy: "", updatedAt: "",
        });
      }
      if (existing !== null && expected !== existing.updatedAt) {
        throw new AnnotationConflictError(existing);
      }
    }

    const insertValues = {
      runId,
      starred: patch.starred ?? false,
      tags: patch.tags ?? [],
      note: patch.note ?? "",
      updatedBy,
    };
    const updateSet: Record<string, unknown> = { updatedBy, updatedAt: new Date() };
    if (patch.starred !== undefined) updateSet.starred = patch.starred;
    if (patch.tags !== undefined) updateSet.tags = patch.tags;
    if (patch.note !== undefined) updateSet.note = patch.note;

    const [row] = await this.db
      .insert(runAnnotations)
      .values(insertValues)
      .onConflictDoUpdate({ target: runAnnotations.runId, set: updateSet })
      .returning();
    return this.toContract(row);
  }

  private toContract(row: typeof runAnnotations.$inferSelect): RunAnnotation {
    return {
      runId: row.runId,
      starred: row.starred,
      tags: row.tags,
      note: row.note,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
```

- [ ] **Step 6: Run repo test**

```bash
pnpm --filter @tooldi/agent-api test --test-name-pattern RunAnnotationRepository
```

Expected: 2 PASS.

- [ ] **Step 7: TDD — AdminRunRepository.list test (cursor + filter)**

Create `apps/agent-api/src/repositories/AdminRunRepository.test.ts`:

```typescript
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createTestDb } from "@tooldi/agent-testkit";
import { AdminRunRepository } from "./AdminRunRepository.js";

describe("AdminRunRepository.list", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  before(async () => {
    ctx = await createTestDb();
    await ctx.seedRun("r1", { status: "succeeded", createdAt: new Date("2026-05-08T10:00:00Z") });
    await ctx.seedRun("r2", { status: "failed",    createdAt: new Date("2026-05-08T10:01:00Z") });
    await ctx.seedRun("r3", { status: "succeeded", createdAt: new Date("2026-05-08T10:02:00Z") });
    await ctx.seedAnnotation("r1", { starred: true, tags: ["RAG-이상"] });
  });
  after(async () => { await ctx.close(); });

  it("기본 정렬 — 최신 createdAt DESC", async () => {
    const repo = new AdminRunRepository(ctx.db);
    const out = await repo.list({ limit: 50 });
    assert.deepEqual(out.runs.map((r) => r.runId), ["r3", "r2", "r1"]);
    assert.equal(out.hasMore, false);
  });

  it("starred=true 필터", async () => {
    const repo = new AdminRunRepository(ctx.db);
    const out = await repo.list({ limit: 50, starred: true });
    assert.deepEqual(out.runs.map((r) => r.runId), ["r1"]);
  });

  it("tag 필터", async () => {
    const repo = new AdminRunRepository(ctx.db);
    const out = await repo.list({ limit: 50, tag: "RAG-이상" });
    assert.deepEqual(out.runs.map((r) => r.runId), ["r1"]);
  });

  it("cursor — before 이후만 반환", async () => {
    const repo = new AdminRunRepository(ctx.db);
    const out = await repo.list({ limit: 50, before: "2026-05-08T10:01:30Z" });
    assert.deepEqual(out.runs.map((r) => r.runId), ["r2", "r1"]);
  });
});
```

- [ ] **Step 8: Implement AdminRunRepository**

Create `apps/agent-api/src/repositories/AdminRunRepository.ts`:

```typescript
import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { AgentRuntimeDb } from "@tooldi/agent-persistence";
import {
  runs,
  runAttempts,
  runAnnotations,
} from "@tooldi/agent-persistence";
import type {
  AdminRunSummary,
  AdminRunsListResponse,
  AdminRunDetail,
} from "@tooldi/agent-contracts";

export interface ListParams {
  limit: number;
  status?: string;
  before?: string;
  starred?: boolean;
  tag?: string;
}

export class AdminRunRepository {
  constructor(
    private db: AgentRuntimeDb,
    private artifactDiscovery: AdminArtifactDiscoveryService,   // ← Codex finding 2 위임
  ) {}

  async list(p: ListParams): Promise<AdminRunsListResponse> {
    const limit = Math.max(1, Math.min(100, p.limit));
    const conditions = [];
    if (p.status) conditions.push(eq(runs.status, p.status));
    if (p.before) conditions.push(lt(runs.createdAt, new Date(p.before)));
    if (p.starred === true) conditions.push(eq(runAnnotations.starred, true));
    if (p.tag) conditions.push(sql`${p.tag} = ANY(${runAnnotations.tags})`);

    const rows = await this.db
      .select({
        runId: runs.id,
        status: runs.status,
        createdAt: runs.createdAt,
        userPrompt: runs.userPrompt,                // adjust to actual prompt column
        attempts: sql<number>`COALESCE(MAX(${runAttempts.attemptSeq}) + 1, 0)`.as("attempts"),
        starred: runAnnotations.starred,
        tags: runAnnotations.tags,
        note: runAnnotations.note,
      })
      .from(runs)
      .leftJoin(runAttempts, eq(runAttempts.runId, runs.id))
      .leftJoin(runAnnotations, eq(runAnnotations.runId, runs.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(runs.id, runAnnotations.starred, runAnnotations.tags, runAnnotations.note)
      .orderBy(desc(runs.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const summaries: AdminRunSummary[] = sliced.map((r) => ({
      runId: r.runId,
      status: r.status as AdminRunSummary["status"],
      createdAt: r.createdAt.toISOString(),
      attempts: Number(r.attempts ?? 0),
      promptPreview: (r.userPrompt ?? "").slice(0, 120),
      starred: r.starred ?? false,
      tags: r.tags ?? [],
      notePreview: (r.note ?? "").slice(0, 80),
    }));
    const nextBefore = hasMore ? summaries[summaries.length - 1].createdAt : null;
    return { runs: summaries, hasMore, nextBefore };
  }

  async getDetail(runId: string): Promise<AdminRunDetail | null> {
    const list = await this.list({ limit: 1, before: undefined });
    // 실제 구현은 single-row WHERE id=... — 위 list 헬퍼 재활용 X.
    // 자세한 SELECT 는 Step 9 에서.
    throw new Error("implemented in Step 9");
  }

  // tag meta — 5분 메모리 캐시는 route 단에서.
  async distinctTags(): Promise<string[]> {
    const rows = await this.db.execute(sql<{ tag: string }>`
      SELECT DISTINCT unnest(tags) AS tag
      FROM agent_admin.run_annotations
      WHERE array_length(tags, 1) > 0
      ORDER BY tag ASC
    `);
    return rows.rows.map((r: { tag: string }) => r.tag);
  }
}
```

> **주의:** `runs.userPrompt` 컬럼 이름은 실제 schema 확인 필요. `packages/persistence/src/schema/runtime.ts` 의 `runs` 정의에서 prompt 저장 컬럼을 grep 으로 확인 후 정정. status enum 도 동일.

- [ ] **Step 9: AdminRunRepository.getDetail 구현 + 테스트**

Add to `AdminRunRepository.ts`:

```typescript
async getDetail(runId: string): Promise<AdminRunDetail | null> {
  const runRows = await this.db
    .select()
    .from(runs)
    .leftJoin(runAnnotations, eq(runAnnotations.runId, runs.id))
    .where(eq(runs.id, runId))
    .limit(1);
  if (runRows.length === 0) return null;
  const { runs: r, run_annotations: ann } = runRows[0];

  const attemptRows = await this.db
    .select()
    .from(runAttempts)
    .where(eq(runAttempts.runId, runId))
    .orderBy(runAttempts.attemptSeq);

  const phaseRows = await this.db.execute(sql<{
    phase: string; status: string; started_at: Date | null; finished_at: Date | null;
  }>`
    SELECT phase, status, MIN(started_at) AS started_at, MAX(finished_at) AS finished_at
    FROM agent_runtime.run_events
    WHERE run_id = ${runId}
    GROUP BY phase, status
    ORDER BY MIN(started_at) NULLS LAST
  `);

  // artifactRefs: 별 service 에 위임 — object-store 에서 prefix list, exists 검증.
  // (knownArtifactKeys 하드코딩 X — Codex finding 2)
  const artifactRefs = await this.artifactDiscovery.listForRun(runId, attemptRows.map((a) => a.attemptSeq));

  return {
    run: { /* same shape as list summary */ runId: r.id, status: r.status as never, createdAt: r.createdAt.toISOString(), attempts: attemptRows.length, promptPreview: (r.userPrompt ?? "").slice(0, 120), starred: ann?.starred ?? false, tags: ann?.tags ?? [], notePreview: (ann?.note ?? "").slice(0, 80) },
    attempts: attemptRows.map((a) => ({ attemptSeq: a.attemptSeq, status: a.status, startedAt: a.startedAt.toISOString(), finishedAt: a.finishedAt?.toISOString() ?? null })),
    phases: phaseRows.rows.map((p) => ({ phase: p.phase, status: p.status as never, startedAt: p.started_at?.toISOString() ?? null, finishedAt: p.finished_at?.toISOString() ?? null })),
    annotation: ann ? { runId: ann.runId, starred: ann.starred, tags: ann.tags, note: ann.note, updatedBy: ann.updatedBy, updatedAt: ann.updatedAt.toISOString() } : null,
    artifactRefs,
  };
}

// knownArtifactKeys 메서드는 삭제 — AdminArtifactDiscoveryService 가 책임.
```

> 실제 DB 컬럼 케이스(camel/snake) 와 phase aggregation SQL 은 schema 확인 후 미세 조정.

- [ ] **Step 8b: AdminArtifactDiscoveryService — object-store prefix list (Codex finding 2)**

Create `apps/agent-api/src/services/AdminArtifactDiscoveryService.ts`:

```typescript
import path from "node:path";
import {
  AdminArtifactKindValues,
  AdminArtifactFilenameByKind,
  type AdminArtifactKind,
  type ArtifactRef,
} from "@tooldi/agent-contracts";
import type { ObjectStoreClient } from "@tooldi/agent-domain";

const FILENAME_TO_KIND = (() => {
  const map = new Map<string, AdminArtifactKind>();
  for (const kind of AdminArtifactKindValues) map.set(AdminArtifactFilenameByKind[kind], kind);
  return map;
})();

// per-attempt 변종 (e.g., v6-render-quality-report-attempt-3.json) — prefix 매칭
const PER_ATTEMPT_PREFIX_TO_KIND: Array<[RegExp, AdminArtifactKind]> = [
  [/^v6-render-quality-report-attempt-\d+\.json$/, "v6-render-quality-report"],
  [/^v6-render-quality-failure-attempt-\d+\.json$/, "v6-render-quality-failure"],
];

export class AdminArtifactDiscoveryService {
  constructor(private objectStore: ObjectStoreClient) {}

  async listForRun(runId: string, attempts: number[]): Promise<ArtifactRef[]> {
    const refs: ArtifactRef[] = [];
    for (const seq of attempts) {
      const prefix = `runs/${runId}/attempts/${seq}/`;
      const objects = await this.objectStore.listObjects({ prefix });
      for (const obj of objects) {
        const filename = path.basename(obj.key);
        const kind = this.classify(filename);
        if (!kind) continue; // unknown — admin 이 표시 안 함
        refs.push({ kind, key: obj.key, attemptSeq: seq, exists: true });
      }
    }
    return refs;
  }

  private classify(filename: string): AdminArtifactKind | null {
    const direct = FILENAME_TO_KIND.get(filename);
    if (direct) return direct;
    for (const [re, kind] of PER_ATTEMPT_PREFIX_TO_KIND) {
      if (re.test(filename)) return kind;
    }
    return null;
  }
}
```

> **확인 필요:** `ObjectStoreClient.listObjects({ prefix })` 가 실제 존재하는지 grep — 없으면 S3 SDK `ListObjectsV2Command` 직접 호출 또는 client 인터페이스 확장. (없을 가능성 적지 않음 — `apps/agent-worker/src/graph/graphTasks.ts` 의 `objectStore.putObject` 와 같은 client 확인.)

- [ ] **Step 8c: TDD — discovery service 가 실제 emit 키를 모두 분류**

Create `apps/agent-api/src/services/AdminArtifactDiscoveryService.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AdminArtifactDiscoveryService } from "./AdminArtifactDiscoveryService.js";

class FakeObjectStore {
  constructor(public keys: string[]) {}
  async listObjects({ prefix }: { prefix: string }) {
    return this.keys.filter((k) => k.startsWith(prefix)).map((key) => ({ key }));
  }
}

describe("AdminArtifactDiscoveryService", () => {
  it("실제 emit 파일명들을 정확한 kind 로 분류", async () => {
    const fake = new FakeObjectStore([
      "runs/r1/attempts/0/canonical-design-brief.json",
      "runs/r1/attempts/0/v6-trend-brief.json",
      "runs/r1/attempts/0/debug-v6-html.json",
      "runs/r1/attempts/0/v6-render-quality-report.json",
      "runs/r1/attempts/0/v6-render-quality-report-attempt-2.json",
      "runs/r1/attempts/0/executable-plan.json",
      "runs/r1/attempts/0/v6-asset-resolution.json",
      "runs/r1/attempts/0/v6-asset-generated.json",
      "runs/r1/attempts/0/random-unknown.json",   // 분류 안 됨
    ]);
    const svc = new AdminArtifactDiscoveryService(fake as never);
    const refs = await svc.listForRun("r1", [0]);
    const kinds = refs.map((r) => r.kind).sort();
    assert.deepEqual(kinds, [
      "canonical-design-brief",
      "debug-v6-html-preview",
      "executable-plan",
      "v6-asset-generated",
      "v6-asset-resolution",
      "v6-render-quality-report",
      "v6-render-quality-report",
      "v6-trend-brief",
    ]);
  });
});
```

- [ ] **Step 10: Route — list endpoint**

Create `apps/agent-api/src/routes/internal/admin-runs-list.get.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";
import { Type } from "@sinclair/typebox";
import { AdminRunsListResponseSchema } from "@tooldi/agent-contracts";
import { AdminRunRepository } from "../../repositories/AdminRunRepository.js";

const QuerySchema = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  status: Type.Optional(Type.String()),
  before: Type.Optional(Type.String({ format: "date-time" })),
  starred: Type.Optional(Type.Boolean()),
  tag: Type.Optional(Type.String()),
});

export const adminRunsListRoute: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/admin/runs",
    { schema: { querystring: QuerySchema, response: { 200: AdminRunsListResponseSchema } } },
    async (request) => {
      const repo = new AdminRunRepository(app.db.db, new AdminArtifactDiscoveryService(app.objectStore));
      // route 별 import: import { AdminArtifactDiscoveryService } from "../../services/AdminArtifactDiscoveryService.js"
      const q = request.query as { limit?: number; status?: string; before?: string; starred?: boolean; tag?: string };
      return repo.list({
        limit: q.limit ?? 50,
        status: q.status,
        before: q.before,
        starred: q.starred,
        tag: q.tag,
      });
    },
  );
};
```

- [ ] **Step 11: Route — detail endpoint**

Create `apps/agent-api/src/routes/internal/admin-run-detail.get.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";
import { Type } from "@sinclair/typebox";
import { AdminRunDetailSchema } from "@tooldi/agent-contracts";
import { AdminRunRepository } from "../../repositories/AdminRunRepository.js";

const ParamsSchema = Type.Object({ runId: Type.String({ minLength: 1 }) });

export const adminRunDetailRoute: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/admin/runs/:runId",
    { schema: { params: ParamsSchema, response: { 200: AdminRunDetailSchema } } },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const repo = new AdminRunRepository(app.db.db, new AdminArtifactDiscoveryService(app.objectStore));
      // route 별 import: import { AdminArtifactDiscoveryService } from "../../services/AdminArtifactDiscoveryService.js"
      const detail = await repo.getDetail(runId);
      if (!detail) return reply.code(404).send({ error: "not_found" });
      return detail;
    },
  );
};
```

- [ ] **Step 12: Route — annotation upsert endpoint**

Create `apps/agent-api/src/routes/internal/admin-annotation-upsert.post.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";
import { Type } from "@sinclair/typebox";
import { AnnotationUpsertBodySchema, RunAnnotationSchema } from "@tooldi/agent-contracts";
import {
  AnnotationConflictError,
  RunAnnotationRepository,
} from "../../repositories/RunAnnotationRepository.js";

const ParamsSchema = Type.Object({ runId: Type.String({ minLength: 1 }) });
const ConflictResponseSchema = Type.Object({
  error: Type.Literal("annotation_version_conflict"),
  current: RunAnnotationSchema,
});

export const adminAnnotationUpsertRoute: FastifyPluginAsync = async (app) => {
  app.post(
    "/api/admin/runs/:runId/annotations",
    {
      schema: {
        params: ParamsSchema,
        body: AnnotationUpsertBodySchema,
        response: {
          200: Type.Object({ annotation: RunAnnotationSchema }),
          409: ConflictResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const repo = new RunAnnotationRepository(app.db.db);
      try {
        const annotation = await repo.upsert(runId, request.body as never, "local");
        return { annotation };
      } catch (err) {
        if (err instanceof AnnotationConflictError) {
          return reply.code(409).send({ error: "annotation_version_conflict", current: err.current });
        }
        throw err;
      }
    },
  );
};
```

- [ ] **Step 13: Route — tags meta (5분 캐시)**

Create `apps/agent-api/src/routes/internal/admin-tags-meta.get.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";
import { Type } from "@sinclair/typebox";
import { AdminRunRepository } from "../../repositories/AdminRunRepository.js";

const TTL_MS = 5 * 60 * 1000;

export const adminTagsMetaRoute: FastifyPluginAsync = async (app) => {
  let cache: { tags: string[]; at: number } | null = null;

  app.get(
    "/api/admin/runs/_meta/tags",
    { schema: { response: { 200: Type.Object({ tags: Type.Array(Type.String()) }) } } },
    async () => {
      if (cache && Date.now() - cache.at < TTL_MS) return { tags: cache.tags };
      const tags = await new AdminRunRepository(app.db.db, new AdminArtifactDiscoveryService(app.objectStore)).distinctTags();
      cache = { tags, at: Date.now() };
      return { tags };
    },
  );
};
```

- [ ] **Step 14: Register routes + guard in app.ts**

Modify `apps/agent-api/src/app.ts` — find the existing block where other routes are `app.register`'d and append:

```typescript
import { adminGuard } from "./lib/adminGuard.js";
import { adminRunsListRoute } from "./routes/internal/admin-runs-list.get.js";
import { adminRunDetailRoute } from "./routes/internal/admin-run-detail.get.js";
import { adminAnnotationUpsertRoute } from "./routes/internal/admin-annotation-upsert.post.js";
import { adminTagsMetaRoute } from "./routes/internal/admin-tags-meta.get.js";

// ... existing body
app.addHook("onRequest", adminGuard);
await app.register(adminRunsListRoute);
await app.register(adminRunDetailRoute);
await app.register(adminAnnotationUpsertRoute);
await app.register(adminTagsMetaRoute);
```

- [ ] **Step 15: TDD — list endpoint test**

Create `apps/agent-api/src/routes/internal/admin-runs-list.get.test.ts`:

```typescript
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp } from "../../testHelpers.js";

describe("GET /api/admin/runs", () => {
  let ctx: Awaited<ReturnType<typeof buildTestApp>>;
  before(async () => {
    ctx = await buildTestApp({ NODE_ENV: "development" });
    await ctx.seedRun("r1");
    await ctx.seedRun("r2");
  });
  after(async () => ctx.close());

  it("기본 limit=50 + 최신순 반환", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/admin/runs" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.runs.length, 2);
    assert.equal(body.hasMore, false);
  });

  it("NODE_ENV=production 일 때 404", async () => {
    const ctx2 = await buildTestApp({ NODE_ENV: "production" });
    const res = await ctx2.app.inject({ method: "GET", url: "/api/admin/runs" });
    assert.equal(res.statusCode, 404);
    await ctx2.close();
  });
});
```

> `testHelpers.ts`/`buildTestApp` 가 없으면 기존 agent-api 테스트가 fastify 띄우는 방식 mirror. 첫 사용 시 helper 만들기.

- [ ] **Step 16: Run all agent-api tests**

```bash
pnpm --filter @tooldi/agent-api typecheck
pnpm --filter @tooldi/agent-api test
```

Expected: 신규 + 기존 모두 PASS.

- [ ] **Step 17: Manual smoke (curl)**

```bash
NODE_ENV=development pnpm --filter @tooldi/agent-api dev &
sleep 3
curl -s http://localhost:3000/api/admin/runs?limit=5 | jq .
curl -s http://localhost:3000/api/admin/runs/_meta/tags | jq .
```

Expected: 200 응답, runs 배열 (DB 비어 있으면 빈 배열).

- [ ] **Step 18: Commit**

```bash
git add apps/agent-api
git commit -m "[feat] admin endpoints — list/detail/annotation/tags-meta + adminGuard"
```

---

## Task 3: 리스트 화면 — 5s polling (Day 3 of Week 1)

**1 PR — 사용자가 첫 화면을 본다.**

**Files:**
- Create: `apps/agent-admin/src/lib/adminApi.ts`
- Modify: `apps/agent-admin/src/app/admin/runs/page.tsx`
- Create: `apps/agent-admin/src/components/RunsList.tsx`
- Create: `apps/agent-admin/src/components/StatusBadge.tsx`
- Test: smoke render via `next build` (단위 테스트는 task 9 의 annotation 흐름까지 묶어 한 번에)

- [ ] **Step 1: adminApi server-side fetch wrapper**

Create `apps/agent-admin/src/lib/adminApi.ts`:

```typescript
import type { AdminRunsListResponse, AdminRunDetail, RunAnnotation } from "@tooldi/agent-contracts";

const baseUrl = process.env.AGENT_API_INTERNAL_URL ?? "http://localhost:3000";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, { ...init, cache: "no-store" });
  if (!res.ok) throw new Error(`admin api ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const adminApi = {
  listRuns: (q: { limit?: number; before?: string; starred?: boolean; tag?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (q.limit) params.set("limit", String(q.limit));
    if (q.before) params.set("before", q.before);
    if (q.starred !== undefined) params.set("starred", String(q.starred));
    if (q.tag) params.set("tag", q.tag);
    if (q.status) params.set("status", q.status);
    return fetchJson<AdminRunsListResponse>(`/api/admin/runs?${params}`);
  },
  getRun: (runId: string) => fetchJson<AdminRunDetail>(`/api/admin/runs/${runId}`),
  upsertAnnotation: (runId: string, body: { starred?: boolean; tags?: string[]; note?: string }) =>
    fetchJson<{ annotation: RunAnnotation }>(`/api/admin/runs/${runId}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  getTagsMeta: () => fetchJson<{ tags: string[] }>(`/api/admin/runs/_meta/tags`),
};
```

- [ ] **Step 2: StatusBadge component**

Create `apps/agent-admin/src/components/StatusBadge.tsx`:

```tsx
const colors: Record<string, string> = {
  queued:    "bg-zinc-200 text-zinc-700",
  running:   "bg-blue-100 text-blue-700",
  succeeded: "bg-emerald-100 text-emerald-700",
  failed:    "bg-rose-100 text-rose-700",
  cancelled: "bg-amber-100 text-amber-700",
};
export function StatusBadge({ status }: { status: string }) {
  return <span className={`px-2 py-0.5 rounded text-xs font-mono ${colors[status] ?? "bg-zinc-100"}`}>{status}</span>;
}
```

- [ ] **Step 3: RunsList client component (5s polling, tab-hidden stop)**

Create `apps/agent-admin/src/components/RunsList.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AdminRunsListResponse, AdminRunSummary } from "@tooldi/agent-contracts";
import { StatusBadge } from "./StatusBadge.js";

interface Props {
  initial: AdminRunsListResponse;
  filters: { starred?: boolean; tag?: string; status?: string };
}

export function RunsList({ initial, filters }: Props) {
  const [data, setData] = useState(initial);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (document.hidden) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (filters.starred !== undefined) params.set("starred", String(filters.starred));
      if (filters.tag) params.set("tag", filters.tag);
      if (filters.status) params.set("status", filters.status);
      try {
        const res = await fetch(`/api/proxy/admin/runs?${params}`, { signal: ctrl.signal });
        if (!cancelled && res.ok) setData(await res.json());
      } catch { /* abort or net error → 다음 tick 에 재시도 */ }
    }
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); abortRef.current?.abort(); };
  }, [filters.starred, filters.tag, filters.status]);

  return (
    <ul className="divide-y divide-zinc-200">
      {data.runs.map((r: AdminRunSummary) => (
        <li key={r.runId} className="py-2 flex items-center gap-3 text-sm">
          {r.starred ? <span title="starred">⭐</span> : <span className="w-4" />}
          <span className="font-mono text-xs text-zinc-500">{r.createdAt.slice(11, 16)}</span>
          <Link href={`/admin/runs/${r.runId}`} className="font-mono text-xs hover:underline">{r.runId.slice(0, 12)}</Link>
          <StatusBadge status={r.status} />
          <span className="text-xs text-zinc-500">{r.attempts}att</span>
          <span className="truncate max-w-md">{r.promptPreview}</span>
          {r.tags.map((t) => <span key={t} className="px-1.5 py-0.5 bg-zinc-100 rounded text-xs">{t}</span>)}
        </li>
      ))}
    </ul>
  );
}
```

> **참고:** 위 코드는 client 단에서 next.js 의 `/api/proxy/admin/runs` 를 호출. 같은-도메인 fetch 로 동작하려면 server-side proxy 필요. Step 4 에서 추가.

- [ ] **Step 4: API proxy route handler**

Create `apps/agent-admin/src/app/api/proxy/admin/runs/route.ts`:

```typescript
import type { NextRequest } from "next/server";

const upstream = process.env.AGENT_API_INTERNAL_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest) {
  const search = req.nextUrl.search;
  const res = await fetch(`${upstream}/api/admin/runs${search}`, { cache: "no-store" });
  const body = await res.text();
  return new Response(body, { status: res.status, headers: { "Content-Type": "application/json" } });
}
```

> 같은 패턴으로 추후 detail / annotations / tags meta proxy 도 추가 (task 4 / 9).

- [ ] **Step 5: page.tsx — server component 가 initial 데이터 가져옴**

Modify `apps/agent-admin/src/app/admin/runs/page.tsx`:

```tsx
import { adminApi } from "@/lib/adminApi.js";
import { RunsList } from "@/components/RunsList.js";

interface Props { searchParams: { starred?: string; tag?: string; status?: string }; }

export default async function RunsPage({ searchParams }: Props) {
  const filters = {
    starred: searchParams.starred === "true" ? true : undefined,
    tag: searchParams.tag,
    status: searchParams.status,
  };
  const initial = await adminApi.listRuns({ limit: 50, ...filters });
  return (
    <main className="p-6 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">AGW Runs</h1>
        <span className="text-xs text-zinc-500">5s 자동 갱신</span>
      </header>
      <RunsList initial={initial} filters={filters} />
    </main>
  );
}
```

- [ ] **Step 6: Manual smoke**

```bash
# Terminal A
NODE_ENV=development pnpm --filter @tooldi/agent-api dev
# Terminal B
pnpm --filter @tooldi/agent-admin dev
# 브라우저: http://localhost:3200/admin/runs
```

Expected: 화면이 뜨고, DB 에 run 이 있으면 리스트에 표시. 5초마다 네트워크 요청이 발생.

- [ ] **Step 7: build smoke**

```bash
pnpm --filter @tooldi/agent-admin build
```

Expected: SUCCESS (dynamic route + RSC 정상).

- [ ] **Step 8: Commit**

```bash
git add apps/agent-admin
git commit -m "[feat] admin runs 리스트 — 5s polling + StatusBadge"
```

---

## Task 4: 상세 skeleton — §A user input + §B phase timeline (Day 4 of Week 1)

**1 PR — 클릭하면 상세가 뜨고 핵심 메타데이터가 보임. SSE 와 §C~§I 는 별 task.**

**Files:**
- Create: `apps/agent-admin/src/app/admin/runs/[runId]/page.tsx`
- Create: `apps/agent-admin/src/components/RunDetailHeader.tsx`
- Create: `apps/agent-admin/src/components/sections/SectionUserInput.tsx`
- Create: `apps/agent-admin/src/components/sections/SectionPhaseTimeline.tsx`
- Create: `apps/agent-admin/src/app/api/proxy/admin/runs/[runId]/route.ts` (proxy)

- [ ] **Step 1: Detail proxy route handler**

Create `apps/agent-admin/src/app/api/proxy/admin/runs/[runId]/route.ts`:

```typescript
import type { NextRequest } from "next/server";

const upstream = process.env.AGENT_API_INTERNAL_URL ?? "http://localhost:3000";

export async function GET(_: NextRequest, { params }: { params: { runId: string } }) {
  const res = await fetch(`${upstream}/api/admin/runs/${params.runId}`, { cache: "no-store" });
  const body = await res.text();
  return new Response(body, { status: res.status, headers: { "Content-Type": "application/json" } });
}
```

- [ ] **Step 2: SectionUserInput**

Create `apps/agent-admin/src/components/sections/SectionUserInput.tsx`:

```tsx
import type { AdminRunDetail } from "@tooldi/agent-contracts";

export function SectionUserInput({ run }: { run: AdminRunDetail["run"] }) {
  return (
    <section id="A" className="mb-8">
      <h2 className="text-base font-semibold mb-2">§A User Input</h2>
      <pre className="bg-white border border-zinc-200 rounded p-3 text-xs whitespace-pre-wrap">
        {run.promptPreview /* TODO: full prompt → detail 응답에 추가 필요 시 contract 보강 */}
      </pre>
    </section>
  );
}
```

> **노트:** 현재 `AdminRunDetail.run` 은 summary 와 동일 — full prompt 가 필요하면 detail contract 에 `userPromptFull` 추가하는 보강이 필요. Self-review 에서 잡힘 (아래 §보강 참조).

- [ ] **Step 3: Contract 보강 — detail 에 fullPrompt + canvasMeta**

Modify `packages/contracts/src/admin/run-detail.ts` — `AdminRunDetailSchema` 에 추가:

```typescript
export const AdminRunDetailSchema = Type.Object({
  run: AdminRunSummarySchema,
  userPromptFull: Type.String(),
  canvasMeta: Type.Object({ width: Type.Integer(), height: Type.Integer() }),
  userSerial: Type.Optional(Type.Integer()),
  attempts: Type.Array(AttemptSummarySchema),
  phases: Type.Array(PhaseSummarySchema),
  annotation: Type.Union([RunAnnotationSchema, Type.Null()]),
  artifactRefs: Type.Array(ArtifactRefSchema),
});
```

Modify `AdminRunRepository.getDetail` — return values 에 `userPromptFull: r.userPrompt ?? ""`, `canvasMeta: { width: r.canvasWidth ?? 0, height: r.canvasHeight ?? 0 }`, `userSerial: r.userSerial ?? undefined` 추가. (실제 컬럼명은 schema 확인 후 정정.)

- [ ] **Step 4: SectionPhaseTimeline**

Create `apps/agent-admin/src/components/sections/SectionPhaseTimeline.tsx`:

```tsx
import type { PhaseSummary } from "@tooldi/agent-contracts";

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-zinc-200",
  running: "bg-blue-300 animate-pulse",
  ok:      "bg-emerald-400",
  fail:    "bg-rose-500",
};

export function SectionPhaseTimeline({ phases }: { phases: PhaseSummary[] }) {
  return (
    <section id="B" className="mb-8">
      <h2 className="text-base font-semibold mb-2">§B Phase Timeline</h2>
      <ol className="flex flex-wrap gap-2">
        {phases.map((p, i) => (
          <li key={`${p.phase}-${i}`} className="flex items-center gap-1 text-xs">
            <span className={`w-2 h-2 rounded-full ${STATUS_COLOR[p.status]}`} />
            <a href={`#phase-${p.phase}`} className="hover:underline">{p.phase}</a>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 5: RunDetailHeader (sticky)**

Create `apps/agent-admin/src/components/RunDetailHeader.tsx`:

```tsx
import type { AdminRunDetail } from "@tooldi/agent-contracts";
import { StatusBadge } from "./StatusBadge.js";

export function RunDetailHeader({ detail }: { detail: AdminRunDetail }) {
  return (
    <header className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-4 py-3 flex items-center gap-3">
      {detail.run.starred && <span>⭐</span>}
      <span className="font-mono text-sm">{detail.run.runId}</span>
      <StatusBadge status={detail.run.status} />
      <span className="text-xs text-zinc-500">{detail.attempts.length} attempts</span>
      {/* tag/note/star 인터랙션은 task 9 에서 추가 */}
    </header>
  );
}
```

- [ ] **Step 6: page.tsx**

Create `apps/agent-admin/src/app/admin/runs/[runId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { adminApi } from "@/lib/adminApi.js";
import { RunDetailHeader } from "@/components/RunDetailHeader.js";
import { SectionUserInput } from "@/components/sections/SectionUserInput.js";
import { SectionPhaseTimeline } from "@/components/sections/SectionPhaseTimeline.js";

export default async function RunDetailPage({ params }: { params: { runId: string } }) {
  let detail;
  try { detail = await adminApi.getRun(params.runId); } catch { notFound(); }
  return (
    <div>
      <RunDetailHeader detail={detail} />
      <main className="p-6 max-w-5xl mx-auto">
        <SectionUserInput run={detail.run} />
        <SectionPhaseTimeline phases={detail.phases} />
        <p className="text-xs text-zinc-400">§C~§I 는 다음 task 에서 추가됩니다.</p>
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Manual smoke**

리스트에서 한 row 클릭 → 상세 페이지 뜸. Phase chip 클릭하면 (다음 task 의 anchor) 그쪽으로 스크롤.

- [ ] **Step 8: build + commit**

```bash
pnpm --filter @tooldi/agent-admin build
git add apps/agent-admin packages/contracts apps/agent-api
git commit -m "[feat] admin run 상세 skeleton — §A 유저 입력 + §B 페이즈 타임라인"
```

---

## Task 5: SSE 라이브 + §I raw events log (Day 5 of Week 1)

**1 PR — active run 일 때 이벤트가 흘러 들어오고, terminal 일 때 stale snapshot.**

**Files:**
- Create: `apps/agent-admin/src/app/api/proxy/sse/runs/[runId]/events/route.ts` (Edge runtime SSE proxy)
- Create: `apps/agent-admin/src/components/RunDetailLive.tsx`
- Create: `apps/agent-admin/src/components/sections/SectionRawEvents.tsx`
- Modify: `apps/agent-admin/src/app/admin/runs/[runId]/page.tsx` — RunDetailLive wrap

- [ ] **Step 1: SSE proxy route — Last-Event-ID forward (Codex finding 3)**

Create `apps/agent-admin/src/app/api/proxy/sse/runs/[runId]/events/route.ts`:

```typescript
import type { NextRequest } from "next/server";

const upstream = process.env.AGENT_API_INTERNAL_URL ?? "http://localhost:3000";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { runId: string } }) {
  // 브라우저 EventSource 가 자동으로 Last-Event-ID 를 보냄 — 반드시 upstream 에 forward.
  // 또한 query 의 afterEventId 도 패스스루 (수동 재연결 케이스).
  const headers: Record<string, string> = {};
  const lastEventId = req.headers.get("last-event-id");
  if (lastEventId) headers["Last-Event-ID"] = lastEventId;

  const search = req.nextUrl.search; // afterEventId 등 패스스루
  const upstreamRes = await fetch(
    `${upstream}/api/agent-workflow/runs/${params.runId}/events${search}`,
    { signal: req.signal, headers },
  );
  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [ ] **Step 2: SectionRawEvents**

Create `apps/agent-admin/src/components/sections/SectionRawEvents.tsx`:

```tsx
"use client";
import { useState } from "react";

export interface RunEvent { id: string; phase: string; type: string; at: string; data: unknown; }

export function SectionRawEvents({ events }: { events: RunEvent[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section id="I" className="mb-8">
      <button className="text-sm font-semibold" onClick={() => setOpen((v) => !v)}>
        §I Raw Events ({events.length}) {open ? "▾" : "▸"}
      </button>
      {open && (
        <ol className="mt-2 max-h-96 overflow-auto bg-white border border-zinc-200 rounded p-2 text-xs font-mono">
          {events.map((e) => (
            <li key={e.id} className="py-0.5">
              <span className="text-zinc-400">{e.at.slice(11, 19)}</span>{" "}
              <span className="text-blue-600">{e.phase}</span>{" "}
              <span>{e.type}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
```

- [ ] **Step 3: RunDetailLive — SSE subscribe + 자동 재연결 (Codex finding 3)**

Create `apps/agent-admin/src/components/RunDetailLive.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import {
  TerminalRunStatusValues,
  type AdminRunDetail,
  type RunStatus,
} from "@tooldi/agent-contracts";
import { SectionRawEvents, type RunEvent } from "./sections/SectionRawEvents.js";

const TERMINAL_STATUSES = new Set<string>(TerminalRunStatusValues);  // 4값 재사용

export function RunDetailLive({ initial }: { initial: AdminRunDetail }) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [status, setStatus] = useState<RunStatus>(initial.run.status);

  useEffect(() => {
    if (TERMINAL_STATUSES.has(status)) return;
    // 브라우저 EventSource 는 connection drop 시 자동으로 재연결하면서 마지막 받은 event id 를
    // Last-Event-ID 헤더로 보냄. 서버는 이미 listAfter(runId, lastEventId) replay 지원.
    // → onerror 에서 close() 호출하면 그 자동 재연결 동작이 망가짐. 절대 close 하지 말 것.
    const es = new EventSource(`/api/proxy/sse/runs/${initial.run.runId}/events`);
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as RunEvent;
        setEvents((prev) => {
          if (prev.find((p) => p.id === evt.id)) return prev;       // dedupe (replay 시)
          return [evt, ...prev].slice(0, 500);
        });
        // 서버 status 이벤트 (타입 명은 contracts 의 PublicRunEvent enum 확인 후 정정).
        if (evt.type === "run.statusChanged" && TERMINAL_STATUSES.has(evt.data?.status)) {
          setStatus(evt.data.status);
        }
      } catch { /* heartbeat / non-JSON */ }
    };
    // onerror 는 로깅만. EventSource 자체 reconnect 에 맡김.
    es.onerror = () => { /* browser will retry with Last-Event-ID */ };
    return () => es.close();
  }, [initial.run.runId, status]);

  const isTerminal = TERMINAL_STATUSES.has(status);
  return (
    <>
      {isTerminal && (
        <p className="text-xs text-amber-700 bg-amber-50 px-3 py-1 rounded mb-4">
          이 run 은 종료됨 ({status}) — stale snapshot
        </p>
      )}
      <SectionRawEvents events={events} />
    </>
  );
}
```

> **확인 필요:** terminal status 를 알리는 실제 SSE event type 이름 — `apps/agent-api/src/routes/public/run-events.sse.ts` + `packages/contracts/src/public/public-run-event.ts` grep 으로 정확한 type literal 확정 (`run.statusChanged` / `run.terminated` / `run.completed` 중 어느 것). 본 plan 의 string 은 placeholder.

- [ ] **Step 4: page.tsx 에 RunDetailLive 추가**

Modify `apps/agent-admin/src/app/admin/runs/[runId]/page.tsx` — append RunDetailLive after `<SectionPhaseTimeline />`:

```tsx
<RunDetailLive initial={detail} />
```

- [ ] **Step 5: Manual smoke — disconnect/reconnect replay (Codex finding 3 검증)**

1. 새 run 1건 발화 → 상세 페이지 열어두면 §I 에 이벤트가 prepend 되는지 확인.
2. 페이지 열어둔 채 agent-api 재시작 (또는 wifi off 5초 → on). 브라우저 devtools Network → EventStream 에서 `Last-Event-ID` 헤더가 자동으로 재연결 요청에 포함되는지, 끊어진 사이의 이벤트가 replay 되어 dedupe 후 한 번만 표시되는지 확인.
3. 종료된 run 은 amber 배지 표시 + 새 SSE 연결 안 함.

- [ ] **Step 6: Commit**

```bash
git add apps/agent-admin
git commit -m "[feat] admin run 상세 SSE 라이브 + §I raw events (Last-Event-ID replay)"
```

---

## Task 6: §C interview + §D trend research + §E brief (Day 1 of Week 2)

**1 PR — 기존 artifact / interview_records 데이터 시각화.**

**Files:**
- Create: `apps/agent-admin/src/app/api/proxy/admin/runs/[runId]/artifacts/route.ts` (artifact proxy)
- Create: `apps/agent-admin/src/components/sections/SectionInterview.tsx`
- Create: `apps/agent-admin/src/components/sections/SectionTrendResearch.tsx`
- Create: `apps/agent-admin/src/components/sections/SectionBrief.tsx`
- Modify: detail page 에 추가
- Modify: agent-api 가 detail 응답에 `interviewSnapshot` 포함하도록 보강 (또는 별 endpoint)

- [ ] **Step 1: artifact proxy**

Create `apps/agent-admin/src/app/api/proxy/admin/runs/[runId]/artifacts/route.ts`:

```typescript
import type { NextRequest } from "next/server";

const upstream = process.env.AGENT_API_INTERNAL_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest, { params }: { params: { runId: string } }) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return new Response("missing key", { status: 400 });
  const res = await fetch(
    `${upstream}/api/agent-workflow/runs/${params.runId}/artifacts?key=${encodeURIComponent(key)}`,
    { cache: "no-store" },
  );
  return new Response(res.body, { status: res.status, headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream" } });
}
```

- [ ] **Step 2: agent-api detail 응답에 interviewSnapshot 포함**

Modify `AdminRunRepository.getDetail` — `agent_interview.interview_records` 에서 해당 runId 의 record 로드.

```typescript
const interviewRows = await this.db.execute(sql<{
  question: string; answer: string; selected_choice: string | null; created_at: Date;
}>`
  SELECT question, answer, selected_choice, created_at
  FROM agent_interview.interview_records
  WHERE run_id = ${runId}
  ORDER BY created_at ASC
`);
```

> 실제 컬럼명은 `packages/persistence/src/schema/interview.ts` 확인 후 정정.

Add to `AdminRunDetailSchema`:

```typescript
interviewSnapshot: Type.Array(Type.Object({
  question: Type.String(),
  answer: Type.String(),
  selectedChoice: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String({ format: "date-time" }),
})),
```

- [ ] **Step 3: SectionInterview**

Create `apps/agent-admin/src/components/sections/SectionInterview.tsx`:

```tsx
import type { AdminRunDetail } from "@tooldi/agent-contracts";

export function SectionInterview({ snapshot }: { snapshot: AdminRunDetail["interviewSnapshot"] }) {
  if (snapshot.length === 0) return null;
  return (
    <section id="C" className="mb-8">
      <h2 className="text-base font-semibold mb-2">§C Interview</h2>
      <ul className="space-y-2">
        {snapshot.map((q, i) => (
          <li key={i} className="bg-white border border-zinc-200 rounded p-3 text-xs">
            <div className="font-semibold">Q. {q.question}</div>
            <div className="mt-1 text-zinc-700">A. {q.answer}</div>
            {q.selectedChoice && <div className="mt-1 text-emerald-700">선택: {q.selectedChoice}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: SectionTrendResearch — artifact 비동기 fetch**

Create `apps/agent-admin/src/components/sections/SectionTrendResearch.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";

interface Trend { citations: { url: string; title: string }[]; summary: string; }

export function SectionTrendResearch({ runId, artifactKey }: { runId: string; artifactKey: string | null }) {
  const [data, setData] = useState<Trend | null>(null);
  useEffect(() => {
    if (!artifactKey) return;
    fetch(`/api/proxy/admin/runs/${runId}/artifacts?key=${encodeURIComponent(artifactKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, [runId, artifactKey]);
  if (!artifactKey) return null;
  if (!data) return <section id="D" className="mb-8 text-xs text-zinc-500">§D Trend Research 로딩 중…</section>;
  return (
    <section id="D" className="mb-8">
      <h2 className="text-base font-semibold mb-2">§D Trend Research</h2>
      <pre className="bg-white border border-zinc-200 rounded p-3 text-xs whitespace-pre-wrap">{data.summary}</pre>
      <ul className="mt-2 text-xs">
        {data.citations.map((c) => <li key={c.url}><a href={c.url} target="_blank" className="underline text-blue-700">{c.title}</a></li>)}
      </ul>
    </section>
  );
}
```

- [ ] **Step 5: SectionBrief**

같은 패턴, `canonical-design-brief` artifact 를 fetch 해 JSON pretty print:

```tsx
"use client";
import { useEffect, useState } from "react";
export function SectionBrief({ runId, artifactKey }: { runId: string; artifactKey: string | null }) {
  const [data, setData] = useState<unknown>(null);
  useEffect(() => {
    if (!artifactKey) return;
    fetch(`/api/proxy/admin/runs/${runId}/artifacts?key=${encodeURIComponent(artifactKey)}`)
      .then((r) => r.json()).then(setData).catch(() => setData(null));
  }, [runId, artifactKey]);
  if (!data) return null;
  return (
    <section id="E" className="mb-8">
      <h2 className="text-base font-semibold mb-2">§E Canonical Design Brief</h2>
      <pre className="bg-white border border-zinc-200 rounded p-3 text-xs overflow-auto max-h-96">{JSON.stringify(data, null, 2)}</pre>
    </section>
  );
}
```

- [ ] **Step 6: page 에 §C/§D/§E 추가 — 실제 kind 사용 (Codex finding 2)**

Detail page 에서 artifact key 를 다음 매핑으로 골라 전달 (가짜 kind 사용 금지):
- §D Trend Research → `detail.artifactRefs.find(r => r.kind === "v6-trend-brief" && r.exists)?.key ?? null`
- §E Brief → `detail.artifactRefs.find(r => r.kind === "canonical-design-brief" && r.exists)?.key ?? null`
- (§C interview 는 detail.interviewSnapshot 직접 사용 — artifact 아님)

- [ ] **Step 7: Manual smoke + commit**

```bash
git add apps/agent-admin packages/contracts apps/agent-api
git commit -m "[feat] admin run §C interview + §D trend + §E brief"
```

---

## Task 7: §F HTML generation + render-quality 빨강 (Day 2 of Week 2)

**1 PR — iframe sandbox 미리보기 + 이슈 강조.**

**Files:**
- Create: `apps/agent-admin/src/components/sections/SectionHtmlGeneration.tsx`
- Modify: detail page

- [ ] **Step 1: SectionHtmlGeneration**

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";

interface RenderIssue { code: string; severity: "warn" | "error"; message: string; coords?: { x: number; y: number; w: number; h: number }; }
interface RenderReport { issues: RenderIssue[]; html: string; canvasWidth: number; canvasHeight: number; }

export function SectionHtmlGeneration({ runId, htmlKey, reportKey }: { runId: string; htmlKey: string | null; reportKey: string | null }) {
  const [html, setHtml] = useState<string | null>(null);
  const [report, setReport] = useState<RenderReport | null>(null);

  useEffect(() => {
    if (htmlKey) fetch(`/api/proxy/admin/runs/${runId}/artifacts?key=${encodeURIComponent(htmlKey)}`).then((r) => r.text()).then(setHtml);
    if (reportKey) fetch(`/api/proxy/admin/runs/${runId}/artifacts?key=${encodeURIComponent(reportKey)}`).then((r) => r.json()).then(setReport);
  }, [runId, htmlKey, reportKey]);

  const errors = useMemo(() => report?.issues.filter((i) => i.severity === "error") ?? [], [report]);

  if (!html && !report) return null;

  return (
    <section id="F" className="mb-8">
      <h2 className="text-base font-semibold mb-2">§F HTML Generation</h2>
      {html && (
        <iframe
          sandbox="allow-same-origin"
          srcDoc={html}
          className="w-full h-[640px] border border-zinc-300 bg-white"
        />
      )}
      {errors.length > 0 && (
        <ul className="mt-3 space-y-1">
          {errors.map((iss, idx) => (
            <li key={idx} className="text-xs px-2 py-1 bg-rose-50 border border-rose-200 rounded text-rose-800">
              <span className="font-mono mr-2">{iss.code}</span>{iss.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: page 에 §F 끼우고 키 전달 — 실제 kind 사용 (Codex finding 2)**

`detail.artifactRefs` 에서 다음 매핑으로 prop 전달:
- `htmlKey` → `r.kind === "debug-v6-html-preview" && r.exists` (filename 은 `debug-v6-html.json`, kind 와 다름 — 반드시 kind 로 찾기)
- `reportKey` → `r.kind === "v6-render-quality-report" && r.exists`

> 단, `debug-v6-html.json` 은 단순 JSON wrapper 가 아니라 HTML preview artifact. 실제 fetch 결과의 shape 은 `apps/agent-worker/src/phases/v6DebugHtmlPreview.ts` 의 `buildV6ConstrainedDebugHtmlPreviewArtifact` 반환값 — `.html` 필드일 가능성. SectionHtmlGeneration 의 fetch 후 `setHtml(json.html ?? "")` 식으로 변환 필요. 첫 구현 시 실제 응답 shape 확인.

- [ ] **Step 3: build + manual smoke**

이슈 있는 run 으로 빨강 박스 보이는지 확인.

- [ ] **Step 4: Commit**

```bash
git add apps/agent-admin
git commit -m "[feat] admin run §F HTML 미리보기 + 렌더 퀄리티 이슈 빨강"
```

---

## Task 8: RAG capture (worker) — `v6-asset-resolution.json` + `v6-asset-generated.json` (Day 3 of Week 2)

**1 PR — agent-worker 변경 한정. UI 없음.**

**Files:**
- Modify: `apps/agent-worker/src/phases/v6Types.ts`
- Modify: `apps/agent-worker/src/phases/v6AssetResolver.ts`
- Modify: `apps/agent-worker/src/graph/v6PipelineNode.ts`
- Test: `apps/agent-worker/src/phases/v6AssetResolver.test.ts`, `apps/agent-worker/src/graph/v6PipelineNode.artifact.test.ts`

- [ ] **Step 1: V6Types — 새 타입 export**

Add to `apps/agent-worker/src/phases/v6Types.ts`:

```typescript
export interface V6AssetResolutionLog {
  version: 1;
  runId: string;
  attemptSeq: number;
  placeholders: Array<{
    sourceSerial: number;
    placeholderHint: string;
    family: "photo" | "graphic";
    candidates: Array<{
      rank: number;
      qdrantScore: number;
      originKey: string;
      srcUrl: string;
      selected: boolean;
      rejectReason: string | null;
    }>;
    decision: "selected" | "generate" | "unresolved";
    decisionReason: string;
    selectedCandidateRank: number | null;
    fallbackGeneratedAssetId: string | null;
  }>;
}

export interface V6AssetGenerationLog {
  version: 1;
  runId: string;
  attemptSeq: number;
  items: Array<{
    placeholderHint: string;
    model: string;
    prompt: string;
    latencyMs: number;
    outputAssetKey: string;
    outputArtifactUrl: string;
    fileSizeBytes: number;
  }>;
}
```

- [ ] **Step 2: TDD — resolver 가 resolutionLog 를 반환한다**

Add to `apps/agent-worker/src/phases/v6AssetResolver.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveV6PlaceholderAssets } from "./v6AssetResolver.js";
import { createFakeDeps } from "../testing/fakes.js"; // 기존 컨벤션 따라

describe("resolveV6PlaceholderAssets", () => {
  it("placeholder 별 후보 + decision 을 resolutionLog 에 기록", async () => {
    const deps = createFakeDeps({
      qdrantHits: [{ score: 0.91, key: "photo:abc", srcUrl: "https://cdn/abc.jpg" }],
    });
    const result = await resolveV6PlaceholderAssets({
      runId: "run_t",
      attemptSeq: 0,
      userPrompt: "강아지",
      canvasWidth: 1080, canvasHeight: 1080,
      googleApiKey: "fake",
      objectStore: deps.objectStore,
      publishClient: deps.publishClient,
      env: deps.env,
      commands: [{ kind: "placeholder.photo", placeholderHint: "강아지", sourceSerial: 1 }] as never,
    });
    assert.equal(result.resolutionLog.placeholders.length, 1);
    assert.equal(result.resolutionLog.placeholders[0].decision, "selected");
    assert.equal(result.generatedLog.items.length, 0);
  });
});
```

> Fake deps helper 는 기존 worker 테스트 mirror — 없으면 만들어야 하는데, agent-worker 의 다른 phase 테스트 보면 비슷한 패턴이 있을 것. 없다면 이 step 의 첫 작업이 fakes 만들기.

- [ ] **Step 3: Resolver 가 데이터 반환하도록 수정 (로직은 그대로)**

Modify `apps/agent-worker/src/phases/v6AssetResolver.ts` — 함수 시그니처 return type 을:

```typescript
import type { V6AssetResolutionLog, V6AssetGenerationLog } from "./v6Types.js";

export async function resolveV6PlaceholderAssets(input: ...): Promise<{
  commands: V6Command[];
  resolutionLog: V6AssetResolutionLog;
  generatedLog: V6AssetGenerationLog;
}> {
  // 기존 로직: candidate selection / generation 안에서 두 로그 array 를 추가로 누적.
  const resolutionLog: V6AssetResolutionLog = { version: 1, runId: input.runId, attemptSeq: input.attemptSeq, placeholders: [] };
  const generatedLog: V6AssetGenerationLog = { version: 1, runId: input.runId, attemptSeq: input.attemptSeq, items: [] };
  // ... 기존 매핑 로직 ... 매 placeholder 마다 placeholders.push({...}); 매 Gemini 발사마다 items.push({...});
  return { commands: resolvedCommands, resolutionLog, generatedLog };
}
```

> 정확한 입력 prop 인 `attemptSeq` 가 현재 시그니처에 없으면 호출자(`v6PipelineNode`)에서 넘겨야 함. handoff 의 코드 확인 노트:

```typescript
// 호출자에서 attemptSeq 추가
const { commands, resolutionLog, generatedLog } = await resolveV6PlaceholderAssets({
  runId, attemptSeq: state.job.attemptSeq, ...
});
```

- [ ] **Step 4: TDD — pipeline node 가 두 artifact 를 emit**

Add `apps/agent-worker/src/graph/v6PipelineNode.artifact.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runV6PipelineNode } from "./v6PipelineNode.js";
import { createFakeWorkerCtx } from "../testing/fakes.js";

describe("v6PipelineNode artifact emission", () => {
  it("v6-asset-resolution.json 은 항상 emit", async () => {
    const ctx = createFakeWorkerCtx({ qdrantHits: [/* none */] });
    await runV6PipelineNode(ctx.state, ctx.deps);
    const keys = ctx.deps.objectStore.getPutCalls().map((c) => c.key);
    assert.ok(keys.some((k) => k.endsWith("/v6-asset-resolution.json")));
  });

  it("Gemini 발사 항목 0건이면 v6-asset-generated.json 미발행", async () => {
    const ctx = createFakeWorkerCtx({ noGenerated: true });
    await runV6PipelineNode(ctx.state, ctx.deps);
    const keys = ctx.deps.objectStore.getPutCalls().map((c) => c.key);
    assert.ok(!keys.some((k) => k.endsWith("/v6-asset-generated.json")));
  });

  it("Gemini 발사 1건 이상이면 v6-asset-generated.json 발행", async () => {
    const ctx = createFakeWorkerCtx({ generatedCount: 2 });
    await runV6PipelineNode(ctx.state, ctx.deps);
    const keys = ctx.deps.objectStore.getPutCalls().map((c) => c.key);
    assert.ok(keys.some((k) => k.endsWith("/v6-asset-generated.json")));
  });

  it("capture persist 실패해도 draft 생성은 계속됨 + warn 이벤트 emit (Codex finding 4)", async () => {
    const ctx = createFakeWorkerCtx({ failPersistKeys: ["v6-asset-resolution.json"] });
    const result = await runV6PipelineNode(ctx.state, ctx.deps);
    assert.ok(result.draft, "draft 는 정상 반환되어야 함");
    const warns = ctx.deps.events.filter(
      (e) => e.type === "log" && e.level === "warn" && e.message.includes("v6-asset-resolution persist failed"),
    );
    assert.equal(warns.length, 1);
  });
});
```

- [ ] **Step 5: pipeline node 에서 emit 추가 — best-effort (Codex finding 4)**

Modify `apps/agent-worker/src/graph/v6PipelineNode.ts` — resolver 호출 후. 두 capture 모두 admin observability 전용이므로 user-visible draft 생성을 막지 말 것. 기존 unrestricted preview (`v6PipelineNode.ts:582-624`) 패턴 그대로 mirror:

```typescript
const { commands: resolvedV6Commands, resolutionLog, generatedLog } = await resolveV6PlaceholderAssets({
  runId: state.job.runId,
  attemptSeq: state.job.attemptSeq,
  // ... existing args
});

// v6-asset-resolution: 항상 시도, 실패는 warn 으로만.
try {
  await persistArtifactTask(
    `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/v6-asset-resolution.json`,
    resolutionLog,
    {
      artifactKind: "v6-asset-resolution",
      runId: state.job.runId,
      traceId: state.job.traceId,
      attemptSeq: String(state.job.attemptSeq),
    },
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown asset-resolution persist error";
  await appendEventTask(state.job.runId, {
    event: {
      type: "log",
      level: "warn",
      message: `[admin-capture] v6-asset-resolution persist failed: ${message}`,
    },
  });
}

// v6-asset-generated: items 있을 때만 시도, 실패는 warn 으로만.
if (generatedLog.items.length > 0) {
  try {
    await persistArtifactTask(
      `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/v6-asset-generated.json`,
      generatedLog,
      {
        artifactKind: "v6-asset-generated",
        runId: state.job.runId,
        traceId: state.job.traceId,
        attemptSeq: String(state.job.attemptSeq),
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown asset-generated persist error";
    await appendEventTask(state.job.runId, {
      event: {
        type: "log",
        level: "warn",
        message: `[admin-capture] v6-asset-generated persist failed: ${message}`,
      },
    });
  }
}
```

- [ ] **Step 6: Tests + typecheck**

```bash
pnpm --filter @tooldi/agent-worker typecheck
pnpm --filter @tooldi/agent-worker test
```

Expected: 신규 + 기존 모두 PASS, v6 회귀 0.

- [ ] **Step 7: Commit**

```bash
git add apps/agent-worker
git commit -m "[feat] agent-worker — RAG 결정 + Gemini 생성 capture artifact 2종 추가"
```

---

## Task 9: §G asset resolution UI + §H final commands (Day 4 of Week 2)

**1 PR — RAG 후보 grid + 선택 강조 + Gemini 패널 + final commands.**

**Files:**
- Create: `apps/agent-admin/src/components/sections/SectionAssetResolution.tsx`
- Create: `apps/agent-admin/src/components/sections/SectionFinalCommands.tsx`
- Modify: detail page

- [ ] **Step 1: SectionAssetResolution**

```tsx
"use client";
import { useEffect, useState } from "react";
import type { V6AssetResolutionLog, V6AssetGenerationLog } from "@/types/v6.js"; // 또는 contracts 로 이관

export function SectionAssetResolution({
  runId, resolutionKey, generatedKey,
}: { runId: string; resolutionKey: string | null; generatedKey: string | null }) {
  const [resolution, setResolution] = useState<V6AssetResolutionLog | null>(null);
  const [generated, setGenerated] = useState<V6AssetGenerationLog | null>(null);

  useEffect(() => {
    if (resolutionKey) fetch(`/api/proxy/admin/runs/${runId}/artifacts?key=${encodeURIComponent(resolutionKey)}`).then((r) => r.json()).then(setResolution).catch(() => {});
    if (generatedKey) fetch(`/api/proxy/admin/runs/${runId}/artifacts?key=${encodeURIComponent(generatedKey)}`).then((r) => r.json()).then(setGenerated).catch(() => {});
  }, [runId, resolutionKey, generatedKey]);

  if (!resolution) return null;
  return (
    <section id="G" className="mb-8">
      <h2 className="text-base font-semibold mb-2">§G Asset Resolution (RAG)</h2>
      {resolution.placeholders.map((p) => (
        <div key={p.sourceSerial} className="mb-4 p-3 bg-white border border-zinc-200 rounded">
          <div className="text-xs font-mono text-zinc-500">#{p.sourceSerial} · {p.family}</div>
          <div className="text-sm font-semibold">{p.placeholderHint}</div>
          <div className="text-xs mt-1">결정: <span className={p.decision === "selected" ? "text-emerald-700" : p.decision === "generate" ? "text-blue-700" : "text-rose-700"}>{p.decision}</span> — {p.decisionReason}</div>
          <div className="grid grid-cols-4 gap-2 mt-2">
            {p.candidates.map((c) => (
              <div key={c.rank} className={`p-1 border ${c.selected ? "border-emerald-500 ring-2 ring-emerald-300" : "border-zinc-200"}`}>
                <img src={c.srcUrl} alt="" className="w-full h-24 object-cover" loading="lazy" />
                <div className="text-[10px] font-mono text-zinc-500 mt-0.5">#{c.rank} · {c.qdrantScore.toFixed(3)}</div>
                {c.rejectReason && <div className="text-[10px] text-rose-600">{c.rejectReason}</div>}
              </div>
            ))}
          </div>
          {p.decision === "generate" && generated?.items.find((g) => g.placeholderHint === p.placeholderHint) && (
            <GeminiPanel item={generated.items.find((g) => g.placeholderHint === p.placeholderHint)!} runId={runId} />
          )}
        </div>
      ))}
    </section>
  );
}

function GeminiPanel({ item, runId }: { item: V6AssetGenerationLog["items"][number]; runId: string }) {
  return (
    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
      <div className="text-xs font-semibold text-blue-800">Gemini ({item.model}, {item.latencyMs}ms)</div>
      <details className="text-xs"><summary>prompt</summary><pre className="whitespace-pre-wrap">{item.prompt}</pre></details>
      <img src={`/api/proxy/admin/runs/${runId}/artifacts?key=${encodeURIComponent(item.outputAssetKey)}`} alt="" className="mt-1 max-h-48" />
    </div>
  );
}
```

- [ ] **Step 2: SectionFinalCommands**

```tsx
"use client";
import { useEffect, useState } from "react";
export function SectionFinalCommands({ runId, artifactKey }: { runId: string; artifactKey: string | null }) {
  const [data, setData] = useState<unknown[] | null>(null);
  useEffect(() => {
    if (!artifactKey) return;
    fetch(`/api/proxy/admin/runs/${runId}/artifacts?key=${encodeURIComponent(artifactKey)}`).then((r) => r.json()).then(setData);
  }, [runId, artifactKey]);
  if (!data) return null;
  return (
    <section id="H" className="mb-8">
      <h2 className="text-base font-semibold mb-2">§H Final Commands ({data.length})</h2>
      <pre className="bg-white border border-zinc-200 rounded p-3 text-xs max-h-96 overflow-auto">{JSON.stringify(data, null, 2)}</pre>
    </section>
  );
}
```

- [ ] **Step 3: 타입 공유 — V6 log 타입을 contracts 로 이관**

Move `V6AssetResolutionLog` / `V6AssetGenerationLog` 를 `packages/contracts/src/admin/v6-logs.ts` 로 이동, worker 와 admin 모두에서 import. `packages/contracts/src/admin/index.ts` 에 re-export.

- [ ] **Step 4: page 에 §G/§H 추가 + 키 전달 — 실제 kind 사용 (Codex finding 2)**

`detail.artifactRefs` 에서 다음 매핑으로 prop 전달:
- §G `resolutionKey` → `r.kind === "v6-asset-resolution" && r.exists`
- §G `generatedKey` → `r.kind === "v6-asset-generated" && r.exists`
- §H `executablePlanKey` → `r.kind === "executable-plan" && r.exists` (design doc 의 "Final Commands" 가 실제로는 `executable-plan.json`)

- [ ] **Step 5: build + manual smoke**

Gemini 발사된 run 으로 패널 보이는지 확인. 외부 CDN srcUrl 이 iframe sandbox CSP 와 충돌 시 thumbnail proxy 추가 (Open Risk).

- [ ] **Step 6: Commit**

```bash
git add apps/agent-admin packages/contracts apps/agent-worker
git commit -m "[feat] admin run §G RAG 후보 grid + Gemini 패널 + §H 최종 커맨드"
```

---

## Task 10: Annotation 묶음 — sticky bar + server action + 리스트 필터 (Day 5 of Week 2)

**1 PR — tag/note/star 가 즉시 저장되고 새로고침 후에도 유지. 리스트 필터 동작.**

**Files:**
- Create: `apps/agent-admin/src/app/admin/runs/actions.ts`
- Create: `apps/agent-admin/src/components/AnnotationStickyBar.tsx`
- Create: `apps/agent-admin/src/components/RunsFilters.tsx`
- Modify: `RunDetailHeader.tsx` 또는 detail page — sticky bar 사용
- Modify: runs page — 필터 UI

- [ ] **Step 1: Server action — annotation upsert + 409 conflict 매핑 (Codex finding 5)**

Modify `apps/agent-admin/src/lib/adminApi.ts` — `upsertAnnotation` 이 409 응답을 conflict 결과로 반환하도록 변경:

```typescript
export type UpsertAnnotationResult =
  | { ok: true; annotation: RunAnnotation }
  | { ok: false; conflict: true; current: RunAnnotation };

upsertAnnotation: async (
  runId: string,
  body: { starred?: boolean; tags?: string[]; note?: string; ifMatchUpdatedAt?: string | null },
): Promise<UpsertAnnotationResult> => {
  const res = await fetch(`${baseUrl}/api/admin/runs/${runId}/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (res.status === 409) {
    const json = await res.json() as { current: RunAnnotation };
    return { ok: false, conflict: true, current: json.current };
  }
  if (!res.ok) throw new Error(`admin api ${res.status}: upsertAnnotation`);
  const json = await res.json() as { annotation: RunAnnotation };
  return { ok: true, annotation: json.annotation };
},
```

Create `apps/agent-admin/src/app/admin/runs/actions.ts`:

```typescript
"use server";
import { revalidatePath } from "next/cache";
import { adminApi, type UpsertAnnotationResult } from "@/lib/adminApi.js";

export async function upsertAnnotationAction(input: {
  runId: string;
  starred?: boolean;
  tags?: string[];
  note?: string;
  ifMatchUpdatedAt?: string | null;
}): Promise<UpsertAnnotationResult> {
  const { runId, ...patch } = input;
  const res = await adminApi.upsertAnnotation(runId, patch);
  if (res.ok) {
    revalidatePath(`/admin/runs/${runId}`);
    revalidatePath(`/admin/runs`);
  }
  return res;
}
```

- [ ] **Step 2: AnnotationStickyBar**

```tsx
"use client";
import { useState, useTransition } from "react";
import type { RunAnnotation } from "@tooldi/agent-contracts";
import { upsertAnnotationAction } from "@/app/admin/runs/actions.js";

export function AnnotationStickyBar({ runId, initial, knownTags }: { runId: string; initial: RunAnnotation | null; knownTags: string[] }) {
  const [ann, setAnn] = useState(initial ?? { runId, starred: false, tags: [], note: "", updatedBy: "local", updatedAt: "" });
  const [draftTag, setDraftTag] = useState("");
  const [conflict, setConflict] = useState<RunAnnotation | null>(null);
  const [pending, start] = useTransition();

  // Codex finding 5: If-Match optimistic concurrency.
  // 서버가 409 반환 시 현재 row 로 화면을 reload 시키고 사용자 변경분은 버림 + 알림.
  function patch(p: { starred?: boolean; tags?: string[]; note?: string }) {
    start(async () => {
      const res = await upsertAnnotationAction({
        runId,
        ifMatchUpdatedAt: ann.updatedAt || null,
        ...p,
      });
      if (res.ok) {
        setAnn(res.annotation);
        setConflict(null);
      } else {
        setConflict(res.current);
        setAnn(res.current);
      }
    });
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <button onClick={() => patch({ starred: !ann.starred })} className="text-lg">
        {ann.starred ? "⭐" : "☆"}
      </button>
      <div className="flex flex-wrap gap-1">
        {ann.tags.map((t) => (
          <span key={t} className="px-1.5 py-0.5 bg-zinc-100 rounded text-xs flex items-center gap-1">
            {t}
            <button onClick={() => patch({ tags: ann.tags.filter((x) => x !== t) })}>✕</button>
          </span>
        ))}
        <input
          list="known-tags"
          value={draftTag}
          onChange={(e) => setDraftTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draftTag.trim()) {
              patch({ tags: [...new Set([...ann.tags, draftTag.trim()])] });
              setDraftTag("");
            }
          }}
          placeholder="tag…"
          className="text-xs border-b border-zinc-300 px-1 w-24"
        />
        <datalist id="known-tags">{knownTags.map((t) => <option key={t} value={t} />)}</datalist>
      </div>
      <input
        type="text"
        value={ann.note}
        onChange={(e) => setAnn({ ...ann, note: e.target.value })}
        onBlur={(e) => patch({ note: e.target.value })}
        placeholder="note…"
        maxLength={1000}
        className="text-xs border-b border-zinc-300 px-1 flex-1"
      />
      {pending && <span className="text-xs text-zinc-400">저장 중…</span>}
      {conflict && (
        <span className="text-xs text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
          다른 곳에서 먼저 수정됨 — 최신값으로 갱신했습니다. 다시 시도해주세요.
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 헤더에 sticky bar 끼움**

Modify `RunDetailHeader.tsx` — 기존 헤더에 `<AnnotationStickyBar />` 추가. `knownTags` 는 server component 에서 `adminApi.getTagsMeta()` 로 받아와 prop 전달.

- [ ] **Step 4: RunsFilters**

```tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";

export function RunsFilters({ knownTags }: { knownTags: string[] }) {
  const router = useRouter();
  const params = useSearchParams();

  function set(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    router.push(`/admin/runs?${next.toString()}`);
  }

  return (
    <div className="flex gap-2 text-xs mb-3">
      <select onChange={(e) => set("starred", e.target.value || null)} value={params.get("starred") ?? ""}>
        <option value="">starred?</option>
        <option value="true">⭐ only</option>
      </select>
      <select onChange={(e) => set("tag", e.target.value || null)} value={params.get("tag") ?? ""}>
        <option value="">tag</option>
        {knownTags.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <select onChange={(e) => set("status", e.target.value || null)} value={params.get("status") ?? ""}>
        <option value="">status</option>
        {["queued", "running", "succeeded", "failed", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}
```

- [ ] **Step 5: runs page 에 필터 UI 끼움**

Modify `apps/agent-admin/src/app/admin/runs/page.tsx`:

```tsx
const { tags } = await adminApi.getTagsMeta();
return (
  <main className="p-6 max-w-5xl mx-auto">
    <header className="flex items-center justify-between mb-4">
      <h1 className="text-xl font-semibold">AGW Runs</h1>
      <span className="text-xs text-zinc-500">5s 자동 갱신</span>
    </header>
    <RunsFilters knownTags={tags} />
    <RunsList initial={initial} filters={filters} />
  </main>
);
```

- [ ] **Step 6: Manual end-to-end 검증 (Acceptance Criteria 그대로)**

1. agent-api / agent-worker / agent-admin 셋 다 띄움
2. 한 run 발화 (overflow 잘 나는 카피)
3. `/admin/runs` 가 5s 안에 새 row 노출
4. 클릭 → §A~§I 모든 섹션 데이터 채워짐
5. ⭐ 토글 / tag 추가 / note 입력 → 새로고침 후에도 유지
6. starred=true / tag=X 필터 동작
7. artifact 폴더에 `v6-asset-resolution.json` 존재
8. Gemini 발사 케이스 한 번 더 → `v6-asset-generated.json` 도 emit

- [ ] **Step 7: 모든 패키지 typecheck/build/test**

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime
pnpm --filter @tooldi/agent-api typecheck && pnpm --filter @tooldi/agent-api test
pnpm --filter @tooldi/agent-worker typecheck && pnpm --filter @tooldi/agent-worker test
pnpm --filter @tooldi/agent-persistence test
pnpm --filter @tooldi/agent-contracts test
pnpm --filter @tooldi/agent-admin build
pnpm --filter @tooldi/agent-admin lint
```

Expected: 전부 PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/agent-admin
git commit -m "[feat] admin annotation — sticky bar + server action + 리스트 필터"
```

---

## Self-Review

**1. Spec coverage** — design doc §1~§6 + handoff Acceptance Criteria 1~6 매핑:

| Spec 항목 | 매핑 task |
|---|---|
| §1 mini-app + agent-api 분리 | Task 1, 2 |
| §2 v6-asset-resolution.json | Task 8 |
| §2 v6-asset-generated.json | Task 8 |
| §3 리스트 (auto-poll 5s) | Task 3 |
| §3 상세 §A 사용자 입력 | Task 4 |
| §3 상세 §B phase timeline | Task 4 |
| §3 상세 §C interview | Task 6 |
| §3 상세 §D trend research | Task 6 |
| §3 상세 §E brief | Task 6 |
| §3 상세 §F HTML + render-quality 빨강 | Task 7 |
| §3 상세 §G asset resolution + Gemini 패널 | Task 9 |
| §3 상세 §H final commands | Task 9 |
| §3 상세 §I raw events | Task 5 |
| §3 SSE active / stale snapshot | Task 5 |
| §4 run_annotations table + index | Task 1 |
| §4 annotation API | Task 2 |
| §4 tag chip / autocomplete (`/_meta/tags`) | Task 2, 10 |
| §5 NODE_ENV 가드 | Task 2 |
| Acceptance 1 (5초 자동 반영) | Task 3 |
| Acceptance 2 (§A~§I) | Task 4, 5, 6, 7, 9 |
| Acceptance 3 (annotation 즉시 저장 + 유지) | Task 10 |
| Acceptance 4 (필터 동작) | Task 10 |
| Acceptance 5 (artifact 2종 emit) | Task 8 |
| Acceptance 6 (typecheck/build/test) | Task 10 Step 7 |

**Gap check:** §3 sticky tag/star 가 task 4 의 헤더에 미포함 — 의도적으로 task 10 으로 미룸 (annotation API 가 있어야 동작).

**2. Placeholder scan** — 다음 항목은 코드 변경 시 grep 으로 정정해야 하는 알려진 갭이며, plan 안에서 명시적으로 언급:
- `runs.userPrompt` / `runs.canvasWidth` 등 실제 컬럼명은 `packages/persistence/src/schema/runtime.ts` 확인 후 정정 (Task 2 Step 8 노트, Task 4 Step 3 노트)
- `agent_interview.interview_records` 컬럼명은 `schema/interview.ts` 확인 후 정정 (Task 6 Step 2 노트)
- `createTestDb`/`buildTestApp` helper 부재 시 testkit 확장 (Task 2 Step 4 노트)
- worker fakes helper 부재 시 자체 작성 (Task 8 Step 2 노트)

**3. Type consistency** — RunAnnotation, AnnotationUpsertBody, AdminRunSummary, AdminRunDetail, V6AssetResolutionLog, V6AssetGenerationLog 모두 contracts 패키지에 단일 정의되고 worker / api / admin 에서 동일 import. Task 9 Step 3 에서 V6 log 타입을 contracts 로 이관.

**4. Risks (handoff Open Risks 매핑):**
- Qdrant CDN ↔ iframe sandbox CSP — Task 9 Step 5 manual smoke 시 검증, 충돌 시 thumbnail proxy 추가
- `runs.created_at` 인덱스 — Task 1 Step 4 마이그레이션 시점에 `\d agent_runtime.runs` 로 확인, 없으면 같은 마이그레이션에 추가
- `pnpm-workspace.yaml` 등록 — `apps/*` glob 으로 자동 (Task 1 Step 18 install 시 검증)
- v6 force-through 분기에서 resolver 호출 여부 — Task 8 시작 전 `v6PipelineNode.ts` grep 으로 확인. 호출 안 되면 force-through 시 RAG capture 미발생이 정상 동작
- PII — V1 로컬 전용이라 무시 OK, 운영 §5b 별 PR

**5. V1 범위 밖 — 절대 손대지 말 것 (handoff 명시):**
- 인증 / 운영 배포 / CSRF
- Interview 후보지 capture
- Run re-run / live diff
- Annotation history / audit trail

---

## Revisions Applied (Codex Adversarial Review, 2026-05-08)

Codex review verdict: **needs-attention** → 5개 finding 모두 plan 에 반영 후 재승인.

| # | Finding | Severity | 반영 위치 |
|---|---|---|---|
| 1 | Admin status enum drift (`succeeded`/`running` 등 가상값) | high | Convention notes ground truth, Task 1 Step 9 (RunStatusSchema 재사용), Task 5 Step 3 (TerminalRunStatusValues 재사용) |
| 2 | Artifact key drift (`v6-html`/`trend-research`/`v6-final-commands` 가짜 키) | high | Convention notes 실제 emit 표, Task 1 (artifact-kinds.ts 신규), Task 2 Step 8/8b/8c (AdminArtifactDiscoveryService — object-store prefix list), Task 6/7/9 의 prop 매핑 정정 |
| 3 | SSE proxy 가 `Last-Event-ID` 안 forward, client 가 첫 error 에 close | high | Task 5 Step 1 (proxy 헤더 forward), Task 5 Step 3 (EventSource 자체 재연결 의존, dedupe), Task 5 Step 5 (disconnect/reconnect smoke 검증) |
| 4 | RAG capture 실패가 user-visible run 실패로 전이 | medium | Convention notes 실패 정책 패턴, Task 8 Step 5 (try/catch + warn 이벤트 emit), Task 8 Step 4 의 신규 테스트 |
| 5 | Annotation 동시 편집 silent overwrite | medium | Task 1 Step 6 (`ifMatchUpdatedAt`), Task 2 Step 4 새 테스트 + Step 12 (route 409 매핑 + AnnotationConflictError), Task 10 Step 1/2 (server action UpsertAnnotationResult, sticky bar conflict reload) |

**Behavioral diff vs. v1 plan:**
- Status badge / terminal 판정 / contract 모두 13값 + 4값 enum 으로 통일 (`succeeded` 단어 제거).
- Detail endpoint 가 hardcoded artifact key 대신 object-store list 결과 + exists flag 반환.
- SSE 가 끊겨도 마지막 event id 부터 자동 replay → 화면 stale 없음.
- RAG capture 실패는 warn log 로만 남고 generation 은 계속.
- 두 사람 동시 편집 시 늦은 쪽 409 → 화면이 최신값으로 reload + 알림.

---

## Execution Handoff

**Plan complete and saved to** `agent-workflow-test/docs/superpowers/plans/2026-05-08-agw-admin-dashboard.md`.

**두 실행 옵션:**

**1. Subagent-Driven (recommended)** — task 마다 신선한 subagent dispatch, task 사이에 두 단계 review (자체 + 별 reviewer agent), 빠른 iteration

**2. Inline Execution** — 이 세션에서 task 들을 batch 단위로 실행, 체크포인트마다 review

**어떤 접근?**
