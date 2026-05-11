import { and, asc, desc, eq, lt, sql } from "drizzle-orm";

import {
  type AdminRunDetail,
  type AdminRunSummary,
  type AdminRunsListResponse,
  type ArtifactRef,
  type PhaseSummary,
  type PublicRunEvent,
  type RunEventSnapshot,
  type RunStatus,
} from "@tooldi/agent-contracts";
import {
  getSnapshotObjectKey,
  runAttempts,
  runEvents,
  runRequests,
  runs,
  type ObjectStoreClient,
  type PgClient,
} from "@tooldi/agent-persistence";

import type { AdminArtifactDiscoveryService } from "../services/AdminArtifactDiscoveryService.js";

export interface AdminRunListParams {
  limit?: number;
  status?: string;
  before?: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const PROMPT_PREVIEW_MAX = 120;
const RECENT_EVENTS_LIMIT = 200;

const PHASE_STATUS_VALUES = ["pending", "running", "ok", "fail"] as const;
type PhaseStatus = (typeof PHASE_STATUS_VALUES)[number];

export interface AdminRunRepositoryDeps {
  pg: PgClient;
  objectStore: ObjectStoreClient;
  objectStoreBucket: string;
  artifactDiscovery: AdminArtifactDiscoveryService;
}

export class AdminRunRepository {
  private readonly pg: PgClient;
  private readonly objectStore: ObjectStoreClient;
  private readonly objectStoreBucket: string;
  private readonly artifactDiscovery: AdminArtifactDiscoveryService;

  constructor(deps: AdminRunRepositoryDeps) {
    this.pg = deps.pg;
    this.objectStore = deps.objectStore;
    this.objectStoreBucket = deps.objectStoreBucket;
    this.artifactDiscovery = deps.artifactDiscovery;
  }

  async list(params: AdminRunListParams): Promise<AdminRunsListResponse> {
    const limit = clampLimit(params.limit ?? DEFAULT_LIMIT);
    const conditions = [] as ReturnType<typeof eq>[];
    if (params.status) {
      conditions.push(eq(runs.status, params.status));
    }
    if (params.before) {
      conditions.push(lt(runs.createdAt, new Date(params.before)));
    }

    const rows = await this.pg.db
      .select({
        runId: runs.runId,
        status: runs.status,
        createdAt: runs.createdAt,
        normalizedPrompt: runRequests.normalizedPrompt,
        attemptCount: sql<number>`COALESCE(
          (SELECT COUNT(${runAttempts.attemptSeq})
           FROM ${runAttempts}
           WHERE ${runAttempts.runId} = ${runs.runId}),
          0
        )`.as("attempt_count"),
      })
      .from(runs)
      .leftJoin(runRequests, eq(runRequests.requestId, runs.requestId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(runs.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;

    const summaries: AdminRunSummary[] = sliced.map((row) => ({
      runId: row.runId,
      status: row.status as RunStatus,
      createdAt: row.createdAt.toISOString(),
      attempts: Number(row.attemptCount ?? 0),
      promptPreview: previewPrompt(row.normalizedPrompt),
    }));

    return {
      runs: summaries,
      hasMore,
      nextBefore:
        hasMore && summaries.length > 0
          ? summaries[summaries.length - 1]!.createdAt
          : null,
    };
  }

  async getDetail(runId: string): Promise<AdminRunDetail | null> {
    const [runRow] = await this.pg.db
      .select({
        runId: runs.runId,
        status: runs.status,
        createdAt: runs.createdAt,
        snapshotRef: runs.snapshotRef,
        normalizedPrompt: runRequests.normalizedPrompt,
      })
      .from(runs)
      .leftJoin(runRequests, eq(runRequests.requestId, runs.requestId))
      .where(eq(runs.runId, runId))
      .limit(1);

    if (!runRow) {
      return null;
    }

    const attemptRows = await this.pg.db
      .select({
        attemptSeq: runAttempts.attemptSeq,
        attemptState: runAttempts.attemptState,
        startedAt: runAttempts.startedAt,
        createdAt: runAttempts.createdAt,
      })
      .from(runAttempts)
      .where(eq(runAttempts.runId, runId))
      .orderBy(asc(runAttempts.attemptSeq));

    const eventRows = await this.pg.db
      .select({
        eventId: runEvents.eventId,
        event: runEvents.event,
        recordedAt: runEvents.recordedAt,
      })
      .from(runEvents)
      .where(eq(runEvents.runId, runId))
      .orderBy(desc(runEvents.eventId))
      .limit(RECENT_EVENTS_LIMIT);

    const eventsAscending = [...eventRows].reverse();
    const recentEvents: RunEventSnapshot[] = eventsAscending.map((row) =>
      toEventSnapshot(row.eventId, row.event, row.recordedAt),
    );

    const phases = derivePhases(eventsAscending.map((row) => row.event));

    const attemptSeqs = attemptRows.map((row) => row.attemptSeq);
    const artifactRefs: ArtifactRef[] =
      attemptSeqs.length > 0
        ? await this.artifactDiscovery.listForRun(runId, attemptSeqs)
        : [];

    const canvasMeta = await this.loadCanvasMeta(runId);

    const summary: AdminRunSummary = {
      runId: runRow.runId,
      status: runRow.status as RunStatus,
      createdAt: runRow.createdAt.toISOString(),
      attempts: attemptRows.length,
      promptPreview: previewPrompt(runRow.normalizedPrompt),
    };

    return {
      run: summary,
      userPromptFull: runRow.normalizedPrompt ?? "",
      canvasMeta,
      attempts: attemptRows.map((row) => ({
        attemptSeq: row.attemptSeq,
        status: row.attemptState,
        startedAt: (row.startedAt ?? row.createdAt).toISOString(),
        finishedAt: null,
      })),
      phases,
      artifactRefs,
      recentEvents,
    };
  }

  private async loadCanvasMeta(runId: string): Promise<{ width: number; height: number }> {
    const snapshotKey = getSnapshotObjectKey(runId);
    try {
      const stored = await this.objectStore.getObject({
        bucket: this.objectStoreBucket,
        key: snapshotKey,
      });
      const text = new TextDecoder().decode(stored.body);
      const parsed = JSON.parse(text) as {
        editorContext?: { canvasWidth?: unknown; canvasHeight?: unknown };
      };
      const width = toNonNegativeInteger(parsed.editorContext?.canvasWidth);
      const height = toNonNegativeInteger(parsed.editorContext?.canvasHeight);
      return { width, height };
    } catch {
      return { width: 0, height: 0 };
    }
  }
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

function previewPrompt(prompt: string | null | undefined): string {
  if (!prompt) {
    return "";
  }
  return prompt.slice(0, PROMPT_PREVIEW_MAX);
}

function toEventSnapshot(
  eventId: number,
  event: PublicRunEvent,
  recordedAt: Date,
): RunEventSnapshot {
  const phase = "phase" in event && typeof event.phase === "string" ? event.phase : "";
  const at = "at" in event && typeof event.at === "string" ? event.at : recordedAt.toISOString();
  return {
    id: String(eventId),
    phase,
    type: event.type,
    at,
    data: event,
  };
}

interface PhaseAccumulator {
  startedAt: string | null;
  finishedAt: string | null;
  count: number;
}

function derivePhases(events: readonly PublicRunEvent[]): PhaseSummary[] {
  const byPhase = new Map<string, PhaseAccumulator>();
  let lastPhase: string | null = null;
  let terminalStatus: "ok" | "fail" | null = null;

  for (const event of events) {
    if (event.type === "run.phase") {
      const phase = event.phase;
      lastPhase = phase;
      const acc =
        byPhase.get(phase) ??
        ({ startedAt: null, finishedAt: null, count: 0 } satisfies PhaseAccumulator);
      acc.count += 1;
      if (!acc.startedAt) {
        acc.startedAt = event.at;
      }
      acc.finishedAt = event.at;
      byPhase.set(phase, acc);
    } else if (event.type === "run.completed") {
      terminalStatus = "ok";
    } else if (event.type === "run.failed" || event.type === "run.cancelled") {
      terminalStatus = "fail";
    }
  }

  const phases: PhaseSummary[] = [];
  for (const [phase, acc] of byPhase.entries()) {
    let status: PhaseStatus;
    if (phase === lastPhase && terminalStatus === null) {
      status = "running";
    } else if (terminalStatus === "fail" && phase === lastPhase) {
      status = "fail";
    } else {
      status = "ok";
    }
    phases.push({
      phase,
      status,
      startedAt: acc.startedAt,
      finishedAt: acc.finishedAt,
    });
  }
  return phases;
}

function toNonNegativeInteger(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 0;
}
