import type { NodeClassification } from "./classify.js";
import { parseBounds } from "./parseInlineStyle.js";
import type { AgentCreateLayerCommand, ParsedDomNode } from "./types.js";

export interface EmitResult {
  readonly ok: true;
  readonly command: AgentCreateLayerCommand;
}

export interface EmitFailure {
  readonly ok: false;
  readonly reason: "bounds_missing";
}

export function emitCreateCommand(
  node: ParsedDomNode,
  classification: NodeClassification,
  seq: number,
  runId: string,
): EmitResult | EmitFailure {
  const bounds = parseBounds(node.style);
  if (!bounds) return { ok: false, reason: "bounds_missing" };

  const clientLayerKey = buildClientLayerKey(
    runId,
    seq,
    classification.layerType,
  );
  const command: AgentCreateLayerCommand = {
    commandId: buildCommandId(runId, seq),
    op: "createLayer",
    executionSlotKey: classification.slotKey,
    clientLayerKey,
    targetRef: { layerId: null, clientLayerKey },
    targetLayerVersion: null,
    parentRef: { position: "append" },
    expectedLayerType: null,
    allowNoop: false,
    metadataTags: {},
    layerBlueprint: {
      layerType: classification.layerType,
      bounds,
      styleTokens: classification.styleTokens,
      metadata: classification.metadata,
    },
    editable: true,
  };
  return { ok: true, command };
}

function buildClientLayerKey(
  runId: string,
  seq: number,
  layerType: string,
): string {
  return `transpile:${runId}:${String(seq).padStart(3, "0")}:${layerType}`;
}

function buildCommandId(runId: string, seq: number): string {
  return `cmd:${runId}:${String(seq).padStart(3, "0")}`;
}
