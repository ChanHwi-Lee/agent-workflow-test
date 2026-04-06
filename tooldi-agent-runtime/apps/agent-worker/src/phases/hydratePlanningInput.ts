import type {
  RunJobEnvelope,
  StartAgentWorkflowRunRequest,
} from "@tooldi/agent-contracts";
import {
  resolveRequestObjectRef,
  resolveSnapshotObjectRef,
  type ObjectStoreClient,
  type ObjectStoreRef,
} from "@tooldi/agent-persistence";

import type { HydratedPlanningInput, StoredRunSnapshot } from "../types.js";

export interface HydratePlanningInputDependencies {
  objectStore: ObjectStoreClient;
  objectStoreBucket: string;
}

export async function hydratePlanningInput(
  job: RunJobEnvelope,
  dependencies: HydratePlanningInputDependencies,
): Promise<HydratedPlanningInput> {
  const requestRef = resolveRequestObjectRef(
    job.requestRef,
    dependencies.objectStoreBucket,
  );
  const snapshotRef = resolveSnapshotObjectRef(
    job.snapshotRef,
    dependencies.objectStoreBucket,
  );

  const request = await readJsonObject<StartAgentWorkflowRunRequest>(
    dependencies.objectStore,
    requestRef.ref,
  );
  const snapshot = await readJsonObject<StoredRunSnapshot>(
    dependencies.objectStore,
    snapshotRef.ref,
  );

  return {
    job,
    request,
    snapshot,
    requestRef: job.requestRef,
    snapshotRef: job.snapshotRef,
  };
}

async function readJsonObject<T>(
  objectStore: ObjectStoreClient,
  ref: ObjectStoreRef,
): Promise<T> {
  const stored = await objectStore.getObject(ref);
  const json = new TextDecoder().decode(stored.body);
  return JSON.parse(json) as T;
}
