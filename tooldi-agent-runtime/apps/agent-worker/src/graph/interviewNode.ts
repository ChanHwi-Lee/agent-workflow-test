// v6 SAFE 방어선
// ------------------------------------------------------------
// 인터뷰 답변은 반드시 pure string concat 으로만 freeform_layout 의
// userPrompt 에 들어가야 하며, runV6HtmlGen 에 별도의 구조화 인자(role /
// slot / cta_type 등) 를 추가하면 안 된다. 구조화 필드가 primitive /
// command / render QA 계약까지 투영되는 순간 v5 CTA contract 재현이 된다.
// 이 파일에서 builtUserPrompt 외 구조 필드를 v6 진입점에 전달하고 싶은
// 충동이 들면 즉시 설계 재검토.

import { interrupt, type StateGraph } from "@langchain/langgraph";

import type { InterviewAnswer, InterviewQuestion } from "@tooldi/agent-contracts";

import {
  buildInterviewUserPrompt,
  generateAutoAnswers,
  generateDerivedBrief,
  generateInterviewQuestions,
  reconcileResumeAnswers,
} from "../phases/interviewLlm.js";
import type { InterviewState } from "../types.js";
import { RunJobGraphState } from "./runJobGraphState.js";
import type { RunJobGraphDependencies } from "./runJobGraphTypes.js";
import type { createRunJobGraphTasks } from "./graphTasks.js";

const DEFAULT_INTERVIEW_TIMEOUT_MS = 300_000;

interface InterruptResumeShape {
  readonly answers?: ReadonlyArray<InterviewAnswer>;
  readonly __auto?: boolean;
}

function coerceResume(raw: unknown): InterruptResumeShape | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const out: { answers?: ReadonlyArray<InterviewAnswer>; __auto?: boolean } = {};
  if (Array.isArray(obj.answers)) {
    out.answers = obj.answers as ReadonlyArray<InterviewAnswer>;
  }
  if (typeof obj.__auto === "boolean") {
    out.__auto = obj.__auto;
  }
  return out;
}

export function registerInterviewUserNode(
  graph: StateGraph<typeof RunJobGraphState>,
  dependencies: RunJobGraphDependencies,
  tasks: ReturnType<typeof createRunJobGraphTasks>,
) {
  const { appendEventTask } = tasks;

  return graph.addNode("interview_user", async (state) => {
    if (!state.hydrated) {
      throw new Error("interview_user requires hydrated input");
    }
    const apiKey = dependencies.env.googleApiKey;
    if (!apiKey) {
      throw new Error(
        "interview_user requires GOOGLE_API_KEY (env.googleApiKey)",
      );
    }
    const totalStart = Date.now();
    const prompt = state.hydrated.request.userInput.prompt;
    const canvas = {
      width: state.hydrated.request.editorContext.canvasWidth,
      height: state.hydrated.request.editorContext.canvasHeight,
    };
    const timeoutMs =
      state.hydrated.snapshot.runPolicy.interviewTimeoutMs ??
      DEFAULT_INTERVIEW_TIMEOUT_MS;
    const llmConfig = { apiKey };

    const questionsResult = await generateInterviewQuestions({
      prompt,
      canvas,
      config: llmConfig,
    });
    const questions: ReadonlyArray<InterviewQuestion> = questionsResult.questions;

    const enterEvent = await appendEventTask(state.job.runId, {
      traceId: state.job.traceId,
      attempt: state.job.attemptSeq,
      queueJobId: state.job.queueJobId,
      event: {
        type: "interview.awaiting",
        questions: questions.map((q) => ({ ...q })),
        timeoutMs,
      },
    });
    if (enterEvent.cancelRequested) {
      return { cooperativeStopRequested: true };
    }

    const resumeRaw = interrupt<
      {
        type: "interview.awaiting";
        runId: string;
        questions: ReadonlyArray<InterviewQuestion>;
        timeoutMs: number;
      },
      unknown
    >({
      type: "interview.awaiting",
      runId: state.job.runId,
      questions,
      timeoutMs,
    });
    const resume = coerceResume(resumeRaw);
    const reconcilation = reconcileResumeAnswers({
      questions,
      resume: resume?.answers,
    });
    const matched: InterviewAnswer[] = [...reconcilation.matched];
    const autoFilledIds: string[] = [];

    const needsAuto =
      resume?.__auto === true ||
      reconcilation.missingIds.length > 0 ||
      matched.length === 0;
    let autoUsage: unknown = null;
    let autoMs = 0;
    if (needsAuto) {
      const autoResult = await generateAutoAnswers({
        prompt,
        canvas,
        questions,
        config: llmConfig,
      });
      autoMs = autoResult.durationMs;
      autoUsage = null;
      const matchedIds = new Set(matched.map((a) => a.id));
      for (const a of autoResult.answers) {
        if (!matchedIds.has(a.id)) {
          matched.push(a);
          autoFilledIds.push(a.id);
        }
      }
    }

    const briefResult = await generateDerivedBrief({
      prompt,
      questions,
      answers: matched,
      config: llmConfig,
    });
    const builtUserPrompt = buildInterviewUserPrompt({
      originalPrompt: prompt,
      derivedBrief: briefResult.derivedBrief,
      questions,
      answers: matched,
    });

    const interview: InterviewState = {
      questions,
      answers: matched,
      derivedBrief: briefResult.derivedBrief,
      autoFilledIds,
      builtUserPrompt,
      timings: {
        questionsMs: questionsResult.durationMs,
        answersMs: autoMs,
        briefMs: briefResult.durationMs,
        totalMs: Date.now() - totalStart,
      },
      usages: {
        questions: null,
        answers: autoUsage,
        brief: null,
      },
    };

    await appendEventTask(state.job.runId, {
      traceId: state.job.traceId,
      attempt: state.job.attemptSeq,
      queueJobId: state.job.queueJobId,
      event: {
        type: "interview.completed",
        autoFilledCount: autoFilledIds.length,
        autoFilledIds,
        totalQuestions: questions.length,
      },
    });

    return { interview };
  });
}
