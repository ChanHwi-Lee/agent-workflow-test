export function toDate(value: string): Date {
  return new Date(value);
}

export function toNullableDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

export function toIso(value: Date): string {
  return value.toISOString();
}

export function toNullableIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
