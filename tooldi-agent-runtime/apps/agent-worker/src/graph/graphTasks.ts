import { task } from "@langchain/langgraph";
import type { ObjectStoreClient } from "@tooldi/agent-persistence";

import type { BackendCallbackClient } from "../clients/backendCallbackClient.js";
import type { RunJobGraphDependencies } from "./runJobGraphTypes.js";

export function createRunJobGraphTasks(dependencies: RunJobGraphDependencies) {
  return {
    heartbeatTask: task(
      "worker_heartbeat",
      async (
        runId: string,
        payload: Parameters<BackendCallbackClient["heartbeat"]>[1],
      ) => dependencies.callbackClient.heartbeat(runId, payload),
    ),
    appendEventTask: task(
      "worker_append_event",
      async (
        runId: string,
        payload: Parameters<BackendCallbackClient["appendEvent"]>[1],
      ) => dependencies.callbackClient.appendEvent(runId, payload),
    ),
    waitMutationAckTask: task(
      "worker_wait_mutation_ack",
      async (
        runId: string,
        mutationId: string,
        payload: Parameters<BackendCallbackClient["waitMutationAck"]>[2],
      ) =>
        dependencies.callbackClient.waitMutationAck(runId, mutationId, payload),
    ),
    finalizeTask: task(
      "worker_finalize",
      async (
        runId: string,
        payload: Parameters<BackendCallbackClient["finalize"]>[1],
      ) => dependencies.callbackClient.finalize(runId, payload),
    ),
    persistArtifactTask: task(
      "worker_persist_json_artifact",
      async (
        key: string,
        payload: unknown,
        metadata: Record<string, string>,
      ) => persistWorkerJsonArtifact(dependencies.objectStore, key, payload, metadata),
    ),
  };
}

export async function persistWorkerJsonArtifact(
  objectStore: ObjectStoreClient,
  key: string,
  payload: unknown,
  metadata: Record<string, string>,
): Promise<string> {
  await objectStore.putObject({
    key,
    body: JSON.stringify(payload),
    contentType: "application/json",
    metadata,
  });
  return key;
}

export async function readWorkerJsonArtifact<T>(
  objectStore: ObjectStoreClient,
  bucket: string,
  key: string,
  parser?: (value: unknown) => T,
): Promise<T> {
  const stored = await objectStore.getObject({
    bucket,
    key,
  });
  const json = new TextDecoder().decode(stored.body);
  const parsed = JSON.parse(json) as unknown;
  return parser ? parser(parsed) : (parsed as T);
}
