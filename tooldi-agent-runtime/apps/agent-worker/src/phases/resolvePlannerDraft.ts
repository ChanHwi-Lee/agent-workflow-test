import {
  TemplateIntentDraftSchema,
  createHeuristicTemplatePlanner,
  type TemplateIntentDraft,
  type TemplatePlanner,
  type TemplatePlannerMode,
} from "@tooldi/agent-llm";

import type { HydratedPlanningInput } from "../types.js";

import {
  deriveCanvasPreset,
  deriveOperationFamily,
} from "./planningContext.js";

export interface ResolvedPlannerDraft {
  plannerDraft: TemplateIntentDraft | null;
  plannerMode: TemplatePlannerMode;
  fallbackReason: string | null;
}

export async function resolvePlannerDraft(
  input: HydratedPlanningInput,
  dependencies?: {
    templatePlanner?: TemplatePlanner;
  },
): Promise<ResolvedPlannerDraft> {
  const operationFamily = deriveOperationFamily(input);
  const plannerMode = dependencies?.templatePlanner?.mode ?? "heuristic";

  if (operationFamily !== "create_template") {
    return {
      plannerDraft: null,
      plannerMode,
      fallbackReason: null,
    };
  }

  const plannerInput = {
    prompt: input.request.userInput.prompt,
    canvasPreset: deriveCanvasPreset(
      input.request.editorContext.canvasWidth,
      input.request.editorContext.canvasHeight,
    ),
    palette: input.snapshot.brandContext.palette,
  };
  const primaryPlanner =
    dependencies?.templatePlanner ?? createHeuristicTemplatePlanner();

  if (primaryPlanner.mode === "heuristic") {
    return {
      plannerDraft: await executePlanner(primaryPlanner, plannerInput),
      plannerMode: "heuristic",
      fallbackReason: null,
    };
  }

  try {
    return {
      plannerDraft: await executePlanner(primaryPlanner, plannerInput),
      plannerMode: primaryPlanner.mode,
      fallbackReason: null,
    };
  } catch (error) {
    return {
      plannerDraft: await executePlanner(
        createHeuristicTemplatePlanner(),
        plannerInput,
      ),
      plannerMode: "heuristic",
      fallbackReason: `Planner draft resolution fell back to heuristic mode: ${formatPlannerError(error)}`,
    };
  }
}

async function executePlanner(
  planner: TemplatePlanner,
  input: Parameters<TemplatePlanner["plan"]>[0],
): Promise<TemplateIntentDraft> {
  const parsedDraft = TemplateIntentDraftSchema.safeParse(await planner.plan(input));

  if (parsedDraft.success) {
    return parsedDraft.data;
  }

  const issues = parsedDraft.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");

  throw new Error(`Invalid planner draft: ${issues}`);
}

function formatPlannerError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
