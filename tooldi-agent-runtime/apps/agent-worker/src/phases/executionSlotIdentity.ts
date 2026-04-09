import type { ExecutionSlotKey } from "@tooldi/agent-contracts";

type CompatCanvasSlotKey =
  | "background"
  | "headline"
  | "supporting_copy"
  | "cta"
  | "decoration"
  | "badge"
  | "hero_image";

export function toCompatSlotKey(
  executionSlotKey: ExecutionSlotKey,
): CompatCanvasSlotKey | null {
  switch (executionSlotKey) {
    case "background":
      return "background";
    case "headline":
      return "headline";
    case "subheadline":
      return "supporting_copy";
    case "cta":
      return "cta";
    case "badge_text":
      return "badge";
    case "hero_image":
      return "hero_image";
    case "offer_line":
    case "footer_note":
      return null;
  }
}

export function deriveExecutionSlotKey(
  slotKey: CompatCanvasSlotKey | null,
  role: string | null,
): ExecutionSlotKey | null {
  switch (slotKey) {
    case "background":
      return "background";
    case "headline":
      return "headline";
    case "supporting_copy":
      return "subheadline";
    case "cta":
      return role === "cta" ? "cta" : null;
    case "badge":
      return "badge_text";
    case "hero_image":
      return "hero_image";
    case "decoration":
      return null;
    case null:
      break;
  }

  switch (role) {
    case "price_callout":
      return "offer_line";
    case "footer_note":
      return "footer_note";
    default:
      return null;
  }
}

export function isExecutionIdentityValid(
  slotKey: CompatCanvasSlotKey | null,
  executionSlotKey: ExecutionSlotKey | null,
  role: string | null,
): boolean {
  if (executionSlotKey === null) {
    return !isSemanticRole(role);
  }

  if (deriveExecutionSlotKey(slotKey, role) === executionSlotKey) {
    return true;
  }

  return slotKey === toCompatSlotKey(executionSlotKey);
}

function isSemanticRole(role: string | null): boolean {
  return (
    role === "background" ||
    role === "headline" ||
    role === "supporting_copy" ||
    role === "price_callout" ||
    role === "cta" ||
    role === "footer_note" ||
    role === "badge" ||
    role === "hero_image"
  );
}
