import type { AgentWorkerEnv } from "@tooldi/agent-config";
import type { Logger } from "@tooldi/agent-observability";

import {
  buildHeuristicAbstractLayoutDraft,
  buildHeuristicCopyPlanDraft,
} from "./heuristicTemplatePlanner.js";
import { createStructuredOutputModel } from "./langchainTemplatePlanner.js";
import type {
  StructuredOutputModel,
  TemplateAbstractLayoutGenerator,
  TemplateCopyPlanGenerator,
  TemplatePlannerProvider,
} from "./templatePlannerSchemas.js";
import {
  TemplateAbstractLayoutDraftSchema,
  TemplateCopyPlanDraftSchema,
} from "./templatePlannerSchemas.js";

export function createTemplateCopyPlanGenerator(
  env: Pick<
    AgentWorkerEnv,
    | "templatePlannerMode"
    | "templatePlannerProvider"
    | "templatePlannerModel"
    | "templatePlannerTemperature"
  >,
  logger: Logger,
): TemplateCopyPlanGenerator {
  if (env.templatePlannerMode === "heuristic") {
    return {
      mode: "heuristic",
      async generate(input) {
        return buildHeuristicCopyPlanDraft(input.prompt, input.brief);
      },
    };
  }

  const provider = requirePlannerProvider(env);
  const model = createStructuredOutputModel<
    typeof TemplateCopyPlanDraftSchema
  >(provider, env.templatePlannerModel!, env.templatePlannerTemperature);
  const structuredModel = model.withStructuredOutput(TemplateCopyPlanDraftSchema);

  logger.info("LangChain copy generator configured", {
    provider,
    model: env.templatePlannerModel,
    temperature: env.templatePlannerTemperature,
  });

  return {
    mode: "langchain",
    async generate(input) {
      return structuredModel.invoke([
        {
          role: "system",
          content:
            "You generate structured Korean marketing copy plans for Tooldi. " +
            "Use the semantic brief as the only truth. " +
            "Do not invent venue/product/menu wording when subjectBinding is subjectless. " +
            "Return slot-based copy only.",
        },
        {
          role: "user",
          content:
            `Prompt: ${input.prompt}\n` +
            `Semantic brief: ${JSON.stringify(input.brief)}\n` +
            "Return a structured copy plan draft.",
        },
      ]);
    },
  };
}

export function createTemplateAbstractLayoutGenerator(
  env: Pick<
    AgentWorkerEnv,
    | "templatePlannerMode"
    | "templatePlannerProvider"
    | "templatePlannerModel"
    | "templatePlannerTemperature"
  >,
  logger: Logger,
): TemplateAbstractLayoutGenerator {
  if (env.templatePlannerMode === "heuristic") {
    return {
      mode: "heuristic",
      async generate(input) {
        return buildHeuristicAbstractLayoutDraft(input.prompt, input.brief);
      },
    };
  }

  const provider = requirePlannerProvider(env);
  const model = createStructuredOutputModel<
    typeof TemplateAbstractLayoutDraftSchema
  >(provider, env.templatePlannerModel!, env.templatePlannerTemperature);
  const structuredModel = model.withStructuredOutput(
    TemplateAbstractLayoutDraftSchema,
  );

  logger.info("LangChain layout generator configured", {
    provider,
    model: env.templatePlannerModel,
    temperature: env.templatePlannerTemperature,
  });

  return {
    mode: "langchain",
    async generate(input) {
      return structuredModel.invoke([
        {
          role: "system",
          content:
            "You generate abstract layout plans for Tooldi create-template. " +
            "Use the semantic brief as the only truth. " +
            "Return only abstract layout structure, not copy and not retrieval hints.",
        },
        {
          role: "user",
          content:
            `Prompt: ${input.prompt}\n` +
            `Semantic brief: ${JSON.stringify(input.brief)}\n` +
            "Return a structured abstract layout draft.",
        },
      ]);
    },
  };
}

function requirePlannerProvider(
  env: Pick<
    AgentWorkerEnv,
    "templatePlannerProvider" | "templatePlannerModel" | "templatePlannerTemperature"
  >,
): TemplatePlannerProvider {
  if (!env.templatePlannerProvider || !env.templatePlannerModel) {
    throw new Error(
      "LangChain generators require TEMPLATE_PLANNER_PROVIDER and TEMPLATE_PLANNER_MODEL",
    );
  }

  return env.templatePlannerProvider;
}
