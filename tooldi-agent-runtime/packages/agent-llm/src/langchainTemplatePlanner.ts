import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";

import { ensurePlanningDraftSubplans } from "./heuristicTemplatePlanner.js";
import { normalizeTemplateAssetPolicy } from "./templatePlannerAssetPolicy.js";
import type {
  StructuredOutputModel,
  TemplatePlanner,
  TemplatePlannerProvider,
} from "./templatePlannerSchemas.js";
import { TemplateIntentDraftSchema } from "./templatePlannerSchemas.js";

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
            "You are a template-planning assistant for Tooldi's current create-template slice. " +
            "Return a concise Korean design brief. " +
            "Choose only supported enum values. " +
            "Until generic retrieval lands, include '봄' in searchKeywords. " +
            "Assume the rollout focuses on Korean marketing banners for restaurant, cafe, and fashion retail prompts.",
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

      const normalizedDraft = {
        ...result,
        assetPolicy: normalizeTemplateAssetPolicy(result.assetPolicy),
        searchKeywords: result.searchKeywords.includes("봄")
          ? result.searchKeywords
          : ["봄", ...result.searchKeywords].slice(0, 5),
      };

      return ensurePlanningDraftSubplans(input.prompt, normalizedDraft);
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
