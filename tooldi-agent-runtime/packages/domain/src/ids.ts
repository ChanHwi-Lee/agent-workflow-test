import { randomUUID } from "node:crypto";

import { assertNonEmptyString, assertPositiveInteger, invariant } from "./invariants.js";

export interface IdGenerationOptions {
  clock?: () => Date;
  randomValue?: () => string;
}

export interface QueueJobIdInput {
  runId: string;
  attemptSeq: number;
}

function pad(value: number, width: number): string {
  return value.toString().padStart(width, "0");
}

function timestampFragment(date: Date): string {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1, 2),
    pad(date.getUTCDate(), 2),
  ].join("") + `_${pad(date.getUTCHours(), 2)}${pad(date.getUTCMinutes(), 2)}${pad(date.getUTCSeconds(), 2)}_${pad(date.getUTCMilliseconds(), 3)}`;
}

function entropyFragment(randomValue: () => string): string {
  return randomValue().replaceAll("-", "").slice(0, 8).toLowerCase();
}

function createPrefixedId(
  prefix: string,
  options: IdGenerationOptions = {},
): string {
  const clock = options.clock ?? (() => new Date());
  const randomValue = options.randomValue ?? randomUUID;
  return `${prefix}_${timestampFragment(clock())}_${entropyFragment(randomValue)}`;
}

export function createHttpRequestId(
  options?: IdGenerationOptions,
): string {
  return createPrefixedId("http_req", options);
}

export function createRequestId(options?: IdGenerationOptions): string {
  return createPrefixedId("req", options);
}

export function createRunId(options?: IdGenerationOptions): string {
  return createPrefixedId("run", options);
}

export function createAttemptId(options?: IdGenerationOptions): string {
  return createPrefixedId("attempt", options);
}

export function createTraceId(): string {
  return randomUUID();
}

export function createQueueJobId(input: QueueJobIdInput): string {
  assertNonEmptyString(input.runId, "runId");
  assertPositiveInteger(input.attemptSeq, "attemptSeq");
  invariant(
    !input.runId.includes(":"),
    "runId must not contain ':' because BullMQ custom job ids are colon-free",
  );
  return `${input.runId}__attempt_${input.attemptSeq}`;
}
