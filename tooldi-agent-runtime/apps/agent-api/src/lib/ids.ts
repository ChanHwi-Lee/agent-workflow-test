export {
  createAttemptId,
  createHttpRequestId,
  createQueueJobId,
  createRequestId,
  createRunId,
  createTraceId,
} from "@tooldi/agent-domain";

export function createPageLockToken(runId: string, pageId: string): string {
  return `page_lock_${pageId}_${runId}`;
}

export function createCancelToken(runId: string): string {
  return `cancel_${runId}`;
}

export function createRequestObjectRef(requestId: string): string {
  return `request_ref_${requestId}`;
}

export function createSnapshotRef(runId: string): string {
  return `snapshot_ref_${runId}`;
}
