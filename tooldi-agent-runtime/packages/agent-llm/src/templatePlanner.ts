import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import type { AgentWorkerEnv } from "@tooldi/agent-config";
import type { Logger } from "@tooldi/agent-observability";
import { z } from "zod";

export const templatePlannerModes = ["heuristic", "langchain"] as const;
export type TemplatePlannerMode = (typeof templatePlannerModes)[number];

export const templatePlannerProviders = [
  "openai",
  "anthropic",
  "google",
] as const;
export type TemplatePlannerProvider = (typeof templatePlannerProviders)[number];

export const TemplateIntentDraftSchema = z.object({
  goalSummary: z.string().min(1).max(80),
  layoutIntent: z.enum(["copy_focused", "hero_focused", "badge_led"]),
  tone: z.enum(["bright_playful"]),
  searchKeywords: z.array(z.string().min(1).max(20)).min(1).max(5),
  typographyHint: z.string().nullable(),
});

export type TemplateIntentDraft = z.infer<typeof TemplateIntentDraftSchema>;

export interface TemplatePlannerInput {
  prompt: string;
  canvasPreset: string;
  palette: string[];
}

export interface TemplatePlanner {
  readonly mode: TemplatePlannerMode;
  plan(input: TemplatePlannerInput): Promise<TemplateIntentDraft>;
}

interface StructuredOutputModel<TSchema extends z.ZodTypeAny> {
  withStructuredOutput(schema: TSchema): {
    invoke(
      input:
        | string
        | Array<{
            role: "system" | "user" | "assistant";
            content: string;
          }>,
    ): Promise<z.infer<TSchema>>;
  };
}

export function createTemplatePlanner(
  env: Pick<
    AgentWorkerEnv,
    | "templatePlannerMode"
    | "templatePlannerProvider"
    | "templatePlannerModel"
    | "templatePlannerTemperature"
  >,
  logger: Logger,
): TemplatePlanner {
  if (env.templatePlannerMode === "heuristic") {
    return createHeuristicTemplatePlanner();
  }

  const provider = env.templatePlannerProvider;
  const modelName = env.templatePlannerModel;
  if (!provider || !modelName) {
    throw new Error(
      "TEMPLATE_PLANNER_MODE=langchain requires TEMPLATE_PLANNER_PROVIDER and TEMPLATE_PLANNER_MODEL",
    );
  }

  logger.info("LangChain template planner configured", {
    provider,
    model: modelName,
    temperature: env.templatePlannerTemperature,
  });

  return createLangChainTemplatePlanner({
    provider,
    modelName,
    temperature: env.templatePlannerTemperature,
  });
}

export function createHeuristicTemplatePlanner(): TemplatePlanner {
  return {
    mode: "heuristic",
    async plan(input) {
      const prompt = input.prompt.trim();
      return {
        goalSummary: prompt,
        layoutIntent: prompt.includes("뱃지") ? "badge_led" : "copy_focused",
        tone: "bright_playful",
        searchKeywords: ["봄"],
        typographyHint: null,
      };
    },
  };
}

export function createLangChainTemplatePlanner(config: {
  provider: TemplatePlannerProvider;
  modelName: string;
  temperature: number;
  modelOverride?: StructuredOutputModel<typeof TemplateIntentDraftSchema>;
}): TemplatePlanner {
  const model =
    config.modelOverride ??
    createStructuredOutputModel(
      config.provider,
      config.modelName,
      config.temperature,
    );
  const structuredModel = model.withStructuredOutput(TemplateIntentDraftSchema);

  return {
    mode: "langchain",
    async plan(input) {
      const result = await structuredModel.invoke([
        {
          role: "system",
          content:
            "You are a template-planning assistant for Tooldi's current spring create-template slice. " +
            "Return a concise Korean design brief. " +
            "Choose only supported enum values. " +
            "Until generic retrieval lands, include '봄' in searchKeywords.",
        },
        {
          role: "user",
          content:
            `Prompt: ${input.prompt}\n` +
            `Canvas preset: ${input.canvasPreset}\n` +
            `Brand palette: ${input.palette.join(", ") || "none"}\n` +
            "Return a structured planning draft for the current spring template workflow.",
        },
      ]);

      return {
        ...result,
        searchKeywords: result.searchKeywords.includes("봄")
          ? result.searchKeywords
          : ["봄", ...result.searchKeywords].slice(0, 5),
      };
    },
  };
}

function createStructuredOutputModel(
  provider: TemplatePlannerProvider,
  modelName: string,
  temperature: number,
): StructuredOutputModel<typeof TemplateIntentDraftSchema> {
  if (provider === "openai") {
    return new ChatOpenAI({
      model: modelName,
      temperature,
    }) as StructuredOutputModel<typeof TemplateIntentDraftSchema>;
  }

  if (provider === "anthropic") {
    return new ChatAnthropic({
      model: modelName,
      temperature,
    }) as StructuredOutputModel<typeof TemplateIntentDraftSchema>;
  }

  return new ChatGoogleGenerativeAI({
    model: modelName,
    temperature,
  }) as StructuredOutputModel<typeof TemplateIntentDraftSchema>;
}
