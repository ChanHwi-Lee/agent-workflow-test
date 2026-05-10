import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import type { AdminRunsListResponse } from "@tooldi/agent-contracts";

import { buildTestApp } from "../../testHelpers.js";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

describe("GET /api/admin/runs", () => {
  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it("returns runs in created-at descending order with hasMore=false when count <= limit", async () => {
    process.env.NODE_ENV = "development";
    const ctx = await buildTestApp();
    try {
      const earlier = new Date(Date.now() - 10_000);
      const later = new Date(Date.now() - 1_000);
      await ctx.seedRun({
        runId: "run-old",
        status: "completed",
        prompt: "older prompt",
        createdAt: earlier,
      });
      await ctx.seedRun({
        runId: "run-new",
        status: "executing",
        prompt: "newer prompt",
        createdAt: later,
      });

      const res = await ctx.app.inject({ method: "GET", url: "/api/admin/runs" });
      assert.equal(res.statusCode, 200);
      const body = res.json() as AdminRunsListResponse;
      assert.equal(body.runs.length, 2);
      assert.equal(body.runs[0]!.runId, "run-new");
      assert.equal(body.runs[1]!.runId, "run-old");
      assert.equal(body.runs[0]!.attempts, 1);
      assert.equal(body.runs[0]!.promptPreview, "newer prompt");
      assert.equal(body.hasMore, false);
      assert.equal(body.nextBefore, null);
    } finally {
      await ctx.close();
    }
  });

  it("applies status filter", async () => {
    process.env.NODE_ENV = "development";
    const ctx = await buildTestApp();
    try {
      await ctx.seedRun({ runId: "run-completed", status: "completed" });
      await ctx.seedRun({ runId: "run-failed", status: "failed" });

      const res = await ctx.app.inject({
        method: "GET",
        url: "/api/admin/runs?status=failed",
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as AdminRunsListResponse;
      assert.equal(body.runs.length, 1);
      assert.equal(body.runs[0]!.runId, "run-failed");
    } finally {
      await ctx.close();
    }
  });

  it("returns hasMore=true and nextBefore when result exceeds limit", async () => {
    process.env.NODE_ENV = "development";
    const ctx = await buildTestApp();
    try {
      const base = Date.now();
      await ctx.seedRun({ runId: "run-a", createdAt: new Date(base - 3000) });
      await ctx.seedRun({ runId: "run-b", createdAt: new Date(base - 2000) });
      await ctx.seedRun({ runId: "run-c", createdAt: new Date(base - 1000) });

      const res = await ctx.app.inject({
        method: "GET",
        url: "/api/admin/runs?limit=2",
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as AdminRunsListResponse;
      assert.equal(body.runs.length, 2);
      assert.equal(body.hasMore, true);
      assert.ok(body.nextBefore);
    } finally {
      await ctx.close();
    }
  });

  it("returns 404 when NODE_ENV=production", async () => {
    process.env.NODE_ENV = "production";
    const ctx = await buildTestApp();
    try {
      const res = await ctx.app.inject({ method: "GET", url: "/api/admin/runs" });
      assert.equal(res.statusCode, 404);
    } finally {
      await ctx.close();
    }
  });
});
