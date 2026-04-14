import type {
  NormalizedIntent,
  SelectionDecision,
  TemplateCandidateBundle,
  TemplateSelectionPolicy,
  RetrievalStageResult,
} from "../types.js";
import { buildCompositionSelection } from "./compositionEngine.js";

export async function selectTemplateComposition(
  intent: NormalizedIntent,
  candidates: TemplateCandidateBundle,
  dependencies: {
    retrievalStage: RetrievalStageResult;
    selectionPolicy: TemplateSelectionPolicy;
  },
): Promise<SelectionDecision> {
  const result = await buildCompositionSelection(intent, candidates, dependencies);
  return result.selectionDecision;
}
