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
  SceneBindingPlan,
  SceneLayoutPlan,
  SceneRolePlan,
  SceneStylePlan,
  TemplatePriorBundle,
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
    templatePriorBundle?: TemplatePriorBundle | null;
    sceneRolePlan?: SceneRolePlan | null;
    sceneLayoutPlan?: SceneLayoutPlan | null;
    sceneStylePlan?: SceneStylePlan | null;
    sceneBindingPlan?: SceneBindingPlan | null;
  },
): Promise<BuildCopyAndAbstractLayoutPlanResult> {
  const prompt = input.request.userInput.prompt.trim();
  const priorContext = buildPriorContext(
    dependencies.templatePriorBundle ?? null,
    dependencies.sceneRolePlan ?? null,
    dependencies.sceneLayoutPlan ?? null,
    dependencies.sceneStylePlan ?? null,
    dependencies.sceneBindingPlan ?? null,
  );
  const { copyPlan, copyPlanNormalizationReport } = await buildCopyPlanArtifacts(
    prompt,
    intent,
    dependencies.templateCopyPlanGenerator,
    priorContext,
    dependencies.sceneRolePlan ?? null,
  );
  const {
    abstractLayoutPlan,
    abstractLayoutPlanNormalizationReport,
  } = await buildAbstractLayoutPlanArtifacts(
    prompt,
    intent,
    dependencies.templateAbstractLayoutGenerator,
    priorContext,
    dependencies.sceneLayoutPlan ?? null,
  );

  return {
    copyPlan,
    copyPlanNormalizationReport,
    abstractLayoutPlan,
    abstractLayoutPlanNormalizationReport,
  };
}

function buildPriorContext(
  templatePriorBundle: TemplatePriorBundle | null,
  sceneRolePlan: SceneRolePlan | null,
  sceneLayoutPlan: SceneLayoutPlan | null,
  sceneStylePlan: SceneStylePlan | null,
  sceneBindingPlan: SceneBindingPlan | null,
): string | null {
  const selected = templatePriorBundle?.selectedScaffold;
  if (!selected) {
    return null;
  }

  const fragments = [
    `templateCode=${selected.sourceTemplateCode}`,
    `title=${selected.title}`,
    `layoutFamilyHint=${selected.layoutFamilyHint}`,
    `layoutModeHint=${selected.layoutModeHint}`,
    `copyAnchor=${selected.copyAnchor}`,
    `visualAnchor=${selected.visualAnchor}`,
    `primaryVisualFamily=${selected.primaryVisualFamilyHint}`,
    `backgroundMode=${selected.backgroundMode}`,
    `textObjectCount=${selected.textObjectCount}`,
    `visualObjectCount=${selected.visualObjectCount}`,
  ];

  if (sceneLayoutPlan) {
    fragments.push(
      `resolvedLayoutFamily=${sceneLayoutPlan.layoutFamily}`,
      `resolvedLayoutMode=${sceneLayoutPlan.layoutMode}`,
      `resolvedCopyAnchor=${sceneLayoutPlan.copyAnchor}`,
      `resolvedVisualAnchor=${sceneLayoutPlan.visualAnchor}`,
      `resolvedPrimaryVisualFamily=${sceneLayoutPlan.primaryVisualFamily}`,
    );
  }

  if (sceneRolePlan) {
    fragments.push(
      `roles=${sceneRolePlan.roles
        .map((role) => `${role.key}:${role.mappedExecutionSlotKey}`)
        .join(",")}`,
    );
  }

  if (sceneStylePlan) {
    fragments.push(
      `styleBackgroundKind=${sceneStylePlan.backgroundKind}`,
      `styleTypographyTone=${sceneStylePlan.typographyPolicy.tone}`,
      `styleCtaShape=${sceneStylePlan.ctaShapeLanguage}`,
      `styleMotifs=${sceneStylePlan.motifTags.join(",") || "none"}`,
    );
  }

  if (sceneBindingPlan) {
    fragments.push(
      `bindingBackgroundMode=${sceneBindingPlan.backgroundMode}`,
      `bindingDecorationMode=${sceneBindingPlan.preferredDecorationMode}`,
      `bindingCtaTreatment=${sceneBindingPlan.preferredCtaTreatment}`,
    );
  }

  return fragments.join(" | ");
}
