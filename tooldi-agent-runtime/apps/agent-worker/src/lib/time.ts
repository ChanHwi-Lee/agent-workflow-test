export function now(): Date {
  return new Date();
}

export function toIsoDateTime(value: Date): string {
  return value.toISOString();
}

export async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
