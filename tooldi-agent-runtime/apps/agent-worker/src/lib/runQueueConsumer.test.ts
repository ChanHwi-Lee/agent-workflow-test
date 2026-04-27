import assert from "node:assert/strict";
import test from "node:test";

import type { RunJobEnvelope } from "@tooldi/agent-contracts";
import type { Logger } from "@tooldi/agent-observability";

import { InterviewPendingError } from "../jobs/processRunJob.js";
import { processRunExecuteQueueJob } from "./runQueueConsumer.js";

class RecordingLogger implements Logger {
  readonly level = "debug" as const;
  readonly records: Array<{ message: string; fields?: Record<string, unknown> }> = [];

  child(): Logger {
    return this;
  }

  debug(): void {}

  info(message: string, fields?: Record<string, unknown>): void {
    this.records.push({
      message,
      ...(fields ? { fields } : {}),
    });
  }

  warn(): void {}

  error(): void {}
}

test("run.execute는 인터뷰 대기 interrupt를 queue 실패로 전파하지 않는다", async () => {
  const logger = new RecordingLogger();
  const payload = { runId: "run-1" } as RunJobEnvelope;
  let callCount = 0;

  await processRunExecuteQueueJob(payload, {
    logger,
    async processRunJob() {
      callCount += 1;
      throw new InterviewPendingError({
        type: "interview.awaiting",
        runId: "run-1",
        questions: [
          {
            id: "tone",
            title: "어떤 톤을 원하나요?",
            type: "single_choice",
            choices: ["밝게", "차분하게"],
            allow_other: false,
          },
        ],
        timeoutMs: 300_000,
      });
    },
  });

  assert.equal(callCount, 1);
  assert.equal(logger.records.length, 1);
  assert.equal(logger.records[0]?.fields?.runId, "run-1");
  assert.equal(logger.records[0]?.fields?.questionCount, 1);
});

test("run.execute는 일반 실행 오류를 기존처럼 queue 실패로 전파한다", async () => {
  const logger = new RecordingLogger();
  const payload = { runId: "run-1" } as RunJobEnvelope;

  await assert.rejects(
    processRunExecuteQueueJob(payload, {
      logger,
      async processRunJob() {
        throw new Error("worker crashed");
      },
    }),
    /worker crashed/,
  );
});

