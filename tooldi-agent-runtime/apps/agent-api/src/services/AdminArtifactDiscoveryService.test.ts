import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type {
  ListObjectsRequest,
  ListedObject,
  ObjectStoreClient,
} from "@tooldi/agent-persistence";

import { AdminArtifactDiscoveryService } from "./AdminArtifactDiscoveryService.js";

class FakeObjectStore implements Pick<ObjectStoreClient, "listObjects"> {
  constructor(public readonly keys: string[]) {}

  async listObjects(request: ListObjectsRequest): Promise<ListedObject[]> {
    return this.keys
      .filter((key) => key.startsWith(request.prefix))
      .map((key) => ({ key }));
  }
}

describe("AdminArtifactDiscoveryService", () => {
  it("classifies real-emit artifact filenames + per-attempt regex variants, and skips unknown filenames", async () => {
    const fake = new FakeObjectStore([
      "runs/r1/attempts/0/brief-compilation-report.json",
      "runs/r1/attempts/0/canonical-design-brief.json",
      "runs/r1/attempts/0/v6-trend-brief.json",
      "runs/r1/attempts/0/debug-v6-html.json",
      "runs/r1/attempts/0/debug-unrestricted-html.json",
      "runs/r1/attempts/0/v6-render-quality-report.json",
      "runs/r1/attempts/0/v6-render-quality-report-attempt-2.json",
      "runs/r1/attempts/0/v6-render-quality-failure-attempt-1.json",
      "runs/r1/attempts/0/executable-plan.json",
      "runs/r1/attempts/0/v6-asset-resolution.json",
      "runs/r1/attempts/0/v6-asset-generated.json",
      "runs/r1/attempts/0/random-unknown.json",
      "runs/r1/attempts/0/snapshot.json",
    ]);
    const service = new AdminArtifactDiscoveryService(fake as unknown as ObjectStoreClient);

    const refs = await service.listForRun("r1", [0]);
    const kinds = refs.map((ref) => ref.kind).sort();

    assert.deepEqual(kinds, [
      "brief-compilation-report",
      "canonical-design-brief",
      "debug-unrestricted-html-preview",
      "debug-v6-html-preview",
      "executable-plan",
      "v6-asset-generated",
      "v6-asset-resolution",
      "v6-render-quality-failure",
      "v6-render-quality-report",
      "v6-render-quality-report",
      "v6-trend-brief",
    ]);

    for (const ref of refs) {
      assert.equal(ref.attemptSeq, 0);
      assert.equal(ref.exists, true);
      assert.match(ref.key, /^runs\/r1\/attempts\/0\//);
    }
  });

  it("walks through multiple attempts independently", async () => {
    const fake = new FakeObjectStore([
      "runs/r1/attempts/0/canonical-design-brief.json",
      "runs/r1/attempts/1/canonical-design-brief.json",
      "runs/r1/attempts/1/v6-render-quality-failure-attempt-2.json",
    ]);
    const service = new AdminArtifactDiscoveryService(fake as unknown as ObjectStoreClient);

    const refs = await service.listForRun("r1", [0, 1]);
    const seqs = refs.map((ref) => ref.attemptSeq).sort();
    assert.deepEqual(seqs, [0, 1, 1]);
  });

  it("returns empty list when no objects match", async () => {
    const fake = new FakeObjectStore([]);
    const service = new AdminArtifactDiscoveryService(fake as unknown as ObjectStoreClient);
    const refs = await service.listForRun("nothing", [0]);
    assert.deepEqual(refs, []);
  });
});
