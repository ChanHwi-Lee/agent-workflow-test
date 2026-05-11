# AGW Result Dashboard V0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AGW run 의 결과물을 한 화면에서 검토하는 read-only 대시보드. 핵심 가치 = **RAG 결정 + Gemini 발사 시각화 + v6 HTML 렌더 품질** 한 곳에서 보기. 운영 누적용 기능 (annotation/star/tag/필터) 은 V0 범위 밖, V1 으로 deferred.

**Architecture:** 신규 sibling Next.js 14 mini-app `apps/agent-admin` (port 3200) 가 기존 agent-api Fastify (port 3000) 의 새 read-only `/api/admin/*` 엔드포인트만 호출. 신규 테이블·DB 마이그레이션 없음. worker 가 `v6-asset-resolution.json` (항상) 과 `v6-asset-generated.json` (Gemini 발사 시) 두 artifact 를 best-effort 로 추가 emit. V0 는 로컬 전용 + 인증 없음 (`NODE_ENV !== 'production'` 가드만).

**Tech Stack:** TypeScript + pnpm workspace · Fastify 5 (agent-api) · Next.js 14 App Router + Tailwind CSS (agent-admin, 첫 frontend) · TypeBox (contracts) · Node.js built-in test runner · 기존 `persistArtifactTask` / `objectStore` 재사용.

**Source of truth:**
- Design: [`../../design/2026-05-08-agw-admin-dashboard.md`](../../design/2026-05-08-agw-admin-dashboard.md)
- Handoff: [`../../handoff/2026-05-08-agw-admin-dashboard-implementation.md`](../../handoff/2026-05-08-agw-admin-dashboard-implementation.md)
- V1 full plan (reference, V0 후속 fully-loaded 버전): [`./2026-05-08-agw-admin-dashboard.md`](./2026-05-08-agw-admin-dashboard.md) — annotation, SSE replay, 필터, 추가 섹션, Codex finding 3+5 의 디테일이 거기 있음

**Repo root:** `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime/`

---

## V0 Scope vs V1 Out-of-scope

| 포함 | 제외 (V1 으로 deferred) |
|---|---|
| `/admin/runs` 리스트 (5s polling, 필터 없음) | starred / tag / status 필터 UI |
| `/admin/runs/[runId]` 상세 — §A 유저입력, §B phase timeline, §I raw events (load 시점 1회 fetch) | annotation 테이블, sticky bar tag/note/star, server action |
| §F HTML iframe + render-quality 빨강 강조 | §C interview, §D trend research, §E canonical brief — 필요 시 V1 에서 노출 |
| §G RAG 후보 grid + Gemini 패널 (RAG capture worker 포함) | SSE 라이브 + Last-Event-ID replay (V0 는 detail page reload 로 갱신) |
| §H executable plan JSON | run_annotations 테이블, AnnotationConflictError, If-Match concurrency |
| `NODE_ENV !== 'production'` 가드 | 운영 배포, 인증, CSRF |
| Best-effort RAG capture (try/catch + warn event) | run re-run, live diff, annotation history |

> V1 으로 미룬 항목들의 디테일은 모두 [V1 plan](./2026-05-08-agw-admin-dashboard.md) 에 박혀 있음 — V0 종료 후 거기서 이어 가면 됨.

---

## Convention notes (V1 plan ground truth 그대로 적용 — Codex finding 1·2·4 반영)

- **agent-api 실제 포트**: **3000** (design 의 3100 과 다름). env var 이름 `AGENT_API_INTERNAL_URL` 만 design 컨벤션 유지.
- **agent-api 라우트**: `apps/agent-api/src/routes/{public|internal}/<name>.<method>.ts` → `app.ts` 에서 manual `await app.register(...)`.
- **DB 액세스**: `apps/agent-api/src/repositories/*.ts` repository 클래스, Drizzle 직접.
- **contracts**: TypeBox. `packages/contracts/src/<group>/<name>.ts` + `index.ts` re-export.
- **Test runner**: `node --test`, `*.test.ts` co-locate.
- **agent-admin** 첫 Next.js 앱 → 앱 안에서 self-contained Tailwind/ESLint.
- **Run status — `RunStatusValues` 13개 enum 재사용** (`packages/contracts/src/common.ts`):
  `enqueue_pending`, `planning_queued`, `planning`, `plan_ready`, `executing`, `awaiting_apply_ack`, `saving`, `finalizing`, `cancel_requested`, `completed`, `save_failed_after_apply`, `failed`, `cancelled`. → `RunStatusSchema` import. 새 enum 만들지 말 것.
- **Terminal status — `TerminalRunStatusValues` 4개**: `completed`, `save_failed_after_apply`, `failed`, `cancelled`. `succeeded` 단어 plan 어디에도 등장 금지.
- **실제 emit artifact kinds + 파일명 (kind ≠ filename 케이스 주의)**:

  | artifactKind | 파일명 |
  |---|---|
  | `brief-compilation-report` | `brief-compilation-report.json` |
  | `canonical-design-brief` | `canonical-design-brief.json` |
  | `v6-trend-brief` | `v6-trend-brief.json` |
  | `v6-render-quality-report` | `v6-render-quality-report.json` (+ per-attempt 변종) |
  | `v6-render-quality-failure` | `v6-render-quality-failure-attempt-N.json` |
  | `debug-v6-html-preview` | `debug-v6-html.json` |
  | `debug-unrestricted-html-preview` | `debug-unrestricted-html.json` |
  | `executable-plan` | `executable-plan.json` |
  | `v6-asset-resolution` (V0 신규) | `v6-asset-resolution.json` |
  | `v6-asset-generated` (V0 신규, 조건부) | `v6-asset-generated.json` |

- **Capture 실패 정책 — best-effort try/catch + warn event** (mirror `v6PipelineNode.ts:582-624` 의 unrestricted preview):

  ```typescript
  try {
    await persistArtifactTask(...);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    await appendEventTask(state.job.runId, {
      event: { type: "log", level: "warn", message: `[admin-capture] <kind> failed: ${message}` },
    });
  }
  ```

  RAG capture 두 개 모두 admin 전용 → user-visible draft 영향 없음 → best-effort.

---

## File Structure

### packages/contracts (신규만)
- `packages/contracts/src/admin/run-summary.ts` — `AdminRunSummarySchema` (status는 `RunStatusSchema` 재사용)
- `packages/contracts/src/admin/run-detail.ts` — `AdminRunDetailSchema`, `AttemptSummarySchema`, `PhaseSummarySchema`, `ArtifactRefSchema`, `RunEventSnapshotSchema`
- `packages/contracts/src/admin/artifact-kinds.ts` — `AdminArtifactKindValues` (11종) + `AdminArtifactKindSchema` + `AdminArtifactFilenameByKind` 매핑
- `packages/contracts/src/admin/v6-logs.ts` — `V6AssetResolutionLog`, `V6AssetGenerationLog` (worker 와 admin 공용)
- `packages/contracts/src/admin/index.ts` — 그룹 export
- `packages/contracts/src/index.ts` — `./admin/index` re-export 추가

### apps/agent-api (Fastify)
- `apps/agent-api/src/lib/adminGuard.ts` — `NODE_ENV !== 'production'` preHandler
- `apps/agent-api/src/services/AdminArtifactDiscoveryService.ts` — object-store prefix list → ArtifactRef[]
- `apps/agent-api/src/repositories/AdminRunRepository.ts` — list + getDetail (annotation join 없음)
- `apps/agent-api/src/routes/internal/admin-runs-list.get.ts` — `GET /api/admin/runs?limit&before&status`
- `apps/agent-api/src/routes/internal/admin-run-detail.get.ts` — `GET /api/admin/runs/:runId`
- 수정: `apps/agent-api/src/app.ts` — 2개 admin route + adminGuard 등록

### apps/agent-worker (RAG capture)
- 수정: `apps/agent-worker/src/phases/v6AssetResolver.ts` — return shape 에 `resolutionLog`, `generatedLog` 추가
- 수정: `apps/agent-worker/src/graph/v6PipelineNode.ts` — resolver 호출 직후 `persistArtifactTask` 2회 (best-effort)
- 신규 테스트: `apps/agent-worker/src/phases/v6AssetResolver.test.ts`, `apps/agent-worker/src/graph/v6PipelineNode.artifact.test.ts`

### apps/agent-admin (Next.js 14, 신규 앱)
- `apps/agent-admin/{package.json, tsconfig.json, next.config.mjs, tailwind.config.ts, postcss.config.mjs, .eslintrc.json, .env.local.example}`
- `apps/agent-admin/src/app/layout.tsx`, `apps/agent-admin/src/app/globals.css`
- `apps/agent-admin/src/app/admin/runs/page.tsx` — 리스트 server component
- `apps/agent-admin/src/app/admin/runs/[runId]/page.tsx` — 상세 server component
- `apps/agent-admin/src/app/api/proxy/admin/runs/route.ts` — list proxy
- `apps/agent-admin/src/app/api/proxy/admin/runs/[runId]/route.ts` — detail proxy
- `apps/agent-admin/src/app/api/proxy/admin/runs/[runId]/artifacts/route.ts` — artifact body proxy (기존 `/api/agent-workflow/runs/:runId/artifacts?key=...` 활용)
- `apps/agent-admin/src/lib/adminApi.ts` — server-side fetch wrapper
- `apps/agent-admin/src/components/StatusBadge.tsx`
- `apps/agent-admin/src/components/RunsList.tsx` — 5s polling client component
- `apps/agent-admin/src/components/RunDetailHeader.tsx` — 단순 메타 (annotation 없음)
- `apps/agent-admin/src/components/sections/SectionUserInput.tsx` (§A)
- `apps/agent-admin/src/components/sections/SectionPhaseTimeline.tsx` (§B)
- `apps/agent-admin/src/components/sections/SectionRawEvents.tsx` (§I, load 시점 1회)
- `apps/agent-admin/src/components/sections/SectionHtmlGeneration.tsx` (§F)
- `apps/agent-admin/src/components/sections/SectionAssetResolution.tsx` (§G, RAG grid + Gemini)
- `apps/agent-admin/src/components/sections/SectionFinalCommands.tsx` (§H executable plan)

---

## Task 1: Scaffold + admin contracts (1 PR)

**Files:**
- Create: 위 packages/contracts/src/admin/* 5개 파일 + index.ts 재export
- Create: apps/agent-admin scaffold 파일들 + placeholder runs page
- Test: `packages/contracts/src/admin/artifact-kinds.test.ts`

- [ ] **Step 1: artifact-kinds 작성**

Create `packages/contracts/src/admin/artifact-kinds.ts`:

```typescript
import { Type, type Static } from "@sinclair/typebox";

export const AdminArtifactKindValues = [
  "brief-compilation-report",
  "canonical-design-brief",
  "v6-trend-brief",
  "v6-render-quality-report",
  "v6-render-quality-failure",
  "debug-v6-html-preview",
  "debug-unrestricted-html-preview",
  "executable-plan",
  "v6-asset-resolution",
  "v6-asset-generated",
] as const;

export const AdminArtifactKindSchema = Type.Union(
  AdminArtifactKindValues.map((v) => Type.Literal(v)),
);
export type AdminArtifactKind = Static<typeof AdminArtifactKindSchema>;

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

- [ ] **Step 2: TDD — kind enum sanity**

Create `packages/contracts/src/admin/artifact-kinds.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Value } from "@sinclair/typebox/value";
import {
  AdminArtifactFilenameByKind,
  AdminArtifactKindSchema,
  AdminArtifactKindValues,
} from "./artifact-kinds.js";

describe("AdminArtifactKind", () => {
  it("실제 워커 emit kind 9개 + RAG 신규 2개 = 11개", () => {
    assert.equal(AdminArtifactKindValues.length, 10);  // 8 기존 + 2 신규 = 10 (대시보드 표 참조)
  });
  it("모든 kind 가 filename 매핑 존재", () => {
    for (const k of AdminArtifactKindValues) assert.ok(AdminArtifactFilenameByKind[k]);
  });
  it("미등록 kind 는 schema 거절", () => {
    assert.equal(Value.Check(AdminArtifactKindSchema, "v6-html"), false);
    assert.equal(Value.Check(AdminArtifactKindSchema, "executable-plan"), true);
  });
});
```

- [ ] **Step 3: AdminRunSummary + AdminRunDetail + V6 logs**

Create `packages/contracts/src/admin/run-summary.ts`:

```typescript
import { Type, type Static } from "@sinclair/typebox";
import { RunStatusSchema } from "../common.js";   // ← 13값 enum 재사용

export const AdminRunSummarySchema = Type.Object({
  runId: Type.String(),
  status: RunStatusSchema,
  createdAt: Type.String({ format: "date-time" }),
  attempts: Type.Integer({ minimum: 0 }),
  promptPreview: Type.String(),
});
export type AdminRunSummary = Static<typeof AdminRunSummarySchema>;

export const AdminRunsListResponseSchema = Type.Object({
  runs: Type.Array(AdminRunSummarySchema),
  hasMore: Type.Boolean(),
  nextBefore: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
});
export type AdminRunsListResponse = Static<typeof AdminRunsListResponseSchema>;
```

Create `packages/contracts/src/admin/run-detail.ts`:

```typescript
import { Type, type Static } from "@sinclair/typebox";
import { AdminRunSummarySchema } from "./run-summary.js";
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
  kind: AdminArtifactKindSchema,            // 실제 worker emit kind 만 허용
  key: Type.String(),                       // `runs/<runId>/attempts/<seq>/<filename>`
  attemptSeq: Type.Integer(),
  exists: Type.Boolean(),                   // object-store HEAD 결과
});
export type ArtifactRef = Static<typeof ArtifactRefSchema>;

export const RunEventSnapshotSchema = Type.Object({
  id: Type.String(),
  phase: Type.String(),
  type: Type.String(),
  at: Type.String({ format: "date-time" }),
  data: Type.Unknown(),
});
export type RunEventSnapshot = Static<typeof RunEventSnapshotSchema>;

export const AdminRunDetailSchema = Type.Object({
  run: AdminRunSummarySchema,
  userPromptFull: Type.String(),
  canvasMeta: Type.Object({ width: Type.Integer(), height: Type.Integer() }),
  attempts: Type.Array(AttemptSummarySchema),
  phases: Type.Array(PhaseSummarySchema),
  artifactRefs: Type.Array(ArtifactRefSchema),
  recentEvents: Type.Array(RunEventSnapshotSchema),  // 최근 200개, V0 §I 노출용
});
export type AdminRunDetail = Static<typeof AdminRunDetailSchema>;
```

Create `packages/contracts/src/admin/v6-logs.ts`:

```typescript
import { Type, type Static } from "@sinclair/typebox";

export const V6AssetCandidateSchema = Type.Object({
  rank: Type.Integer(),
  qdrantScore: Type.Number(),
  originKey: Type.String(),
  srcUrl: Type.String(),
  selected: Type.Boolean(),
  rejectReason: Type.Union([Type.String(), Type.Null()]),
});

export const V6AssetResolutionPlaceholderSchema = Type.Object({
  sourceSerial: Type.Integer(),
  placeholderHint: Type.String(),
  family: Type.Union(["photo", "graphic"].map((v) => Type.Literal(v))),
  candidates: Type.Array(V6AssetCandidateSchema),
  decision: Type.Union(["selected", "generate", "unresolved"].map((v) => Type.Literal(v))),
  decisionReason: Type.String(),
  selectedCandidateRank: Type.Union([Type.Integer(), Type.Null()]),
  fallbackGeneratedAssetId: Type.Union([Type.String(), Type.Null()]),
});

export const V6AssetResolutionLogSchema = Type.Object({
  version: Type.Literal(1),
  runId: Type.String(),
  attemptSeq: Type.Integer(),
  placeholders: Type.Array(V6AssetResolutionPlaceholderSchema),
});
export type V6AssetResolutionLog = Static<typeof V6AssetResolutionLogSchema>;

export const V6AssetGenerationItemSchema = Type.Object({
  placeholderHint: Type.String(),
  model: Type.String(),
  prompt: Type.String(),
  latencyMs: Type.Integer(),
  outputAssetKey: Type.String(),
  outputArtifactUrl: Type.String(),
  fileSizeBytes: Type.Integer(),
});

export const V6AssetGenerationLogSchema = Type.Object({
  version: Type.Literal(1),
  runId: Type.String(),
  attemptSeq: Type.Integer(),
  items: Type.Array(V6AssetGenerationItemSchema),
});
export type V6AssetGenerationLog = Static<typeof V6AssetGenerationLogSchema>;
```

Create `packages/contracts/src/admin/index.ts`:

```typescript
export * from "./artifact-kinds.js";
export * from "./run-summary.js";
export * from "./run-detail.js";
export * from "./v6-logs.js";
```

Modify `packages/contracts/src/index.ts` — append `export * from "./admin/index.js";`.

- [ ] **Step 4: contracts test PASS**

```bash
pnpm --filter @tooldi/agent-contracts typecheck && pnpm --filter @tooldi/agent-contracts test
```

- [ ] **Step 5: Next.js scaffold**

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
    "noEmit": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "allowJs": true,
    "skipLibCheck": true,
    "composite": false,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "src/**/*", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `apps/agent-admin/next.config.mjs`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
export default nextConfig;
```

Create `apps/agent-admin/tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";
const config: Config = { content: ["./src/**/*.{ts,tsx}"], theme: { extend: {} }, plugins: [] };
export default config;
```

Create `apps/agent-admin/postcss.config.mjs`:

```javascript
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

Create `apps/agent-admin/.eslintrc.json`:

```json
{ "extends": "next/core-web-vitals" }
```

Create `apps/agent-admin/.env.local.example`:

```
AGENT_API_INTERNAL_URL=http://localhost:3000
```

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
  title: "AGW Result Dashboard",
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

Create `apps/agent-admin/src/app/admin/runs/page.tsx` (placeholder):

```tsx
export default function RunsPage() {
  return <main className="p-6"><h1 className="text-xl font-semibold">AGW Runs</h1><p className="text-sm text-zinc-600">Task 3 에서 구현됩니다.</p></main>;
}
```

- [ ] **Step 6: install + build smoke**

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime
pnpm install
pnpm --filter @tooldi/agent-admin build
pnpm --filter @tooldi/agent-contracts typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/contracts apps/agent-admin
git commit -m "[feat] AGW result-dashboard V0 — admin scaffold + contracts"
```

---

## Task 2: admin endpoints (list/detail) + adminGuard + ArtifactDiscoveryService (1 PR)

**Files:**
- Create: `apps/agent-api/src/lib/adminGuard.ts` + test
- Create: `apps/agent-api/src/services/AdminArtifactDiscoveryService.ts` + test
- Create: `apps/agent-api/src/repositories/AdminRunRepository.ts` + test
- Create: `apps/agent-api/src/routes/internal/admin-runs-list.get.ts` + test
- Create: `apps/agent-api/src/routes/internal/admin-run-detail.get.ts` + test
- Modify: `apps/agent-api/src/app.ts`

- [ ] **Step 1: TDD — adminGuard**

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
    app.addHook("onRequest", adminGuard);
    app.get("/api/admin/x", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/api/admin/x" });
    assert.equal(res.statusCode, 404);
    await app.close();
  });

  it("NODE_ENV=development 일 때 통과", async () => {
    process.env.NODE_ENV = "development";
    const app = Fastify();
    app.addHook("onRequest", adminGuard);
    app.get("/api/admin/x", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/api/admin/x" });
    assert.equal(res.statusCode, 200);
    await app.close();
  });
});
```

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

- [ ] **Step 2: TDD — AdminArtifactDiscoveryService**

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
      "runs/r1/attempts/0/random-unknown.json",
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
        if (!kind) continue;
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

> **확인 필요:** `ObjectStoreClient.listObjects({ prefix })` 가 실제 존재하는지 grep — 없으면 client 인터페이스 확장 필요. 첫 사용 시 검증.

- [ ] **Step 3: AdminRunRepository — list + getDetail**

Create `apps/agent-api/src/repositories/AdminRunRepository.ts`:

```typescript
import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { AgentRuntimeDb } from "@tooldi/agent-persistence";
import { runs, runAttempts, runEvents } from "@tooldi/agent-persistence";
import type {
  AdminRunSummary,
  AdminRunsListResponse,
  AdminRunDetail,
  RunEventSnapshot,
} from "@tooldi/agent-contracts";
import type { AdminArtifactDiscoveryService } from "../services/AdminArtifactDiscoveryService.js";

export interface ListParams { limit: number; status?: string; before?: string; }

export class AdminRunRepository {
  constructor(
    private db: AgentRuntimeDb,
    private artifactDiscovery: AdminArtifactDiscoveryService,
  ) {}

  async list(p: ListParams): Promise<AdminRunsListResponse> {
    const limit = Math.max(1, Math.min(100, p.limit));
    const conditions = [];
    if (p.status) conditions.push(eq(runs.status, p.status));
    if (p.before) conditions.push(lt(runs.createdAt, new Date(p.before)));

    const rows = await this.db
      .select({
        runId: runs.id,
        status: runs.status,
        createdAt: runs.createdAt,
        userPrompt: runs.userPrompt,                   // ← 실제 컬럼명 schema 확인 후 정정
        attempts: sql<number>`COALESCE(MAX(${runAttempts.attemptSeq}) + 1, 0)`.as("attempts"),
      })
      .from(runs)
      .leftJoin(runAttempts, eq(runAttempts.runId, runs.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(runs.id)
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
    }));
    return {
      runs: summaries,
      hasMore,
      nextBefore: hasMore ? summaries[summaries.length - 1].createdAt : null,
    };
  }

  async getDetail(runId: string): Promise<AdminRunDetail | null> {
    const runRow = await this.db.select().from(runs).where(eq(runs.id, runId)).limit(1);
    if (runRow.length === 0) return null;
    const r = runRow[0];

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

    const eventRows = await this.db
      .select()
      .from(runEvents)
      .where(eq(runEvents.runId, runId))
      .orderBy(desc(runEvents.createdAt))
      .limit(200);

    const artifactRefs = await this.artifactDiscovery.listForRun(
      runId,
      attemptRows.map((a) => a.attemptSeq),
    );

    return {
      run: {
        runId: r.id,
        status: r.status as never,
        createdAt: r.createdAt.toISOString(),
        attempts: attemptRows.length,
        promptPreview: (r.userPrompt ?? "").slice(0, 120),
      },
      userPromptFull: r.userPrompt ?? "",
      canvasMeta: { width: r.canvasWidth ?? 0, height: r.canvasHeight ?? 0 },
      attempts: attemptRows.map((a) => ({
        attemptSeq: a.attemptSeq,
        status: a.status,
        startedAt: a.startedAt.toISOString(),
        finishedAt: a.finishedAt?.toISOString() ?? null,
      })),
      phases: phaseRows.rows.map((p) => ({
        phase: p.phase,
        status: p.status as never,
        startedAt: p.started_at?.toISOString() ?? null,
        finishedAt: p.finished_at?.toISOString() ?? null,
      })),
      artifactRefs,
      recentEvents: eventRows.map((e) => this.toEventSnapshot(e)).reverse(),  // 시간 오름차순
    };
  }

  private toEventSnapshot(row: typeof runEvents.$inferSelect): RunEventSnapshot {
    return {
      id: row.eventId ?? row.id,                   // ← 실제 PK 컬럼명 schema 확인 후 정정
      phase: row.phase ?? "",
      type: row.type ?? "",
      at: row.createdAt.toISOString(),
      data: row.payload ?? null,
    };
  }
}
```

> **알려진 갭 (구현 시 grep 으로 정정):**
> - `runs.userPrompt`, `runs.canvasWidth`, `runs.canvasHeight` 실제 컬럼명 — `packages/persistence/src/schema/runtime.ts` 확인.
> - `runEvents` 의 PK / phase / type / payload 실제 컬럼명 동일하게 확인.

- [ ] **Step 4: TDD — list endpoint route**

Create `apps/agent-api/src/routes/internal/admin-runs-list.get.test.ts`:

```typescript
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp } from "../../testHelpers.js";   // 없으면 첫 사용 시 helper 생성

describe("GET /api/admin/runs", () => {
  let ctx: Awaited<ReturnType<typeof buildTestApp>>;
  before(async () => {
    process.env.NODE_ENV = "development";
    ctx = await buildTestApp();
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
    process.env.NODE_ENV = "production";
    const ctx2 = await buildTestApp();
    const res = await ctx2.app.inject({ method: "GET", url: "/api/admin/runs" });
    assert.equal(res.statusCode, 404);
    await ctx2.close();
  });
});
```

- [ ] **Step 5: list endpoint route**

Create `apps/agent-api/src/routes/internal/admin-runs-list.get.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";
import { Type } from "@sinclair/typebox";
import { AdminRunsListResponseSchema } from "@tooldi/agent-contracts";
import { AdminRunRepository } from "../../repositories/AdminRunRepository.js";
import { AdminArtifactDiscoveryService } from "../../services/AdminArtifactDiscoveryService.js";

const QuerySchema = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  status: Type.Optional(Type.String()),
  before: Type.Optional(Type.String({ format: "date-time" })),
});

export const adminRunsListRoute: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/admin/runs",
    { schema: { querystring: QuerySchema, response: { 200: AdminRunsListResponseSchema } } },
    async (request) => {
      const repo = new AdminRunRepository(
        app.db.db,
        new AdminArtifactDiscoveryService(app.objectStore),
      );
      const q = request.query as { limit?: number; status?: string; before?: string };
      return repo.list({ limit: q.limit ?? 50, status: q.status, before: q.before });
    },
  );
};
```

- [ ] **Step 6: detail endpoint route**

Create `apps/agent-api/src/routes/internal/admin-run-detail.get.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";
import { Type } from "@sinclair/typebox";
import { AdminRunDetailSchema } from "@tooldi/agent-contracts";
import { AdminRunRepository } from "../../repositories/AdminRunRepository.js";
import { AdminArtifactDiscoveryService } from "../../services/AdminArtifactDiscoveryService.js";

const ParamsSchema = Type.Object({ runId: Type.String({ minLength: 1 }) });

export const adminRunDetailRoute: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/admin/runs/:runId",
    { schema: { params: ParamsSchema, response: { 200: AdminRunDetailSchema } } },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const repo = new AdminRunRepository(
        app.db.db,
        new AdminArtifactDiscoveryService(app.objectStore),
      );
      const detail = await repo.getDetail(runId);
      if (!detail) return reply.code(404).send({ error: "not_found" });
      return detail;
    },
  );
};
```

- [ ] **Step 7: register routes + guard**

Modify `apps/agent-api/src/app.ts` — append in routes registration block:

```typescript
import { adminGuard } from "./lib/adminGuard.js";
import { adminRunsListRoute } from "./routes/internal/admin-runs-list.get.js";
import { adminRunDetailRoute } from "./routes/internal/admin-run-detail.get.js";

app.addHook("onRequest", adminGuard);
await app.register(adminRunsListRoute);
await app.register(adminRunDetailRoute);
```

- [ ] **Step 8: typecheck + test + manual smoke**

```bash
pnpm --filter @tooldi/agent-api typecheck && pnpm --filter @tooldi/agent-api test
NODE_ENV=development pnpm --filter @tooldi/agent-api dev &
sleep 3
curl -s http://localhost:3000/api/admin/runs?limit=5 | jq .
```

- [ ] **Step 9: Commit**

```bash
git add apps/agent-api packages/contracts
git commit -m "[feat] AGW admin endpoints — runs list/detail + adminGuard + artifact discovery"
```

---

## Task 3: List page (1 PR)

**Files:**
- Create: `apps/agent-admin/src/lib/adminApi.ts`
- Create: `apps/agent-admin/src/components/StatusBadge.tsx`
- Create: `apps/agent-admin/src/components/RunsList.tsx`
- Create: `apps/agent-admin/src/app/api/proxy/admin/runs/route.ts`
- Modify: `apps/agent-admin/src/app/admin/runs/page.tsx` (placeholder → 실제)

- [ ] **Step 1: adminApi**

Create `apps/agent-admin/src/lib/adminApi.ts`:

```typescript
import type { AdminRunsListResponse, AdminRunDetail } from "@tooldi/agent-contracts";

const baseUrl = process.env.AGENT_API_INTERNAL_URL ?? "http://localhost:3000";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, { ...init, cache: "no-store" });
  if (!res.ok) throw new Error(`admin api ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const adminApi = {
  listRuns: (q: { limit?: number; before?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (q.limit) params.set("limit", String(q.limit));
    if (q.before) params.set("before", q.before);
    if (q.status) params.set("status", q.status);
    return fetchJson<AdminRunsListResponse>(`/api/admin/runs?${params}`);
  },
  getRun: (runId: string) => fetchJson<AdminRunDetail>(`/api/admin/runs/${runId}`),
};
```

- [ ] **Step 2: StatusBadge — 13값 모두 커버**

Create `apps/agent-admin/src/components/StatusBadge.tsx`:

```tsx
import type { RunStatus } from "@tooldi/agent-contracts";

const colors: Record<RunStatus, string> = {
  enqueue_pending:         "bg-zinc-200 text-zinc-700",
  planning_queued:         "bg-zinc-200 text-zinc-700",
  planning:                "bg-blue-100 text-blue-700",
  plan_ready:              "bg-blue-100 text-blue-700",
  executing:               "bg-blue-200 text-blue-800",
  awaiting_apply_ack:      "bg-blue-200 text-blue-800",
  saving:                  "bg-blue-200 text-blue-800",
  finalizing:              "bg-blue-200 text-blue-800",
  cancel_requested:        "bg-amber-100 text-amber-700",
  completed:               "bg-emerald-100 text-emerald-700",
  save_failed_after_apply: "bg-rose-100 text-rose-700",
  failed:                  "bg-rose-100 text-rose-700",
  cancelled:               "bg-amber-100 text-amber-700",
};
export function StatusBadge({ status }: { status: RunStatus }) {
  return <span className={`px-2 py-0.5 rounded text-xs font-mono ${colors[status]}`}>{status}</span>;
}
```

- [ ] **Step 3: RunsList — 5s polling**

Create `apps/agent-admin/src/components/RunsList.tsx`:

```tsx
"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AdminRunsListResponse, AdminRunSummary } from "@tooldi/agent-contracts";
import { StatusBadge } from "./StatusBadge.js";

export function RunsList({ initial }: { initial: AdminRunsListResponse }) {
  const [data, setData] = useState(initial);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (document.hidden) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(`/api/proxy/admin/runs?limit=50`, { signal: ctrl.signal });
        if (!cancelled && res.ok) setData(await res.json());
      } catch { /* abort 또는 net error → 다음 tick */ }
    }
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); abortRef.current?.abort(); };
  }, []);

  return (
    <ul className="divide-y divide-zinc-200">
      {data.runs.map((r: AdminRunSummary) => (
        <li key={r.runId} className="py-2 flex items-center gap-3 text-sm">
          <span className="font-mono text-xs text-zinc-500">{r.createdAt.slice(11, 16)}</span>
          <Link href={`/admin/runs/${r.runId}`} className="font-mono text-xs hover:underline">{r.runId.slice(0, 12)}</Link>
          <StatusBadge status={r.status} />
          <span className="text-xs text-zinc-500">{r.attempts}att</span>
          <span className="truncate max-w-md">{r.promptPreview}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: list proxy route**

Create `apps/agent-admin/src/app/api/proxy/admin/runs/route.ts`:

```typescript
import type { NextRequest } from "next/server";

const upstream = process.env.AGENT_API_INTERNAL_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest) {
  const res = await fetch(`${upstream}/api/admin/runs${req.nextUrl.search}`, { cache: "no-store" });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 5: page.tsx**

Modify `apps/agent-admin/src/app/admin/runs/page.tsx`:

```tsx
import { adminApi } from "@/lib/adminApi.js";
import { RunsList } from "@/components/RunsList.js";

export default async function RunsPage() {
  const initial = await adminApi.listRuns({ limit: 50 });
  return (
    <main className="p-6 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">AGW Runs</h1>
        <span className="text-xs text-zinc-500">5s 자동 갱신</span>
      </header>
      <RunsList initial={initial} />
    </main>
  );
}
```

- [ ] **Step 6: Manual smoke + commit**

```bash
NODE_ENV=development pnpm --filter @tooldi/agent-api dev &
pnpm --filter @tooldi/agent-admin dev &
# 브라우저 http://localhost:3200/admin/runs

git add apps/agent-admin
git commit -m "[feat] AGW result-dashboard — runs list (5s polling)"
```

---

## Task 4: Detail skeleton — §A + §B + §I (1 PR)

**Files:**
- Create: `apps/agent-admin/src/app/api/proxy/admin/runs/[runId]/route.ts`
- Create: `apps/agent-admin/src/app/admin/runs/[runId]/page.tsx`
- Create: `apps/agent-admin/src/components/RunDetailHeader.tsx`
- Create: `apps/agent-admin/src/components/sections/SectionUserInput.tsx` (§A)
- Create: `apps/agent-admin/src/components/sections/SectionPhaseTimeline.tsx` (§B)
- Create: `apps/agent-admin/src/components/sections/SectionRawEvents.tsx` (§I, page-load 시점 1회)

- [ ] **Step 1: detail proxy**

Create `apps/agent-admin/src/app/api/proxy/admin/runs/[runId]/route.ts`:

```typescript
import type { NextRequest } from "next/server";

const upstream = process.env.AGENT_API_INTERNAL_URL ?? "http://localhost:3000";

export async function GET(_: NextRequest, { params }: { params: { runId: string } }) {
  const res = await fetch(`${upstream}/api/admin/runs/${params.runId}`, { cache: "no-store" });
  return new Response(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
}
```

- [ ] **Step 2: SectionUserInput**

Create `apps/agent-admin/src/components/sections/SectionUserInput.tsx`:

```tsx
import type { AdminRunDetail } from "@tooldi/agent-contracts";

export function SectionUserInput({ detail }: { detail: AdminRunDetail }) {
  return (
    <section id="A" className="mb-8">
      <h2 className="text-base font-semibold mb-2">§A User Input</h2>
      <pre className="bg-white border border-zinc-200 rounded p-3 text-xs whitespace-pre-wrap">
        {detail.userPromptFull || "(empty)"}
      </pre>
      <div className="mt-1 text-xs text-zinc-500 font-mono">
        canvas {detail.canvasMeta.width}×{detail.canvasMeta.height}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: SectionPhaseTimeline**

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
            <span>{p.phase}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 4: SectionRawEvents — load 시점 1회**

Create `apps/agent-admin/src/components/sections/SectionRawEvents.tsx`:

```tsx
"use client";
import { useState } from "react";
import type { RunEventSnapshot } from "@tooldi/agent-contracts";

export function SectionRawEvents({ events }: { events: RunEventSnapshot[] }) {
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

- [ ] **Step 5: RunDetailHeader + page**

Create `apps/agent-admin/src/components/RunDetailHeader.tsx`:

```tsx
import type { AdminRunDetail } from "@tooldi/agent-contracts";
import { StatusBadge } from "./StatusBadge.js";

export function RunDetailHeader({ detail }: { detail: AdminRunDetail }) {
  return (
    <header className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-4 py-3 flex items-center gap-3">
      <span className="font-mono text-sm">{detail.run.runId}</span>
      <StatusBadge status={detail.run.status} />
      <span className="text-xs text-zinc-500">{detail.attempts.length} attempts</span>
    </header>
  );
}
```

Create `apps/agent-admin/src/app/admin/runs/[runId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { adminApi } from "@/lib/adminApi.js";
import { RunDetailHeader } from "@/components/RunDetailHeader.js";
import { SectionUserInput } from "@/components/sections/SectionUserInput.js";
import { SectionPhaseTimeline } from "@/components/sections/SectionPhaseTimeline.js";
import { SectionRawEvents } from "@/components/sections/SectionRawEvents.js";

export default async function RunDetailPage({ params }: { params: { runId: string } }) {
  let detail;
  try { detail = await adminApi.getRun(params.runId); } catch { notFound(); }
  return (
    <div>
      <RunDetailHeader detail={detail} />
      <main className="p-6 max-w-5xl mx-auto">
        <SectionUserInput detail={detail} />
        <SectionPhaseTimeline phases={detail.phases} />
        <SectionRawEvents events={detail.recentEvents} />
        <p className="text-xs text-zinc-400">§F / §G / §H 는 다음 task 에서 추가됩니다.</p>
      </main>
    </div>
  );
}
```

- [ ] **Step 6: build + manual smoke + commit**

```bash
pnpm --filter @tooldi/agent-admin build
git add apps/agent-admin
git commit -m "[feat] AGW result-dashboard — 상세 §A 유저입력 + §B 페이즈 + §I 이벤트"
```

---

## Task 5: §F HTML iframe + render-quality 빨강 강조 (1 PR)

**Files:**
- Create: `apps/agent-admin/src/app/api/proxy/admin/runs/[runId]/artifacts/route.ts` — body proxy (기존 `/api/agent-workflow/runs/:runId/artifacts?key=...` 활용)
- Create: `apps/agent-admin/src/components/sections/SectionHtmlGeneration.tsx` (§F)
- Modify: detail page

- [ ] **Step 1: artifact body proxy**

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
  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream" },
  });
}
```

- [ ] **Step 2: SectionHtmlGeneration**

Create `apps/agent-admin/src/components/sections/SectionHtmlGeneration.tsx`:

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";

interface RenderIssue {
  code: string;
  severity: "warn" | "error";
  message: string;
  coords?: { x: number; y: number; w: number; h: number };
}
interface RenderReport { issues: RenderIssue[]; }

export function SectionHtmlGeneration({
  runId, htmlKey, reportKey,
}: { runId: string; htmlKey: string | null; reportKey: string | null }) {
  const [html, setHtml] = useState<string | null>(null);
  const [report, setReport] = useState<RenderReport | null>(null);

  useEffect(() => {
    if (htmlKey) {
      // debug-v6-html-preview 의 실제 shape 은 v6DebugHtmlPreview.ts 의 build 함수 결과.
      // .html 필드 가정 — 첫 구현 시 실제 shape 확인 후 정정.
      fetch(`/api/proxy/admin/runs/${runId}/artifacts?key=${encodeURIComponent(htmlKey)}`)
        .then((r) => r.json())
        .then((j) => setHtml(typeof j === "string" ? j : (j.html ?? null)))
        .catch(() => setHtml(null));
    }
    if (reportKey) {
      fetch(`/api/proxy/admin/runs/${runId}/artifacts?key=${encodeURIComponent(reportKey)}`)
        .then((r) => r.json()).then(setReport).catch(() => setReport(null));
    }
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

- [ ] **Step 3: detail page 에 §F 끼움**

```tsx
const htmlKey   = detail.artifactRefs.find((r) => r.kind === "debug-v6-html-preview" && r.exists)?.key ?? null;
const reportKey = detail.artifactRefs.find((r) => r.kind === "v6-render-quality-report" && r.exists)?.key ?? null;
// ...
<SectionHtmlGeneration runId={detail.run.runId} htmlKey={htmlKey} reportKey={reportKey} />
```

- [ ] **Step 4: build + manual smoke + commit**

```bash
pnpm --filter @tooldi/agent-admin build
git add apps/agent-admin
git commit -m "[feat] AGW result-dashboard — §F HTML iframe + render-quality 빨강"
```

---

## Task 6: RAG capture (worker) + §G + §H (1 PR)

**Files:**
- Modify: `apps/agent-worker/src/phases/v6AssetResolver.ts`
- Modify: `apps/agent-worker/src/graph/v6PipelineNode.ts`
- Test: `apps/agent-worker/src/phases/v6AssetResolver.test.ts`, `apps/agent-worker/src/graph/v6PipelineNode.artifact.test.ts`
- Create: `apps/agent-admin/src/components/sections/SectionAssetResolution.tsx` (§G)
- Create: `apps/agent-admin/src/components/sections/SectionFinalCommands.tsx` (§H)
- Modify: detail page

- [ ] **Step 1: TDD — resolver 가 resolutionLog 반환**

Create `apps/agent-worker/src/phases/v6AssetResolver.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveV6PlaceholderAssets } from "./v6AssetResolver.js";
import { createFakeDeps } from "../testing/fakes.js";   // 없으면 첫 사용 시 helper 작성

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

- [ ] **Step 2: Resolver 변경**

Modify `apps/agent-worker/src/phases/v6AssetResolver.ts` — 기존 시그니처에 `attemptSeq` 추가, return type 확장:

```typescript
import type { V6AssetResolutionLog, V6AssetGenerationLog } from "@tooldi/agent-contracts";

export async function resolveV6PlaceholderAssets(input: ...): Promise<{
  commands: V6Command[];
  resolutionLog: V6AssetResolutionLog;
  generatedLog: V6AssetGenerationLog;
}> {
  const resolutionLog: V6AssetResolutionLog = {
    version: 1, runId: input.runId, attemptSeq: input.attemptSeq, placeholders: [],
  };
  const generatedLog: V6AssetGenerationLog = {
    version: 1, runId: input.runId, attemptSeq: input.attemptSeq, items: [],
  };
  // ... 기존 로직 — 매 placeholder 마다 placeholders.push, 매 Gemini 발사마다 items.push
  return { commands: resolvedCommands, resolutionLog, generatedLog };
}
```

호출자 (`v6PipelineNode.ts`) 가 `attemptSeq: state.job.attemptSeq` 전달하도록 수정.

- [ ] **Step 3: TDD — pipeline node best-effort emit**

Create `apps/agent-worker/src/graph/v6PipelineNode.artifact.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runV6PipelineNode } from "./v6PipelineNode.js";
import { createFakeWorkerCtx } from "../testing/fakes.js";

describe("v6PipelineNode artifact emission", () => {
  it("v6-asset-resolution.json 은 항상 emit", async () => {
    const ctx = createFakeWorkerCtx({ qdrantHits: [] });
    await runV6PipelineNode(ctx.state, ctx.deps);
    const keys = ctx.deps.objectStore.getPutCalls().map((c) => c.key);
    assert.ok(keys.some((k) => k.endsWith("/v6-asset-resolution.json")));
  });

  it("Gemini 발사 0건이면 v6-asset-generated.json 미발행", async () => {
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

  it("capture persist 실패해도 draft 생성은 계속됨 + warn 이벤트 emit", async () => {
    const ctx = createFakeWorkerCtx({ failPersistKeys: ["v6-asset-resolution.json"] });
    const result = await runV6PipelineNode(ctx.state, ctx.deps);
    assert.ok(result.draft, "draft 는 정상 반환되어야 함");
    const warns = ctx.deps.events.filter(
      (e) => e.type === "log" && e.level === "warn" && e.message.includes("v6-asset-resolution"),
    );
    assert.equal(warns.length, 1);
  });
});
```

- [ ] **Step 4: pipeline node — best-effort emit**

Modify `apps/agent-worker/src/graph/v6PipelineNode.ts` — resolver 호출 직후:

```typescript
const { commands: resolvedV6Commands, resolutionLog, generatedLog } =
  await resolveV6PlaceholderAssets({
    runId: state.job.runId,
    attemptSeq: state.job.attemptSeq,
    // ... 기존 args
  });

// best-effort: 실패해도 draft 생성 막지 말 것
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
  const message = error instanceof Error ? error.message : "unknown";
  await appendEventTask(state.job.runId, {
    event: { type: "log", level: "warn", message: `[admin-capture] v6-asset-resolution persist failed: ${message}` },
  });
}

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
    const message = error instanceof Error ? error.message : "unknown";
    await appendEventTask(state.job.runId, {
      event: { type: "log", level: "warn", message: `[admin-capture] v6-asset-generated persist failed: ${message}` },
    });
  }
}
```

- [ ] **Step 5: SectionAssetResolution + GeminiPanel**

Create `apps/agent-admin/src/components/sections/SectionAssetResolution.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import type { V6AssetResolutionLog, V6AssetGenerationLog } from "@tooldi/agent-contracts";

export function SectionAssetResolution({
  runId, resolutionKey, generatedKey,
}: { runId: string; resolutionKey: string | null; generatedKey: string | null }) {
  const [resolution, setResolution] = useState<V6AssetResolutionLog | null>(null);
  const [generated, setGenerated] = useState<V6AssetGenerationLog | null>(null);

  useEffect(() => {
    if (resolutionKey) {
      fetch(`/api/proxy/admin/runs/${runId}/artifacts?key=${encodeURIComponent(resolutionKey)}`)
        .then((r) => r.json()).then(setResolution).catch(() => {});
    }
    if (generatedKey) {
      fetch(`/api/proxy/admin/runs/${runId}/artifacts?key=${encodeURIComponent(generatedKey)}`)
        .then((r) => r.json()).then(setGenerated).catch(() => {});
    }
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

- [ ] **Step 6: SectionFinalCommands (executable plan)**

Create `apps/agent-admin/src/components/sections/SectionFinalCommands.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";

export function SectionFinalCommands({ runId, artifactKey }: { runId: string; artifactKey: string | null }) {
  const [data, setData] = useState<unknown | null>(null);
  useEffect(() => {
    if (!artifactKey) return;
    fetch(`/api/proxy/admin/runs/${runId}/artifacts?key=${encodeURIComponent(artifactKey)}`)
      .then((r) => r.json()).then(setData).catch(() => setData(null));
  }, [runId, artifactKey]);
  if (!data) return null;
  return (
    <section id="H" className="mb-8">
      <h2 className="text-base font-semibold mb-2">§H Executable Plan</h2>
      <pre className="bg-white border border-zinc-200 rounded p-3 text-xs max-h-96 overflow-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </section>
  );
}
```

- [ ] **Step 7: detail page 에 §G + §H 끼움**

```tsx
const resolutionKey = detail.artifactRefs.find((r) => r.kind === "v6-asset-resolution" && r.exists)?.key ?? null;
const generatedKey  = detail.artifactRefs.find((r) => r.kind === "v6-asset-generated" && r.exists)?.key ?? null;
const planKey       = detail.artifactRefs.find((r) => r.kind === "executable-plan" && r.exists)?.key ?? null;
// ...
<SectionAssetResolution runId={detail.run.runId} resolutionKey={resolutionKey} generatedKey={generatedKey} />
<SectionFinalCommands runId={detail.run.runId} artifactKey={planKey} />
```

- [ ] **Step 8: 모든 패키지 typecheck/build/test (V0 acceptance)**

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime
pnpm --filter @tooldi/agent-api typecheck && pnpm --filter @tooldi/agent-api test
pnpm --filter @tooldi/agent-worker typecheck && pnpm --filter @tooldi/agent-worker test
pnpm --filter @tooldi/agent-contracts test
pnpm --filter @tooldi/agent-admin build
pnpm --filter @tooldi/agent-admin lint
```

- [ ] **Step 9: Manual end-to-end (V0 acceptance)**

1. agent-api / agent-worker / agent-admin 셋 다 띄움
2. 한 run 발화 (overflow / RAG selection 다양한 카피)
3. `/admin/runs` 가 5s 안에 새 row 노출
4. 클릭 → §A user prompt + §B phase + §I events + §F HTML iframe + §G RAG grid (Gemini 발사 시 패널 포함) + §H executable plan 모두 보임
5. artifact 폴더에 `v6-asset-resolution.json` 존재
6. Gemini 발사 케이스 한 번 더 → `v6-asset-generated.json` 도 emit

- [ ] **Step 10: Commit**

```bash
git add apps/agent-worker apps/agent-admin
git commit -m "[feat] AGW result-dashboard — RAG capture worker + §G 후보/Gemini + §H executable plan"
```

---

## Self-Review

**1. Spec coverage (V0 한정):**

| V0 가치 | Task |
|---|---|
| 리스트 (5s polling, 필터 X) | Task 3 |
| 상세 §A 유저입력 / §B phase / §I events | Task 4 |
| §F HTML + render-quality | Task 5 |
| §G RAG 후보 + Gemini | Task 6 |
| §H executable plan | Task 6 |
| RAG capture artifact (best-effort) | Task 6 |
| `NODE_ENV !== 'production'` 가드 | Task 2 |
| 워커 회귀 0 (capture 실패해도 draft 정상) | Task 6 Step 3 신규 테스트 |

**2. V0 미포함 (V1 plan 에 있음):**
- annotation table / sticky bar / If-Match concurrency (Codex finding 5)
- SSE 라이브 + Last-Event-ID replay (Codex finding 3)
- starred / tag / status 필터
- §C interview / §D trend / §E brief

**3. 알려진 갭 (구현 시 grep 으로 정정):**
- `runs.userPrompt`, `runs.canvasWidth`, `runs.canvasHeight` 실제 컬럼명 → schema/runtime.ts 확인
- `runEvents` PK / phase / type / payload 컬럼명 동일
- `ObjectStoreClient.listObjects({ prefix })` 메서드 존재 여부 → 없으면 client 인터페이스 확장
- `debug-v6-html.json` 의 실제 shape (`.html` 필드?) → v6DebugHtmlPreview.ts 확인
- `appendEventTask` 호출 시그니처 → graphTasks.ts 확인
- `buildTestApp` / `createFakeWorkerCtx` 부재 시 helper 신규 작성

**4. Risks:**
- 외부 CDN srcUrl ↔ iframe sandbox CSP 충돌 → Task 6 Step 9 manual smoke 시 검증, 충돌 시 thumbnail proxy 추가
- RAG capture 실패는 warn 만 — 운영에서 capture 누락 빈도 모니터링 (V1 검토 시점에 alert 추가 여부 결정)
- v6 force-through 분기에서 resolver 호출 안 됨 → 그 경로의 capture 누락은 정상 동작 (V1 plan Open Risks 참조)

---

## Execution Handoff

**Plan saved:** `agent-workflow-test/docs/superpowers/plans/2026-05-08-agw-result-dashboard-v0.md`

**예상 분량:** 6 PR, ~1주 (1인 풀타임 기준).

**실행 옵션:**

1. **Subagent-Driven (recommended)** — task 마다 fresh subagent, 사이사이 review
2. **Inline** — 이 세션에서 task 별로

V0 끝나고 실제 사용해본 뒤 V1 (annotation/SSE/필터/추가 섹션) 필요한 것만 V1 plan 에서 골라 진행.

---

## Execution Status (2026-05-11)

V0 plan 실행 완료. 6 task → 10 commit + manual smoke ✓ (1 session, subagent-driven).

| Task | Status | Commits | Key adjustments |
|---|---|---|---|
| 1. Scaffold + admin contracts | ✅ | `ef945d7` [feat] + `ec54b0a` [refactor] | `RunStatusSchema` 재사용, artifact-kinds 10종, contracts 컨벤션 정렬 (IdentifierSchema/IsoDateTimeSchema + additionalProperties:false) |
| 2. admin endpoints + adminGuard + ArtifactDiscoveryService | ✅ | `afb62b5` [feat] + `72bbde3` [refactor] | `runs.userPrompt` → `runRequests.normalizedPrompt` join, canvasMeta from snapshot.json, `ObjectStoreClient.listObjects` 확장 (InMemory + Filesystem), `app.services` lift |
| 3. List page (5s polling) | ✅ | `1c9df18` [feat] + `c4f0443` [refactor] | StatusBadge 13값 매핑, `import "server-only"` 가드 |
| 4. Detail skeleton §A + §B + §I | ✅ | `e23390c` [feat] | `notFound()` 404 한정 (non-404 rethrow), `PhaseStatus = PhaseSummary["status"]` 재사용 |
| 5. §F HTML iframe + render-quality | ✅ | `015d240` [feat] + `62fe9f0` [refactor] | render-quality 빨강 = `blocking` 플래그 (worker 실제 emit 은 `severity: "info"\|"warn"`, plan 가정 정정), `V6RenderQualityReportSchema` 를 contracts 로 이관 |
| 6. RAG capture worker + §G + §H | ✅ | `dfcf667` [feat] | best-effort `persistArtifactTask` try/catch + `appendEventTask` warn (mirror unrestricted preview at `v6PipelineNode.ts:582-624`), `findArtifactKey` 헬퍼 5 call site 통합 |

**Tests:** 204/204 pass (contracts 3, persistence 4, agent-api 46, agent-worker 151).

**Manual smoke (2026-05-11):**
- `bash scripts/local-stack.sh restart stack` 으로 backend rebuild + restart → agent-api **port 3100** (local-stack 환경변수 override; design doc 의 3100 이 실제로 옳고, plan 의 "3000" ground-truth 메모는 V1 plan 의 `packages/config/src/env.ts` default 만 참조한 오해였음 — 운영 환경에서는 3100)
- `apps/agent-admin/.env.local` 에 `AGENT_API_INTERNAL_URL=http://localhost:3100` 설정
- `pnpm --filter @tooldi/agent-admin dev` → port 3200
- `http://localhost:3200/admin/runs` 정상 렌더, 시드 run `run-1` 노출, 상세 페이지 200 응답
- §F/§G/§H 데이터 채워진 화면 검증은 실제 v6 run 발사 후 (별 follow-up)

**Codex adversarial review 5 finding — V0 반영 상태:**

| # | Severity | Finding | V0 상태 |
|---|---|---|---|
| 1 | high | Admin status enum drift | ✅ 반영 — `RunStatusValues`/`TerminalRunStatusValues` 재사용 |
| 2 | high | Artifact key drift | ✅ 반영 — `AdminArtifactKindValues` 10종 + `AdminArtifactDiscoveryService` object-store list |
| 3 | high | SSE `Last-Event-ID` replay 미사용 | ⏸ V1 — V0 는 SSE 자체 미실시 (page reload 로 갱신) |
| 4 | medium | RAG capture 실패가 user run 실패로 전이 | ✅ 반영 — best-effort try/catch + warn event |
| 5 | medium | Annotation silent overwrite | ⏸ V1 — V0 는 annotation 자체 미실시 |

**V1 backlog (Minor 누적 — 운영하며 우선순위 결정):**

Type 안전성 / 에러 UX:
- typed `AdminApiError` (현재 `err.message.includes("admin api 404")` substring 매칭 — 1줄 fix)
- 일관된 error UX indicator (Task 3/5/6 fetch 들 silent fallback — last updated 표시 또는 red dot)
- page-level `error.tsx` (현재 Next default error UI)
- `SectionFinalCommands` 의 `unknown` 타입 → `ExecutablePlan` 명시

Repository / SQL:
- `AttemptSummary.finishedAt` 실제 채우기 (현재 hardcoded null)
- list endpoint 의 attempt COUNT 가 N+1 subquery → grouped join (50+ runs 시점)
- `AdminRunRepository` (300 lines) 의 phase derivation / canvas meta 추출

Patterns:
- adminApi `baseUrl` vs proxy `upstream` 명칭 통일
- fetch 패턴 통일 (polling vs one-shot 분기)
- `findArtifactKey` 헬퍼 unit test
- `<Link prefetch={false}>` on row link (50개 prefetch 비용)

Infra:
- `ObjectStoreClient.listObjects` S3 backend 구현 (현재 InMemory + Filesystem 만)
- `v6PipelineNode` 의 RAG capture 실패-continues-draft 자동화 테스트 (mirror pattern 도 untested — 공통 backlog)

V1 (annotation/SSE/필터/§C/§D/§E) 자체는 별 plan [`./2026-05-08-agw-admin-dashboard.md`](./2026-05-08-agw-admin-dashboard.md) 참조.
