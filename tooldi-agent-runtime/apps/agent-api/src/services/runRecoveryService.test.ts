import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type {
  InterviewAnswer,
  InterviewQuestion,
} from "@tooldi/agent-contracts";
import type { Logger } from "@tooldi/agent-observability";
import type { PgClient } from "@tooldi/agent-persistence";

import { ConflictError } from "../lib/errors.js";
import { MutationLedgerRepository } from "../repositories/mutationLedgerRepository.js";
import {
  RunAttemptRepository,
  type RunAttemptRecord,
} from "../repositories/runAttemptRepository.js";
import { RunRepository, type RunRecord } from "../repositories/runRepository.js";
import type { RunEventService } from "./runEventService.js";
import {
  RunRecoveryService,
  type InterviewResumeDispatcher,
} from "./runRecoveryService.js";

const NOW = "2026-04-27T00:00:00.000Z";
const RUN_ID = "run-interview-1";
const TRACE_ID = "trace-interview-1";
const QUEUE_JOB_ID = "queue-job-interview-1";
const ATTEMPT_SEQ = 1;

const QUESTION: InterviewQuestion = {
  id: "tone",
  title: "어떤 분위기로 만들까요?",
  type: "single_choice",
  choices: ["밝게", "차분하게"],
  allow_other: false,
};

const ANSWER: InterviewAnswer = {
  id: "tone",
  value: "밝게",
  is_other: false,
};

class RecordingLogger implements Logger {
  readonly level = "debug" as const;

  child(_bindings: Record<string, unknown>): Logger {
    return this;
  }

  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class RecordingRunEventService {
  readonly interviewAwaiting: Array<{
    runId: string;
    traceId: string;
    questions: ReadonlyArray<InterviewQuestion>;
    timeoutMs: number | undefined;
  }> = [];
  readonly interviewCompleted: Array<{
    runId: string;
    traceId: string;
    attemptSeq: number;
    autoFilledCount: number;
    autoFilledIds: ReadonlyArray<string>;
    totalQuestions: number;
    answeredAt: string;
  }> = [];
  readonly logs: Array<{
    runId: string;
    traceId: string;
    level: "info" | "warn" | "error";
    message: string;
  }> = [];

  async appendInterviewAwaiting(
    runId: string,
    traceId: string,
    questions: ReadonlyArray<InterviewQuestion>,
    timeoutMs: number | undefined,
  ): Promise<void> {
    this.interviewAwaiting.push({ runId, traceId, questions, timeoutMs });
  }

  async appendInterviewCompleted(
    runId: string,
    traceId: string,
    attemptSeq: number,
    autoFilledCount: number,
    autoFilledIds: ReadonlyArray<string>,
    totalQuestions: number,
    answeredAt: string,
  ): Promise<void> {
    this.interviewCompleted.push({
      runId,
      traceId,
      attemptSeq,
      autoFilledCount,
      autoFilledIds,
      totalQuestions,
      answeredAt,
    });
  }

  async appendLog(
    runId: string,
    traceId: string,
    level: "info" | "warn" | "error",
    message: string,
  ): Promise<void> {
    this.logs.push({ runId, traceId, level, message });
  }
}

class RecordingInterviewResumeDispatcher implements InterviewResumeDispatcher {
  readonly calls: Array<{
    runId: string;
    traceId: string;
    attemptSeq: number;
    queueJobId: string;
    answers: ReadonlyArray<InterviewAnswer>;
    receivedAt: string;
  }> = [];

  async dispatchInterviewResume(args: {
    runId: string;
    traceId: string;
    attemptSeq: number;
    queueJobId: string;
    answers: ReadonlyArray<InterviewAnswer>;
    receivedAt: string;
  }): Promise<void> {
    this.calls.push({
      ...args,
      answers: [...args.answers],
    });
  }
}

function createRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    runId: RUN_ID,
    traceId: TRACE_ID,
    requestId: "request-1",
    documentId: "document-1",
    pageId: "page-1",
    status: "planning",
    statusReasonCode: null,
    attemptSeq: ATTEMPT_SEQ,
    queueJobId: QUEUE_JOB_ID,
    requestRef: "object://requests/request-1.json",
    snapshotRef: "object://snapshots/snapshot-1.json",
    deadlineAt: "2026-04-27T00:05:00.000Z",
    lastAckedSeq: 0,
    pageLockToken: "page-lock-1",
    cancelRequestedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createAttempt(
  run: RunRecord,
  overrides: Partial<RunAttemptRecord> = {},
): RunAttemptRecord {
  return {
    attemptId: `${run.runId}__attempt_${run.attemptSeq}`,
    runId: run.runId,
    traceId: run.traceId,
    attemptSeq: run.attemptSeq,
    retryOfAttemptSeq: null,
    queueJobId: run.queueJobId ?? QUEUE_JOB_ID,
    acceptedHttpRequestId: "http-request-1",
    attemptState: "running",
    statusReasonCode: null,
    workerId: "worker-1",
    startedAt: NOW,
    leaseRecognizedAt: NOW,
    lastHeartbeatAt: NOW,
    createdAt: NOW,
    ...overrides,
  };
}

async function createHarness(options: {
  run?: Partial<RunRecord>;
  createAttemptRecord?: boolean;
} = {}): Promise<{
  service: RunRecoveryService;
  dispatcher: RecordingInterviewResumeDispatcher;
  events: RecordingRunEventService;
  runRepository: RunRepository;
  runAttemptRepository: RunAttemptRepository;
}> {
  const db = {} as PgClient;
  const runRepository = new RunRepository(db);
  const runAttemptRepository = new RunAttemptRepository(db);
  const mutationLedgerRepository = new MutationLedgerRepository(db);
  const events = new RecordingRunEventService();
  const dispatcher = new RecordingInterviewResumeDispatcher();
  const run = createRun(options.run);

  await runRepository.create(run);
  if (options.createAttemptRecord !== false && run.queueJobId !== null) {
    await runAttemptRepository.create(createAttempt(run));
  }

  return {
    service: new RunRecoveryService(
      runRepository,
      runAttemptRepository,
      mutationLedgerRepository,
      events as unknown as RunEventService,
      new RecordingLogger(),
      dispatcher,
    ),
    dispatcher,
    events,
    runRepository,
    runAttemptRepository,
  };
}

async function flushTimerMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

test("인터뷰 답변은 현재 실행의 active attempt로 resume job을 발행한다", async () => {
  const { service, dispatcher, events } = await createHarness();

  const response = await service.acceptInterviewAnswer({
    runId: RUN_ID,
    traceId: TRACE_ID,
    answers: [ANSWER],
    receivedAt: NOW,
  });

  assert.equal(response.accepted, true);
  assert.equal(response.runId, RUN_ID);
  assert.equal(response.receivedAt, NOW);
  assert.equal(dispatcher.calls.length, 1);
  assert.deepEqual(dispatcher.calls[0], {
    runId: RUN_ID,
    traceId: TRACE_ID,
    attemptSeq: ATTEMPT_SEQ,
    queueJobId: QUEUE_JOB_ID,
    answers: [ANSWER],
    receivedAt: NOW,
  });
  assert.equal(events.logs.length, 1);
  assert.match(events.logs[0]?.message ?? "", /Interview answer received/);
});

test("traceId가 다르면 인터뷰 답변을 거부한다", async () => {
  const { service, dispatcher } = await createHarness();

  await assert.rejects(
    service.acceptInterviewAnswer({
      runId: RUN_ID,
      traceId: "trace-other",
      answers: [ANSWER],
    }),
    (error) =>
      error instanceof ConflictError && /Trace mismatch/.test(error.message),
  );
  assert.equal(dispatcher.calls.length, 0);
});

test("terminal run에는 인터뷰 답변을 붙이지 않는다", async () => {
  const { service, dispatcher } = await createHarness({
    run: { status: "completed" },
  });

  await assert.rejects(
    service.acceptInterviewAnswer({
      runId: RUN_ID,
      traceId: TRACE_ID,
      answers: [ANSWER],
    }),
    (error) =>
      error instanceof ConflictError && /terminal status/.test(error.message),
  );
  assert.equal(dispatcher.calls.length, 0);
});

test("active queueJobId가 없으면 인터뷰 답변을 거부한다", async () => {
  const { service, dispatcher } = await createHarness({
    run: { queueJobId: null },
    createAttemptRecord: false,
  });

  await assert.rejects(
    service.acceptInterviewAnswer({
      runId: RUN_ID,
      traceId: TRACE_ID,
      answers: [ANSWER],
    }),
    (error) =>
      error instanceof ConflictError && /no active queue job/.test(error.message),
  );
  assert.equal(dispatcher.calls.length, 0);
});

test("인터뷰 대기 시간이 지나면 빈 답변으로 자동 resume job을 발행한다", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { service, dispatcher, events } = await createHarness();

    await service.appendWorkerEvent({
      runId: RUN_ID,
      traceId: TRACE_ID,
      attemptSeq: ATTEMPT_SEQ,
      queueJobId: QUEUE_JOB_ID,
      event: {
        type: "interview.awaiting",
        questions: [QUESTION],
        timeoutMs: 1_000,
      },
      receivedAt: NOW,
    });

    assert.equal(events.interviewAwaiting.length, 1);
    assert.equal(dispatcher.calls.length, 0);

    mock.timers.tick(1_000);
    await flushTimerMicrotasks();

    assert.equal(dispatcher.calls.length, 1);
    assert.deepEqual(dispatcher.calls[0]?.answers, []);
    assert.equal(dispatcher.calls[0]?.runId, RUN_ID);
    assert.equal(dispatcher.calls[0]?.attemptSeq, ATTEMPT_SEQ);
  } finally {
    mock.timers.reset();
  }
});

test("인터뷰 대기 이벤트는 run과 attempt를 인터뷰 대기 상태로 표시한다", async () => {
  const { service, runRepository, runAttemptRepository } = await createHarness();

  await service.appendWorkerEvent({
    runId: RUN_ID,
    traceId: TRACE_ID,
    attemptSeq: ATTEMPT_SEQ,
    queueJobId: QUEUE_JOB_ID,
    event: {
      type: "interview.awaiting",
      questions: [QUESTION],
      timeoutMs: 300_000,
    },
    receivedAt: NOW,
  });

  const run = await runRepository.findById(RUN_ID);
  const attempt = await runAttemptRepository.findByRunIdAndAttemptSeq(
    RUN_ID,
    ATTEMPT_SEQ,
  );

  assert.equal(run?.status, "executing");
  assert.equal(run?.statusReasonCode, "awaiting_interview");
  assert.equal(attempt?.attemptState, "running");
  assert.equal(attempt?.statusReasonCode, "awaiting_interview");
});

test("인터뷰 완료 이벤트는 자동 답변 통계를 public event로 전달한다", async () => {
  const { service, events } = await createHarness();

  await service.appendWorkerEvent({
    runId: RUN_ID,
    traceId: TRACE_ID,
    attemptSeq: ATTEMPT_SEQ,
    queueJobId: QUEUE_JOB_ID,
    event: {
      type: "interview.completed",
      autoFilledCount: 1,
      autoFilledIds: ["tone"],
      totalQuestions: 3,
    },
    receivedAt: NOW,
  });

  assert.deepEqual(events.interviewCompleted, [
    {
      runId: RUN_ID,
      traceId: TRACE_ID,
      attemptSeq: ATTEMPT_SEQ,
      autoFilledCount: 1,
      autoFilledIds: ["tone"],
      totalQuestions: 3,
      answeredAt: NOW,
    },
  ]);
});

test("사용자 답변이 도착하면 대기 중인 자동 fallback timer를 취소한다", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { service, dispatcher } = await createHarness();

    await service.appendWorkerEvent({
      runId: RUN_ID,
      traceId: TRACE_ID,
      attemptSeq: ATTEMPT_SEQ,
      queueJobId: QUEUE_JOB_ID,
      event: {
        type: "interview.awaiting",
        questions: [QUESTION],
        timeoutMs: 1_000,
      },
      receivedAt: NOW,
    });
    await service.acceptInterviewAnswer({
      runId: RUN_ID,
      traceId: TRACE_ID,
      answers: [ANSWER],
      receivedAt: NOW,
    });

    assert.equal(dispatcher.calls.length, 1);
    assert.deepEqual(dispatcher.calls[0]?.answers, [ANSWER]);

    mock.timers.tick(1_000);
    await flushTimerMicrotasks();

    assert.equal(dispatcher.calls.length, 1);
    assert.equal(
      dispatcher.calls.filter((call) => call.answers.length === 0).length,
      0,
    );
  } finally {
    mock.timers.reset();
  }
});

test("사용자 답변이 도착하면 인터뷰 대기 상태 표시를 해제한다", async () => {
  const { service, runRepository, runAttemptRepository } = await createHarness();

  await service.appendWorkerEvent({
    runId: RUN_ID,
    traceId: TRACE_ID,
    attemptSeq: ATTEMPT_SEQ,
    queueJobId: QUEUE_JOB_ID,
    event: {
      type: "interview.awaiting",
      questions: [QUESTION],
      timeoutMs: 300_000,
    },
    receivedAt: NOW,
  });
  await service.acceptInterviewAnswer({
    runId: RUN_ID,
    traceId: TRACE_ID,
    answers: [ANSWER],
    receivedAt: NOW,
  });

  const run = await runRepository.findById(RUN_ID);
  const attempt = await runAttemptRepository.findByRunIdAndAttemptSeq(
    RUN_ID,
    ATTEMPT_SEQ,
  );

  assert.equal(run?.status, "executing");
  assert.equal(run?.statusReasonCode, null);
  assert.equal(attempt?.attemptState, "running");
  assert.equal(attempt?.statusReasonCode, null);
});
