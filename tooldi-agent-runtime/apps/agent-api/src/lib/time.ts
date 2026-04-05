export function now(): Date {
  return new Date();
}

export function toIsoDateTime(value: Date): string {
  return value.toISOString();
}

export function addMilliseconds(base: Date, milliseconds: number): Date {
  return new Date(base.getTime() + milliseconds);
}
