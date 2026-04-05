export const workflowPhases = [
  "bootstrap",
  "planning",
  "hydration",
  "execution",
  "awaitingApplyAck",
  "saving",
  "finalizing",
  "recovery",
] as const;

export type WorkflowPhase = (typeof workflowPhases)[number];

export function isWorkflowPhase(value: string): value is WorkflowPhase {
  return workflowPhases.includes(value as WorkflowPhase);
}
