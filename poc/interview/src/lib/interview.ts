import { callGeminiJson } from "./gemini.js";

export interface InterviewQuestion {
  readonly id: string;
  readonly title: string;
  readonly type: "single_choice" | "multi_choice" | "free_text";
  readonly choices?: ReadonlyArray<string>;
  readonly allow_other: boolean;
  readonly rationale?: string;
}

export interface InterviewAnswer {
  readonly id: string;
  readonly value?: string;
  readonly values?: ReadonlyArray<string>;
  readonly is_other: boolean;
}

export interface InterviewPair {
  readonly id: string;
  readonly title: string;
  readonly type: InterviewQuestion["type"];
  readonly answer: string | ReadonlyArray<string>;
  readonly is_other: boolean;
}

export interface StructuredInterviewContext {
  readonly original_prompt: string;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly interview: ReadonlyArray<InterviewPair>;
  readonly derived_brief: string;
}

export interface GenerateInterviewArgs {
  readonly apiKey: string;
  readonly model: string;
  readonly prompt: string;
  readonly canvas: { readonly width: number; readonly height: number };
}

export interface GenerateInterviewResult {
  readonly questions: ReadonlyArray<InterviewQuestion>;
  readonly answers: ReadonlyArray<InterviewAnswer>;
  readonly context: StructuredInterviewContext;
  readonly timings: {
    readonly genQuestionsMs: number;
    readonly genAnswersMs: number;
    readonly genBriefMs: number;
    readonly totalMs: number;
  };
  readonly usages: {
    readonly questions: unknown | null;
    readonly answers: unknown | null;
    readonly brief: unknown | null;
  };
}

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

간결하게, 지시문 없이 서술형. 한국어. 1 개의 문자열 필드 "derived_brief" 에 멀티라인으로 담아 JSON 반환.`;

const Q_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          type: {
            type: "string",
            enum: ["single_choice", "multi_choice", "free_text"],
          },
          choices: { type: "array", items: { type: "string" } },
          allow_other: { type: "boolean" },
          rationale: { type: "string" },
        },
        required: ["id", "title", "type", "allow_other"],
      },
    },
  },
  required: ["questions"],
};

const A_SCHEMA = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          value: { type: "string" },
          values: { type: "array", items: { type: "string" } },
          is_other: { type: "boolean" },
        },
        required: ["id", "is_other"],
      },
    },
  },
  required: ["answers"],
};

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    derived_brief: { type: "string" },
  },
  required: ["derived_brief"],
};

export async function generateInterview(
  args: GenerateInterviewArgs,
): Promise<GenerateInterviewResult> {
  const overallStart = Date.now();

  // 1) 질문 생성
  const qUserPrompt = `프롬프트:
${args.prompt}

캔버스: ${args.canvas.width}px × ${args.canvas.height}px

위 프롬프트를 더 좋은 시안으로 발전시키기 위해 최대 5 개의 질문을 JSON 으로 만들어라.`;
  const qStart = Date.now();
  const qResp = await callGeminiJson<{ questions: InterviewQuestion[] }>({
    apiKey: args.apiKey,
    model: args.model,
    systemPrompt: QUESTIONS_SYSTEM,
    userPrompt: qUserPrompt,
    responseSchema: Q_SCHEMA,
    temperature: 0.4,
  });
  const questions = qResp.data.questions.slice(0, 5);
  const genQuestionsMs = Date.now() - qStart;

  // 2) 자동 답변
  const aUserPrompt = `브리프:
${args.prompt}

캔버스: ${args.canvas.width}px × ${args.canvas.height}px

질문 목록:
${JSON.stringify(questions, null, 2)}

모든 질문에 답하라.`;
  const aStart = Date.now();
  const aResp = await callGeminiJson<{ answers: InterviewAnswer[] }>({
    apiKey: args.apiKey,
    model: args.model,
    systemPrompt: ANSWERS_SYSTEM,
    userPrompt: aUserPrompt,
    responseSchema: A_SCHEMA,
    temperature: 0.35,
  });
  const answers = aResp.data.answers;
  const genAnswersMs = Date.now() - aStart;

  // 3) derived_brief
  const interviewPairs: InterviewPair[] = questions.map((q) => {
    const a = answers.find((x) => x.id === q.id);
    const answer: string | ReadonlyArray<string> = a
      ? a.values && a.values.length > 0
        ? a.values
        : (a.value ?? "")
      : "";
    return {
      id: q.id,
      title: q.title,
      type: q.type,
      answer,
      is_other: a?.is_other ?? false,
    };
  });
  const bUserPrompt = `원본 프롬프트:
${args.prompt}

Q&A:
${interviewPairs
  .map((p, i) => {
    const answerText = Array.isArray(p.answer)
      ? p.answer.join(", ")
      : String(p.answer);
    return `${i + 1}. ${p.title}\n   → ${answerText}`;
  })
  .join("\n")}`;
  const bStart = Date.now();
  const bResp = await callGeminiJson<{ derived_brief: string }>({
    apiKey: args.apiKey,
    model: args.model,
    systemPrompt: BRIEF_SYSTEM,
    userPrompt: bUserPrompt,
    responseSchema: BRIEF_SCHEMA,
    temperature: 0.3,
  });
  const genBriefMs = Date.now() - bStart;

  const context: StructuredInterviewContext = {
    original_prompt: args.prompt,
    canvas: { width: args.canvas.width, height: args.canvas.height },
    interview: interviewPairs,
    derived_brief: bResp.data.derived_brief,
  };

  const totalMs = Date.now() - overallStart;
  return {
    questions,
    answers,
    context,
    timings: { genQuestionsMs, genAnswersMs, genBriefMs, totalMs },
    usages: {
      questions: qResp.usage,
      answers: aResp.usage,
      brief: bResp.usage,
    },
  };
}
