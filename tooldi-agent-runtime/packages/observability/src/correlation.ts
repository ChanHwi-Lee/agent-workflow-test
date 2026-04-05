export interface WorkflowCorrelation {
  httpRequestId?: string;
  requestId?: string;
  runId?: string;
  traceId?: string;
  attemptId?: string;
  attemptSeq?: number;
  queueJobId?: string;
  plannerSpanId?: string;
  executorSpanId?: string;
  toolCallId?: string;
  mutationId?: string;
  saveReceiptId?: string;
}

export function mergeCorrelation(
  base: WorkflowCorrelation,
  patch: WorkflowCorrelation,
): WorkflowCorrelation {
  const merged: WorkflowCorrelation = { ...base };

  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      merged[key as keyof WorkflowCorrelation] = value as never;
    }
  }

  return merged;
}

export function correlationToLogFields(
  correlation: WorkflowCorrelation,
): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(correlation).filter((entry): entry is [string, string | number] => {
      const value = entry[1];
      return typeof value === "string" || typeof value === "number";
    }),
  );
}
