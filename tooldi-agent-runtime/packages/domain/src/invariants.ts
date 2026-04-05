export class InvariantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvariantViolationError";
  }
}

export function invariant(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new InvariantViolationError(message);
  }
}

export function assertNonEmptyString(
  value: string,
  fieldName: string,
): asserts value is string {
  invariant(value.trim().length > 0, `${fieldName} must be a non-empty string`);
}

export function assertPositiveInteger(
  value: number,
  fieldName: string,
): asserts value is number {
  invariant(
    Number.isInteger(value) && value > 0,
    `${fieldName} must be a positive integer`,
  );
}

export function assertNever(value: never, message?: string): never {
  throw new InvariantViolationError(
    message ?? `Unhandled discriminated union member: ${String(value)}`,
  );
}
