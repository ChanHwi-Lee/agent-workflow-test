import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createObjectStoreClient } from "./objectStoreClient.js";

test("memory object store round-trips body and metadata", async () => {
  const objectStore = createObjectStoreClient({
    bucket: "bucket-test",
  });

  await objectStore.putObject({
    key: "requests/request-1/request.json",
    body: JSON.stringify({ hello: "world" }),
    contentType: "application/json",
    metadata: {
      traceId: "trace-1",
    },
  });

  const stored = await objectStore.getObject({
    bucket: "bucket-test",
    key: "requests/request-1/request.json",
  });

  assert.equal(new TextDecoder().decode(stored.body), '{"hello":"world"}');
  assert.equal(stored.contentType, "application/json");
  assert.deepEqual(stored.metadata, {
    traceId: "trace-1",
  });
});

test("memory object store listObjects filters by prefix", async () => {
  const objectStore = createObjectStoreClient({ bucket: "list-test" });

  await objectStore.putObject({
    key: "runs/r1/attempts/0/canonical-design-brief.json",
    body: "{}",
    contentType: "application/json",
  });
  await objectStore.putObject({
    key: "runs/r1/attempts/0/v6-trend-brief.json",
    body: "{}",
    contentType: "application/json",
  });
  await objectStore.putObject({
    key: "runs/r2/attempts/0/canonical-design-brief.json",
    body: "{}",
    contentType: "application/json",
  });

  const listed = await objectStore.listObjects({ prefix: "runs/r1/attempts/0/" });
  const keys = listed.map((entry) => entry.key).sort();
  assert.deepEqual(keys, [
    "runs/r1/attempts/0/canonical-design-brief.json",
    "runs/r1/attempts/0/v6-trend-brief.json",
  ]);
});

test("filesystem object store listObjects ignores .meta.json sidecars", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "tooldi-agent-runtime-object-store-list-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const objectStore = createObjectStoreClient({
    bucket: "bucket-list",
    mode: "filesystem",
    rootDir,
    prefix: "runtime-test",
  });

  await objectStore.putObject({
    key: "runs/r9/attempts/0/canonical-design-brief.json",
    body: "{}",
    contentType: "application/json",
  });

  const listed = await objectStore.listObjects({ prefix: "runs/r9/attempts/0/" });
  assert.deepEqual(
    listed.map((entry) => entry.key),
    ["runs/r9/attempts/0/canonical-design-brief.json"],
  );
});

test("filesystem object store is readable across client instances", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "tooldi-agent-runtime-object-store-"));
  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const writer = createObjectStoreClient({
    bucket: "bucket-test",
    mode: "filesystem",
    rootDir,
    prefix: "runtime-test",
  });
  const reader = createObjectStoreClient({
    bucket: "bucket-test",
    mode: "filesystem",
    rootDir,
    prefix: "runtime-test",
  });

  await writer.putObject({
    key: "runs/run-1/snapshot.json",
    body: JSON.stringify({ pageId: "page-1" }),
    contentType: "application/json",
    metadata: {
      ref: "agent-run-snapshot://run-1",
    },
  });

  const stored = await reader.getObject({
    bucket: "bucket-test",
    key: "runs/run-1/snapshot.json",
  });
  assert.equal(new TextDecoder().decode(stored.body), '{"pageId":"page-1"}');
  assert.equal(stored.contentType, "application/json");
  assert.deepEqual(stored.metadata, {
    ref: "agent-run-snapshot://run-1",
  });

  const rawMetadata = await readFile(
    join(
      rootDir,
      "bucket-test",
      "runtime-test",
      "runs/run-1/snapshot.json.meta.json",
    ),
    "utf8",
  );
  assert.match(rawMetadata, /agent-run-snapshot:\/\/run-1/);
});

