export {
  createAttemptId,
  createHttpRequestId,
  createQueueJobId,
  createRequestId,
  createRunId,
  createTraceId,
} from "@tooldi/agent-domain";
export {
  createRequestObjectRef,
  createSnapshotObjectRef as createSnapshotRef,
} from "@tooldi/agent-persistence";

export function createPageLockToken(runId: string, pageId: string): string {
  return `page_lock_${pageId}_${runId}`;
}

export function createCancelToken(runId: string): string {
  return `cancel_${runId}`;
}
