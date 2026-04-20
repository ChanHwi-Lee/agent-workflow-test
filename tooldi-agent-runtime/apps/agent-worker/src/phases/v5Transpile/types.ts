// Local type subset for v5 HTML → Tooldi layer graph transpiler.
// Canonical source is toolditor/src/features/agent-workflow-spike/model/contracts.ts.
// These mirror the structure of @tooldi/agent-contracts CreateLayerCommandSchema
// without re-deriving from the TypeBox Static so the transpile stays stand-alone
// until the B stage promotes the types to a shared package.

export type AgentLayerType = "group" | "shape" | "text" | "image" | "sticker";

export type AgentExecutionSlotKey =
  | "background"
  | "headline"
  | "subheadline"
  | "offer_line"
  | "cta"
  | "footer_note"
  | "badge_text"
  | "hero_image";

export interface AgentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AgentCreateLayerCommand {
  commandId: string;
  op: "createLayer";
  executionSlotKey: AgentExecutionSlotKey | null;
  clientLayerKey: string;
  targetRef: {
    layerId: null;
    clientLayerKey: string;
  };
  targetLayerVersion: null;
  parentRef: {
    layerId?: string;
    clientLayerKey?: string;
    position: string;
  };
  expectedLayerType: AgentLayerType | null;
  allowNoop: boolean;
  metadataTags: Record<string, string | number | boolean | null>;
  layerBlueprint: {
    layerType: AgentLayerType;
    bounds: AgentBounds;
    transform?: Record<string, unknown>;
    styleTokens?: Record<string, unknown>;
    metadata: Record<string, string | number | boolean | null>;
  };
  editable: boolean;
}

export type ParsedStyle = Readonly<Record<string, string>>;

export interface ParsedDomNode {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly style: ParsedStyle;
  readonly text: string;
  readonly children: ReadonlyArray<ParsedDomNode>;
  readonly path: string;
}

export type TranspileWarningCode =
  | "unknown_tag"
  | "bounds_missing"
  | "gradient_parse_failed"
  | "missing_image_src"
  | "missing_image_aspect"
  | "skipped_invisible_block"
  | "root_not_found"
  | "text_content_empty";

export interface TranspileWarning {
  readonly code: TranspileWarningCode;
  readonly message: string;
  readonly path: string;
}

export interface TranspileOptions {
  readonly runId: string;
}

export interface TranspileResult {
  readonly commands: AgentCreateLayerCommand[];
  readonly warnings: TranspileWarning[];
}
