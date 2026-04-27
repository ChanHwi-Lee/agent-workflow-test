import assert from "node:assert/strict";
import test from "node:test";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Logger } from "@tooldi/agent-observability";

import {
  insertInterviewRecord,
  type InterviewRecordInput,
} from "./interviewRecordsRepository.js";

interface RecordedWarn {
  message: string;
  fields?: Record<string, unknown> | undefined;
}

function createCollectingLogger(): {
  logger: Logger;
  warns: RecordedWarn[];
} {
  const warns: RecordedWarn[] = [];
  const logger: Logger = {
    level: "warn",
    child() {
      return logger;
    },
    debug() {},
    info() {},
    warn(message, fields) {
      warns.push({ message, fields: fields as Record<string, unknown> | undefined });
    },
    error() {},
  };
  return { logger, warns };
}

function buildBaseInput(): InterviewRecordInput {
  return {
    runId: "run_test_pm5",
    attemptSeq: 1,
    interview: {
      questions: [],
      answers: [],
    },
  } as InterviewRecordInput;
}

test("insertInterviewRecord forwards input to db.insert().values() on happy path", async () => {
  const valuesCalls: unknown[] = [];
  const insertCalls: unknown[] = [];
  const fakeDb = {
    insert(table: unknown) {
      insertCalls.push(table);
      return {
        async values(input: unknown) {
          valuesCalls.push(input);
        },
      };
    },
  } as unknown as NodePgDatabase;

  const { logger, warns } = createCollectingLogger();
  const input = buildBaseInput();

  await insertInterviewRecord(fakeDb, logger, input);

  assert.strictEqual(insertCalls.length, 1);
  assert.strictEqual(valuesCalls.length, 1);
  assert.deepStrictEqual(valuesCalls[0], input);
  assert.strictEqual(warns.length, 0);
});

test("insertInterviewRecord swallows db error and emits one logger.warn (best-effort)", async () => {
  const fakeDb = {
    insert() {
      return {
        async values() {
          throw new Error("db down");
        },
      };
    },
  } as unknown as NodePgDatabase;

  const { logger, warns } = createCollectingLogger();
  const input = buildBaseInput();

  await assert.doesNotReject(() =>
    insertInterviewRecord(fakeDb, logger, input),
  );

  assert.strictEqual(warns.length, 1);
  assert.strictEqual(
    warns[0]?.message,
    "interview_records best-effort insert failed",
  );
  assert.strictEqual(warns[0]?.fields?.runId, "run_test_pm5");
  assert.strictEqual(warns[0]?.fields?.attemptSeq, 1);
  assert.strictEqual(warns[0]?.fields?.error, "db down");
});

test("insertInterviewRecord stringifies non-Error throwables", async () => {
  const fakeDb = {
    insert() {
      return {
        async values() {
          throw "exotic-non-error";
        },
      };
    },
  } as unknown as NodePgDatabase;

  const { logger, warns } = createCollectingLogger();
  await insertInterviewRecord(fakeDb, logger, buildBaseInput());

  assert.strictEqual(warns.length, 1);
  assert.strictEqual(warns[0]?.fields?.error, "exotic-non-error");
});
