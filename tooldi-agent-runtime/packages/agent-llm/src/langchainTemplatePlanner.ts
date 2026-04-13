import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

import { normalizeTemplateAssetPolicy } from "./templatePlannerAssetPolicy.js";
import type {
  StructuredOutputModel,
  TemplatePlanner,
  TemplatePlannerProvider,
} from "./templatePlannerSchemas.js";
import { TemplateSemanticBriefDraftSchema } from "./templatePlannerSchemas.js";

export function createLangChainTemplatePlanner(config: {
  provider: TemplatePlannerProvider;
  modelName: string;
  temperature: number;
  modelOverride?: StructuredOutputModel<typeof TemplateSemanticBriefDraftSchema>;
}): TemplatePlanner {
  const model =
    config.modelOverride ??
    createStructuredOutputModel(
      config.provider,
      config.modelName,
      config.temperature,
    );
  const structuredModel = model.withStructuredOutput(
    TemplateSemanticBriefDraftSchema,
  );

  return {
    mode: "langchain",
    async plan(input) {
      const result = await structuredModel.invoke([
        {
          role: "system",
          content:
            "You are a semantic design-brief planner for Tooldi's current create-template slice. " +
            "Return only the semantic brief draft, not copy text, not layout subplans, and not retrieval keywords. " +
            "Choose only supported enum values. " +
            "Choose a solid backgroundColorHex that fits the overall design context. " +
            "Model the prompt using subjectBinding and offerIntent rather than direct search keywords. " +
            "Assume the rollout focuses on Korean marketing banners for restaurant, cafe, fashion retail, and generic promotional prompts.",
        },
        {
          role: "user",
          content:
            `Prompt: ${input.prompt}\n` +
            `Canvas preset: ${input.canvasPreset}\n` +
            `Brand palette: ${input.palette.join(", ") || "none"}\n` +
            "Return a structured semantic brief draft for the current create-template workflow.",
        },
      ]);

      return {
        ...result,
        assetPolicy: normalizeTemplateAssetPolicy(result.assetPolicy),
      };
    },
  };
}

export function createStructuredOutputModel<
  TSchema extends z.ZodTypeAny,
>(
  provider: TemplatePlannerProvider,
  modelName: string,
  temperature: number,
): StructuredOutputModel<TSchema> {
  if (provider === "openai") {
    return new ChatOpenAI({
      model: modelName,
      temperature,
    }) as StructuredOutputModel<TSchema>;
  }

  if (provider === "anthropic") {
    return new ChatAnthropic({
      model: modelName,
      temperature,
    }) as StructuredOutputModel<TSchema>;
  }

  return new ChatGoogleGenerativeAI({
    model: modelName,
    temperature,
  }) as StructuredOutputModel<TSchema>;
}
