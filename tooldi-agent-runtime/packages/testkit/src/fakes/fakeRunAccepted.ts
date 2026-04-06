import type { RunAccepted } from "@tooldi/agent-contracts";

export function createFakeRunAccepted(
  overrides: Partial<RunAccepted> = {},
): RunAccepted {
  return {
    runId: "run_accepted_1",
    traceId: "trace_accepted_1",
    status: "queued",
    startedAt: new Date().toISOString(),
    deadlineAt: new Date(Date.now() + 120000).toISOString(),
    streamUrl: "/api/agent-workflow/runs/run_accepted_1/events",
    cancelUrl: "/api/agent-workflow/runs/run_accepted_1/cancel",
    mutationAckUrl: "/api/agent-workflow/runs/run_accepted_1/mutation-acks",
    ...overrides,
  };
}
