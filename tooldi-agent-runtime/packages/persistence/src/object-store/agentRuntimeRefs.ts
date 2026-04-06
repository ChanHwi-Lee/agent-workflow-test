import type { ObjectStoreRef } from "./objectStoreClient.js";

const REQUEST_REF_PREFIX = "agent-run-request://";
const SNAPSHOT_REF_PREFIX = "agent-run-snapshot://";

export interface ResolvedAgentRuntimeRef {
  id: string;
  ref: ObjectStoreRef;
}

export function createRequestObjectRef(requestId: string): string {
  return `${REQUEST_REF_PREFIX}${requestId}`;
}

export function createSnapshotObjectRef(snapshotId: string): string {
  return `${SNAPSHOT_REF_PREFIX}${snapshotId}`;
}

export function getRequestObjectKey(requestId: string): string {
  return `requests/${requestId}/request.json`;
}

export function getSnapshotObjectKey(snapshotId: string): string {
  return `runs/${snapshotId}/snapshot.json`;
}

export function resolveRequestObjectRef(
  ref: string,
  bucket: string,
): ResolvedAgentRuntimeRef {
  const requestId = parseAgentRuntimeRef(ref, REQUEST_REF_PREFIX, "requestRef");
  return {
    id: requestId,
    ref: {
      bucket,
      key: getRequestObjectKey(requestId),
    },
  };
}

export function resolveSnapshotObjectRef(
  ref: string,
  bucket: string,
): ResolvedAgentRuntimeRef {
  const snapshotId = parseAgentRuntimeRef(ref, SNAPSHOT_REF_PREFIX, "snapshotRef");
  return {
    id: snapshotId,
    ref: {
      bucket,
      key: getSnapshotObjectKey(snapshotId),
    },
  };
}

function parseAgentRuntimeRef(
  ref: string,
  prefix: string,
  label: string,
): string {
  if (!ref.startsWith(prefix)) {
    throw new Error(`Unsupported ${label} format: ${ref}`);
  }

  const id = ref.slice(prefix.length);
  if (id.length === 0) {
    throw new Error(`Unsupported ${label} format: ${ref}`);
  }
  return id;
}
