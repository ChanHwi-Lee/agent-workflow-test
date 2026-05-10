import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import type { AdminRunDetail } from "@tooldi/agent-contracts";

import { buildTestApp } from "../../testHelpers.js";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

describe("GET /api/admin/runs/:runId", () => {
  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it("returns 404 when run is missing", async () => {
    process.env.NODE_ENV = "development";
    const ctx = await buildTestApp();
    try {
      const res = await ctx.app.inject({
        method: "GET",
        url: "/api/admin/runs/missing",
      });
      assert.equal(res.statusCode, 404);
    } finally {
      await ctx.close();
    }
  });

  it("returns full detail payload with artifactRefs, recentEvents, userPromptFull, canvasMeta", async () => {
    process.env.NODE_ENV = "development";
    const ctx = await buildTestApp();
    try {
      const createdAt = new Date(Date.now() - 5_000);
      await ctx.seedRun({
        runId: "run-detail",
        status: "completed",
        prompt: "사용자 프롬프트 전체",
        canvasWidth: 1280,
        canvasHeight: 720,
        createdAt,
        attemptSeqs: [0, 1],
        artifactKeys: [
          "runs/run-detail/attempts/0/canonical-design-brief.json",
          "runs/run-detail/attempts/0/v6-trend-brief.json",
          "runs/run-detail/attempts/1/v6-render-quality-report-attempt-2.json",
          "runs/run-detail/attempts/1/ignore-me.json",
        ],
        events: [
          {
            type: "run.phase",
            phase: "planning",
            at: new Date(createdAt.getTime() + 1000).toISOString(),
          },
          {
            type: "run.phase",
            phase: "executing",
            at: new Date(createdAt.getTime() + 2000).toISOString(),
          },
          {
            type: "run.completed",
            at: new Date(createdAt.getTime() + 3000).toISOString(),
            extra: { result: { summary: "ok" } },
          },
        ],
      });

      const res = await ctx.app.inject({
        method: "GET",
        url: "/api/admin/runs/run-detail",
      });
      assert.equal(res.statusCode, 200, res.body);
      const detail = res.json() as AdminRunDetail;

      assert.equal(detail.run.runId, "run-detail");
      assert.equal(detail.run.status, "completed");
      assert.equal(detail.run.attempts, 2);
      assert.equal(detail.userPromptFull, "사용자 프롬프트 전체");
      assert.deepEqual(detail.canvasMeta, { width: 1280, height: 720 });
      assert.equal(detail.attempts.length, 2);
      assert.equal(detail.attempts[0]!.attemptSeq, 0);
      assert.equal(detail.attempts[1]!.attemptSeq, 1);

      // artifactRefs: 3 known artifacts (canonical-design-brief, v6-trend-brief,
      // v6-render-quality-report regex), unknown one skipped.
      assert.equal(detail.artifactRefs.length, 3);
      const kinds = detail.artifactRefs.map((ref) => ref.kind).sort();
      assert.deepEqual(kinds, [
        "canonical-design-brief",
        "v6-render-quality-report",
        "v6-trend-brief",
      ]);

      // recentEvents: 3 events in ascending time order.
      assert.equal(detail.recentEvents.length, 3);
      assert.equal(detail.recentEvents[0]!.type, "run.phase");
      assert.equal(detail.recentEvents[0]!.phase, "planning");
      assert.equal(detail.recentEvents[2]!.type, "run.completed");

      // phases derived from run.phase events.
      const phaseNames = detail.phases.map((p) => p.phase).sort();
      assert.deepEqual(phaseNames, ["executing", "planning"]);
    } finally {
      await ctx.close();
    }
  });

  it("returns 404 in production", async () => {
    process.env.NODE_ENV = "production";
    const ctx = await buildTestApp();
    try {
      const res = await ctx.app.inject({
        method: "GET",
        url: "/api/admin/runs/anything",
      });
      assert.equal(res.statusCode, 404);
    } finally {
      await ctx.close();
    }
  });
});
