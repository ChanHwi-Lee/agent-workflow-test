import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";

import type {
  InterviewAnswer,
  InterviewQuestion,
} from "@tooldi/agent-contracts";

const INTERVIEW_MODEL_DEFAULT = "gemini-3.1-flash-lite-preview";

const QUESTIONS_SYSTEM = `당신은 디자인 PM 이다. 사용자가 던진 짧은 자연어 프롬프트만으로는 최종 시안 품질이 흔들리기 쉽다.
프롬프트를 읽고 레이아웃/톤/컨셉을 잡기 전에 꼭 먼저 맞춰야 할 질문을 만들어라.

원칙:
- 최대 5 개. 꼭 필요한 만큼만 생성한다.
- 우선순위: 타겟/페르소나 > 톤&무드 > 핵심 메시지 > 시각 레퍼런스/스타일 > 금기/제약
- 각 질문은 디자인 결정에 직접 영향을 줄 때만 포함한다.
- choice 계열이면 choices 에 3~5 개의 서로 겹치지 않는 선택지를 둔다.
- 자유 입력이 더 적합하면 type="free_text" 로 두고 choices 를 비운다.
- allow_other 는 choice 에서 "기타" 여지가 합리적일 때만 true. free_text 는 false 로 둔다.
- id 는 snake_case, 예: q_target_audience.
- rationale 은 왜 이 질문이 필요한지 1 줄 (비노출 용도).
- 질문은 한국어. 간결하게.`;

const ANSWERS_SYSTEM = `당신은 10 년 경력의 시니어 그래픽 디자이너다.
브리프(프롬프트)와 디자인 PM 이 건넨 질문 목록이 주어지면, 아무도 추가 답변을 줄 수 없는 상황이라 가정하고 스스로 가장 합리적인 답을 고른다.

원칙:
- single_choice: choices 중 정확히 1 개 선택 → value 에 그 문자열.
- multi_choice: choices 중 1~3 개 → values (배열).
- free_text: 1~2 문장으로 답 → value 에 문자열.
- allow_other=true 인 choice 질문이면서 choices 중 딱 맞는 게 없을 때만 value 에 자유 문구 + is_other=true. 그 외는 is_other=false.
- 의심이 들면 가장 범용적이고 합리적인 선택. 과도한 창의성 자제.
- 한국어.
- 반드시 JSON 으로. 각 question id 에 대해 answer 하나.`;

const BRIEF_SYSTEM = `당신은 시니어 그래픽 디자이너다. 원본 프롬프트와 Q&A 를 종합해 최종 시안을 만들기 전에 읽을 "5 줄 이내 디자인 브리프"를 작성한다.

포함(각 1 줄):
- 타겟 독자
- 톤/무드
- 핵심 메시지/요소
- 스타일/시각 방향
- 제약/금기 (해당 없으면 생략 가능)

간결하게, 지시문 없이 서술형. 한국어.`;

const QuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        type: z.enum(["single_choice", "multi_choice", "free_text"]),
        choices: z.array(z.string()).optional(),
        allow_other: z.boolean(),
        rationale: z.string().optional(),
      }),
    )
    .min(1)
    .max(5),
});

const AnswersSchema = z.object({
  answers: z.array(
    z.object({
      id: z.string().min(1),
      value: z.string().optional(),
      values: z.array(z.string()).optional(),
      is_other: z.boolean(),
    }),
  ),
});

const BriefSchema = z.object({
  derived_brief: z.string().min(1),
});

export interface InterviewModelConfig {
  apiKey: string;
  modelName?: string;
}

function createModel(config: InterviewModelConfig, temperature: number) {
  return new ChatGoogleGenerativeAI({
    apiKey: config.apiKey,
    model: config.modelName ?? INTERVIEW_MODEL_DEFAULT,
    temperature,
  });
}

export interface GenerateInterviewQuestionsArgs {
  prompt: string;
  canvas: { width: number; height: number };
  config: InterviewModelConfig;
}

export interface GenerateInterviewQuestionsResult {
  questions: InterviewQuestion[];
  durationMs: number;
}

export async function generateInterviewQuestions(
  args: GenerateInterviewQuestionsArgs,
): Promise<GenerateInterviewQuestionsResult> {
  const model = createModel(args.config, 0.4).withStructuredOutput(
    QuestionsSchema,
  );
  const startedAt = Date.now();
  const result = await model.invoke([
    { role: "system", content: QUESTIONS_SYSTEM },
    {
      role: "user",
      content: `프롬프트:\n${args.prompt}\n\n캔버스: ${args.canvas.width}px × ${args.canvas.height}px\n\n위 프롬프트를 더 좋은 시안으로 발전시키기 위해 최대 5 개의 질문을 JSON 으로 만들어라.`,
    },
  ]);
  const questions = result.questions.slice(0, 5).map((q) => ({
    id: q.id,
    title: q.title,
    type: q.type,
    ...(q.choices !== undefined ? { choices: q.choices } : {}),
    allow_other: q.allow_other,
    ...(q.rationale !== undefined ? { rationale: q.rationale } : {}),
  })) as InterviewQuestion[];
  return { questions, durationMs: Date.now() - startedAt };
}

export interface GenerateAutoAnswersArgs {
  prompt: string;
  canvas: { width: number; height: number };
  questions: ReadonlyArray<InterviewQuestion>;
  config: InterviewModelConfig;
}

export interface GenerateAutoAnswersResult {
  answers: InterviewAnswer[];
  durationMs: number;
}

export async function generateAutoAnswers(
  args: GenerateAutoAnswersArgs,
): Promise<GenerateAutoAnswersResult> {
  const model = createModel(args.config, 0.35).withStructuredOutput(
    AnswersSchema,
  );
  const startedAt = Date.now();
  const result = await model.invoke([
    { role: "system", content: ANSWERS_SYSTEM },
    {
      role: "user",
      content: `브리프:\n${args.prompt}\n\n캔버스: ${args.canvas.width}px × ${args.canvas.height}px\n\n질문 목록:\n${JSON.stringify(args.questions, null, 2)}\n\n모든 질문에 답하라.`,
    },
  ]);
  const answers = result.answers.map((a) => ({
    id: a.id,
    ...(a.value !== undefined ? { value: a.value } : {}),
    ...(a.values !== undefined ? { values: a.values } : {}),
    is_other: a.is_other,
  })) as InterviewAnswer[];
  return { answers, durationMs: Date.now() - startedAt };
}

export interface GenerateDerivedBriefArgs {
  prompt: string;
  questions: ReadonlyArray<InterviewQuestion>;
  answers: ReadonlyArray<InterviewAnswer>;
  config: InterviewModelConfig;
}

export interface GenerateDerivedBriefResult {
  derivedBrief: string;
  durationMs: number;
}

export async function generateDerivedBrief(
  args: GenerateDerivedBriefArgs,
): Promise<GenerateDerivedBriefResult> {
  const model = createModel(args.config, 0.3).withStructuredOutput(BriefSchema);
  const qaLines = args.questions.map((q, i) => {
    const a = args.answers.find((x) => x.id === q.id);
    const answerText = a
      ? a.values && a.values.length > 0
        ? a.values.join(", ")
        : (a.value ?? "")
      : "";
    return `${i + 1}. ${q.title}\n   → ${answerText}`;
  });
  const startedAt = Date.now();
  const result = await model.invoke([
    { role: "system", content: BRIEF_SYSTEM },
    {
      role: "user",
      content: `원본 프롬프트:\n${args.prompt}\n\nQ&A:\n${qaLines.join("\n")}`,
    },
  ]);
  return { derivedBrief: result.derived_brief, durationMs: Date.now() - startedAt };
}

export function buildInterviewUserPrompt(args: {
  originalPrompt: string;
  derivedBrief: string;
  questions: ReadonlyArray<InterviewQuestion>;
  answers: ReadonlyArray<InterviewAnswer>;
}): string {
  const qaLines = args.questions.map((q, i) => {
    const a = args.answers.find((x) => x.id === q.id);
    const answerText = a
      ? a.values && a.values.length > 0
        ? a.values.join(", ")
        : (a.value ?? "")
      : "";
    const otherMark = a?.is_other ? " (기타 자유입력)" : "";
    return `${i + 1}. ${q.title}\n   → ${answerText}${otherMark}`;
  });
  return [
    "[ORIGINAL PROMPT]",
    args.originalPrompt,
    "",
    "[DESIGN BRIEF]",
    args.derivedBrief,
    "",
    "[INTERVIEW Q&A]",
    ...qaLines,
  ].join("\n");
}

export function reconcileResumeAnswers(args: {
  questions: ReadonlyArray<InterviewQuestion>;
  resume: unknown;
}): { matched: InterviewAnswer[]; missingIds: string[] } {
  if (!Array.isArray(args.resume)) {
    return { matched: [], missingIds: args.questions.map((q) => q.id) };
  }
  const byId = new Map<string, InterviewAnswer>();
  for (const raw of args.resume) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string") continue;
    if (!args.questions.some((q) => q.id === r.id)) continue;
    const isOther = typeof r.is_other === "boolean" ? r.is_other : false;
    const value = typeof r.value === "string" ? r.value : undefined;
    const values =
      Array.isArray(r.values) && r.values.every((v) => typeof v === "string")
        ? (r.values as string[])
        : undefined;
    byId.set(r.id, {
      id: r.id,
      ...(value !== undefined ? { value } : {}),
      ...(values !== undefined ? { values } : {}),
      is_other: isOther,
    } as InterviewAnswer);
  }
  const matched: InterviewAnswer[] = [];
  const missingIds: string[] = [];
  for (const q of args.questions) {
    const a = byId.get(q.id);
    if (a) matched.push(a);
    else missingIds.push(q.id);
  }
  return { matched, missingIds };
}
