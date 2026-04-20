import type {
  HydratedPlanningInput,
  NormalizedIntent,
  WorkflowVariant,
} from "../types.js";

export function deriveOperationFamily(
  input: HydratedPlanningInput,
): NormalizedIntent["operationFamily"] {
  return input.request.editorContext.canvasState === "empty"
    ? "create_template"
    : "update_layer";
}

export function deriveCanvasPreset(
  width: number,
  height: number,
): NormalizedIntent["canvasPreset"] {
  if (width === 1200 && height === 628) {
    return "wide_1200x628";
  }

  if (width === 1080 && height === 1080) {
    return "square_1080";
  }

  if (width === 1080 && height === 1920) {
    return "story_1080x1920";
  }

  return `custom_${width}x${height}`;
}

export function deriveWorkflowVariant(
  _input: HydratedPlanningInput,
): WorkflowVariant {
  return "object_native_v1";
}
