export const attemptStates = [
  "enqueued",
  "dequeued",
  "hydrating",
  "running",
  "awaiting_ack",
  "retry_waiting",
  "finalizing",
  "succeeded",
  "failed",
  "cancel_requested",
  "cancelled",
] as const;

export type AttemptState = (typeof attemptStates)[number];

export const terminalAttemptStates = [
  "succeeded",
  "failed",
  "cancelled",
] as const satisfies readonly AttemptState[];

export type TerminalAttemptState = (typeof terminalAttemptStates)[number];

const terminalAttemptStateSet = new Set<AttemptState>(terminalAttemptStates);

export function isAttemptState(value: string): value is AttemptState {
  return attemptStates.includes(value as AttemptState);
}

export function isTerminalAttemptState(
  state: AttemptState,
): state is TerminalAttemptState {
  return terminalAttemptStateSet.has(state);
}
