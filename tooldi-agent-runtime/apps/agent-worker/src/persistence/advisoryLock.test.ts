import assert from "node:assert/strict";
import test from "node:test";

import type pg from "pg";

import { runWithAdvisoryLock } from "./advisoryLock.js";

interface FakeClientLog {
  readonly queries: Array<{ sql: string; params: ReadonlyArray<unknown> }>;
  released: boolean;
}

function buildFakePool(): { pool: pg.Pool; log: FakeClientLog } {
  const log: FakeClientLog = { queries: [], released: false };
  const fakePool = {
    async connect() {
      return {
        async query(sql: string, params: ReadonlyArray<unknown> = []) {
          log.queries.push({ sql, params });
          return { rows: [] };
        },
        release() {
          log.released = true;
        },
      };
    },
  };
  return { pool: fakePool as unknown as pg.Pool, log };
}

test("runWithAdvisoryLock issues lock+unlock and releases client on happy path", async () => {
  const { pool, log } = buildFakePool();

  const result = await runWithAdvisoryLock(pool, 728_491_201_001, async () => {
    return "ok";
  });

  assert.strictEqual(result, "ok");
  assert.strictEqual(log.queries.length, 2);
  assert.strictEqual(log.queries[0]?.sql, "SELECT pg_advisory_lock($1)");
  assert.deepStrictEqual(log.queries[0]?.params, [728_491_201_001]);
  assert.strictEqual(log.queries[1]?.sql, "SELECT pg_advisory_unlock($1)");
  assert.deepStrictEqual(log.queries[1]?.params, [728_491_201_001]);
  assert.strictEqual(log.released, true);
});

test("runWithAdvisoryLock unlocks and releases client even if fn throws", async () => {
  const { pool, log } = buildFakePool();

  await assert.rejects(
    () =>
      runWithAdvisoryLock(pool, 728_491_201_001, async () => {
        throw new Error("boom");
      }),
    /boom/,
  );

  assert.strictEqual(log.queries.length, 2);
  assert.strictEqual(log.queries[0]?.sql, "SELECT pg_advisory_lock($1)");
  assert.strictEqual(log.queries[1]?.sql, "SELECT pg_advisory_unlock($1)");
  assert.strictEqual(log.released, true);
});

test("runWithAdvisoryLock releases client even if unlock throws", async () => {
  const log: FakeClientLog = { queries: [], released: false };
  const fakePool = {
    async connect() {
      return {
        async query(sql: string, params: ReadonlyArray<unknown> = []) {
          log.queries.push({ sql, params });
          if (sql.includes("pg_advisory_unlock")) {
            throw new Error("unlock failed");
          }
          return { rows: [] };
        },
        release() {
          log.released = true;
        },
      };
    },
  } as unknown as pg.Pool;

  await assert.rejects(
    () => runWithAdvisoryLock(fakePool, 1, async () => "value"),
    /unlock failed/,
  );

  assert.strictEqual(log.released, true);
});
