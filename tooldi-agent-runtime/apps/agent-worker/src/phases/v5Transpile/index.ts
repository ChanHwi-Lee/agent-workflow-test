import { classifyNode } from "./classify.js";
import { emitCreateCommand } from "./emitCommand.js";
import { parseHtmlRoot } from "./parseHtml.js";
import type {
  AgentCreateLayerCommand,
  ParsedDomNode,
  TranspileOptions,
  TranspileResult,
  TranspileWarning,
  TranspileWarningCode,
} from "./types.js";

export function transpileHtmlToCommands(
  html: string,
  options: TranspileOptions,
): TranspileResult {
  const commands: AgentCreateLayerCommand[] = [];
  const warnings: TranspileWarning[] = [];
  const root = parseHtmlRoot(html);
  if (!root) {
    warnings.push({
      code: "root_not_found",
      message: "no root element found in html",
      path: "root",
    });
    return { commands, warnings };
  }
  const seqRef = { value: 0 };
  walk(root, commands, warnings, seqRef, options.runId);
  return { commands, warnings };
}

function walk(
  node: ParsedDomNode,
  commands: AgentCreateLayerCommand[],
  warnings: TranspileWarning[],
  seqRef: { value: number },
  runId: string,
): void {
  const classification = classifyNode(node);
  if (classification.kind === "recurse") {
    for (const child of node.children) {
      walk(child, commands, warnings, seqRef, runId);
    }
    return;
  }
  if (classification.kind === "skip") {
    warnings.push({
      code: mapSkipReasonToCode(classification.reason),
      message: `skipped ${node.tag} (${classification.reason})`,
      path: node.path,
    });
    return;
  }
  seqRef.value += 1;
  const result = emitCreateCommand(node, classification, seqRef.value, runId);
  if (!result.ok) {
    warnings.push({
      code: "bounds_missing",
      message: `bounds missing on ${node.tag}`,
      path: node.path,
    });
    return;
  }
  commands.push(result.command);
}

function mapSkipReasonToCode(
  reason: "unknown_tag" | "invisible_block" | "text_empty",
): TranspileWarningCode {
  if (reason === "unknown_tag") return "unknown_tag";
  if (reason === "text_empty") return "text_content_empty";
  return "skipped_invisible_block";
}

export type {
  AgentBounds,
  AgentCreateLayerCommand,
  AgentExecutionSlotKey,
  AgentLayerType,
  ParsedDomNode,
  TranspileOptions,
  TranspileResult,
  TranspileWarning,
  TranspileWarningCode,
} from "./types.js";
export { parseHtmlRoot } from "./parseHtml.js";
export { classifyNode } from "./classify.js";
