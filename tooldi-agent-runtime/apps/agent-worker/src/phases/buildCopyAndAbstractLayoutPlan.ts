import type {
  TemplateAbstractLayoutGenerator,
  TemplateCopyPlanGenerator,
} from "@tooldi/agent-llm";

import type {
  AbstractLayoutPlan,
  AbstractLayoutPlanNormalizationReport,
  CopyPlan,
  CopyPlanNormalizationReport,
  HydratedPlanningInput,
  NormalizedIntent,
} from "../types.js";
import { buildAbstractLayoutPlanArtifacts } from "./abstractLayoutPlanService.js";
import { buildCopyPlanArtifacts } from "./copyPlanService.js";

interface BuildCopyAndAbstractLayoutPlanResult {
  copyPlan: CopyPlan;
  copyPlanNormalizationReport: CopyPlanNormalizationReport;
  abstractLayoutPlan: AbstractLayoutPlan;
  abstractLayoutPlanNormalizationReport: AbstractLayoutPlanNormalizationReport;
}

export async function buildCopyAndAbstractLayoutPlan(
  input: HydratedPlanningInput,
  intent: NormalizedIntent,
  dependencies: {
    templateCopyPlanGenerator: TemplateCopyPlanGenerator;
    templateAbstractLayoutGenerator: TemplateAbstractLayoutGenerator;
  },
): Promise<BuildCopyAndAbstractLayoutPlanResult> {
  const prompt = input.request.userInput.prompt.trim();
  const { copyPlan, copyPlanNormalizationReport } = await buildCopyPlanArtifacts(
    prompt,
    intent,
    dependencies.templateCopyPlanGenerator,
  );
  const {
    abstractLayoutPlan,
    abstractLayoutPlanNormalizationReport,
  } = await buildAbstractLayoutPlanArtifacts(
    prompt,
    intent,
    dependencies.templateAbstractLayoutGenerator,
  );

  return {
    copyPlan,
    copyPlanNormalizationReport,
    abstractLayoutPlan,
    abstractLayoutPlanNormalizationReport,
  };
}
