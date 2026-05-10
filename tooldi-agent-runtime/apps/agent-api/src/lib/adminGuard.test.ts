import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";

import { adminGuard } from "./adminGuard.js";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

describe("adminGuard", () => {
  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it("returns 404 for /api/admin/* when NODE_ENV=production", async () => {
    process.env.NODE_ENV = "production";
    const app = Fastify();
    app.addHook("onRequest", adminGuard);
    app.get("/api/admin/x", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/api/admin/x" });
    assert.equal(res.statusCode, 404);
    await app.close();
  });

  it("passes through /api/admin/* when NODE_ENV=development", async () => {
    process.env.NODE_ENV = "development";
    const app = Fastify();
    app.addHook("onRequest", adminGuard);
    app.get("/api/admin/x", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/api/admin/x" });
    assert.equal(res.statusCode, 200);
    await app.close();
  });

  it("does not block non-admin routes in production", async () => {
    process.env.NODE_ENV = "production";
    const app = Fastify();
    app.addHook("onRequest", adminGuard);
    app.get("/api/public/x", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/api/public/x" });
    assert.equal(res.statusCode, 200);
    await app.close();
  });
});
