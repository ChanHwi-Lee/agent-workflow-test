import { randomUUID } from "node:crypto";

export type SpanAttributes = Record<string, string | number | boolean | null | undefined>;

export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  startedAt: string;
  attributes: SpanAttributes;
}

export interface CompletedSpan extends SpanContext {
  endedAt: string;
  durationMs: number;
  status: "ok" | "error";
  errorMessage: string | null;
}

export interface StartSpanOptions {
  traceId?: string;
  parentSpanId?: string | null;
  startedAt?: Date;
  attributes?: SpanAttributes;
}

export interface FinishSpanOptions {
  endedAt?: Date;
  errorMessage?: string | null;
}

export function createTraceId(): string {
  return randomUUID();
}

export function createSpanId(): string {
  return randomUUID().replaceAll("-", "").slice(0, 16);
}

export function startSpan(
  name: string,
  options: StartSpanOptions = {},
): SpanContext {
  return {
    traceId: options.traceId ?? createTraceId(),
    spanId: createSpanId(),
    parentSpanId: options.parentSpanId ?? null,
    name,
    startedAt: (options.startedAt ?? new Date()).toISOString(),
    attributes: options.attributes ?? {},
  };
}

export function finishSpan(
  span: SpanContext,
  options: FinishSpanOptions = {},
): CompletedSpan {
  const endedAt = options.endedAt ?? new Date();
  const startedAt = new Date(span.startedAt);
  return {
    ...span,
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    status: options.errorMessage ? "error" : "ok",
    errorMessage: options.errorMessage ?? null,
  };
}
