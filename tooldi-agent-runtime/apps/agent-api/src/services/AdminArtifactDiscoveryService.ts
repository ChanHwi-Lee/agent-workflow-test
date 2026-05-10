import path from "node:path";

import {
  AdminArtifactFilenameByKind,
  AdminArtifactKindValues,
  type AdminArtifactKind,
  type ArtifactRef,
} from "@tooldi/agent-contracts";
import type { ObjectStoreClient } from "@tooldi/agent-persistence";

const FILENAME_TO_KIND: ReadonlyMap<string, AdminArtifactKind> = (() => {
  const map = new Map<string, AdminArtifactKind>();
  for (const kind of AdminArtifactKindValues) {
    map.set(AdminArtifactFilenameByKind[kind], kind);
  }
  return map;
})();

const PER_ATTEMPT_PATTERNS: ReadonlyArray<readonly [RegExp, AdminArtifactKind]> = [
  [/^v6-render-quality-report-attempt-\d+\.json$/, "v6-render-quality-report"],
  [/^v6-render-quality-failure-attempt-\d+\.json$/, "v6-render-quality-failure"],
];

export class AdminArtifactDiscoveryService {
  constructor(private readonly objectStore: ObjectStoreClient) {}

  async listForRun(
    runId: string,
    attemptSeqs: readonly number[],
  ): Promise<ArtifactRef[]> {
    const refs: ArtifactRef[] = [];
    for (const attemptSeq of attemptSeqs) {
      const prefix = `runs/${runId}/attempts/${attemptSeq}/`;
      const objects = await this.objectStore.listObjects({ prefix });
      for (const object of objects) {
        const filename = path.basename(object.key);
        const kind = this.classify(filename);
        if (!kind) {
          continue;
        }
        refs.push({
          kind,
          key: object.key,
          attemptSeq,
          exists: true,
        });
      }
    }
    return refs;
  }

  private classify(filename: string): AdminArtifactKind | null {
    const direct = FILENAME_TO_KIND.get(filename);
    if (direct) {
      return direct;
    }
    for (const [pattern, kind] of PER_ATTEMPT_PATTERNS) {
      if (pattern.test(filename)) {
        return kind;
      }
    }
    return null;
  }
}
