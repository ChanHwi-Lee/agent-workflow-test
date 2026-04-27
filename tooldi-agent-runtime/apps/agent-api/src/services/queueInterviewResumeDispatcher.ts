import type { Logger } from "@tooldi/agent-observability";

import type { RunQueueProducer } from "../plugins/queue.js";
import type { InterviewResumeDispatcher } from "./runRecoveryService.js";

export class QueueInterviewResumeDispatcher implements InterviewResumeDispatcher {
  constructor(
    private readonly runQueue: RunQueueProducer,
    private readonly logger: Logger,
  ) {}

  async dispatchInterviewResume(args: {
    runId: string;
    traceId: string;
    attemptSeq: number;
    queueJobId: string;
    answers: ReadonlyArray<import("@tooldi/agent-contracts").InterviewAnswer>;
    receivedAt: string;
  }): Promise<void> {
    const enqueued = await this.runQueue.enqueueInterviewResume({
      runId: args.runId,
      traceId: args.traceId,
      attemptSeq: args.attemptSeq,
      queueJobId: args.queueJobId,
      answers: [...args.answers],
    });
    this.logger.info("Dispatched interview resume job", {
      runId: args.runId,
      traceId: args.traceId,
      attemptSeq: args.attemptSeq,
      queueJobId: args.queueJobId,
      resumeJobId: enqueued.jobId,
      answerCount: args.answers.length,
    });
  }
}
