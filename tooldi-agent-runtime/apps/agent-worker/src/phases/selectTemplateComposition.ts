import type {
  NormalizedIntent,
  SelectionDecision,
  TemplateCandidateBundle,
  TemplatePriorBundle,
  TemplateSelectionPolicy,
  RetrievalStageResult,
  SceneBindingPlan,
} from "../types.js";
import { buildCompositionSelection } from "./compositionEngine.js";

export async function selectTemplateComposition(
  intent: NormalizedIntent,
  candidates: TemplateCandidateBundle,
  dependencies: {
    retrievalStage: RetrievalStageResult;
    selectionPolicy: TemplateSelectionPolicy;
    templatePriorBundle?: TemplatePriorBundle | null;
    sceneBindingPlan?: SceneBindingPlan | null;
  },
): Promise<SelectionDecision> {
  const result = await buildCompositionSelection(intent, candidates, dependencies);
  return result.selectionDecision;
}
