import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

export const structuredOutputProviders = [
  "openai",
  "anthropic",
  "google",
] as const;
export type StructuredOutputProvider =
  (typeof structuredOutputProviders)[number];

export interface StructuredOutputModel<TSchema extends z.ZodTypeAny> {
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

export function createStructuredOutputModel<TSchema extends z.ZodTypeAny>(
  provider: StructuredOutputProvider,
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
