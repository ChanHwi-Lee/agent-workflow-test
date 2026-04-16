import type {
  CanvasMutationCommand,
  ExecutionSlotKey,
} from "@tooldi/agent-contracts";
import { createRequestId } from "@tooldi/agent-domain";

import type {
  ConcreteLayoutClusterZone,
  LayoutBounds,
  MutationProposalDraft,
} from "../types.js";
import { isExecutionIdentityValid } from "./executionSlotIdentity.js";
import type { TypographyMetadata } from "./planInputParsers.js";

type CreateLayerCommand = Extract<
  MutationProposalDraft["mutation"]["commands"][number],
  { op: "createLayer" }
>;

type CreateLayerCommandOptions = {
  slotKey: CreateLayerCommand["slotKey"];
  executionSlotKey: ExecutionSlotKey | null;
  clientLayerKey: string;
  layerType: "shape" | "text" | "group" | "image";
  bounds: LayoutBounds;
  role: string;
  variantKey: string;
  candidateId: string;
  sourceAssetId?: string | null | undefined;
  sourceSerial?: string | null | undefined;
  sourceCategory?: string | null | undefined;
  sourceUid?: string | null | undefined;
  sourceOriginUrl?: string | null | undefined;
  sourceWidth?: number | null | undefined;
  sourceHeight?: number | null | undefined;
  photoOrientation?: "portrait" | "landscape" | "square" | null | undefined;
  fitMode?: "cover" | undefined;
  cropMode?: "centered_cover" | undefined;
  renderPrimitive?: string | null | undefined;
  styleTokens?: Record<string, string | number | boolean | null> | undefined;
  fontRole?: "display" | "body" | undefined;
  typography?: TypographyMetadata;
  textContent?: string | null | undefined;
  clusterZone?: ConcreteLayoutClusterZone | null | undefined;
  customFontSize?: number | undefined;
  customTextAlign?: "left" | "center" | "right" | undefined;
  topologyId?: string | null | undefined;
  topologyCapabilityId?: string | null | undefined;
  topologyRole?: string | null | undefined;
  textBearing?: boolean | undefined;
  actionBearing?: boolean | undefined;
  mediaBearing?: boolean | undefined;
};

export function buildCreateLayerCommand(
  runId: string,
  stage: string,
  options: CreateLayerCommandOptions,
): MutationProposalDraft["mutation"]["commands"][number] {
  if (
    !isExecutionIdentityValid(
      options.slotKey,
      options.executionSlotKey,
      options.role,
    )
  ) {
    throw new Error(
      `Invalid execution identity for ${options.clientLayerKey}: slot=${String(options.slotKey)} executionSlot=${String(options.executionSlotKey)} role=${options.role}`,
    );
  }

  const metadata: Record<string, string | number | boolean | null> = {
    role: options.role,
    variantKey: options.variantKey,
    candidateId: options.candidateId,
    sourceAssetId: options.sourceAssetId ?? null,
    sourceSerial: options.sourceSerial ?? null,
    sourceCategory: options.sourceCategory ?? null,
    sourceUid: options.sourceUid ?? null,
    sourceOriginUrl: options.sourceOriginUrl ?? null,
    sourceWidth: options.sourceWidth ?? null,
    sourceHeight: options.sourceHeight ?? null,
    photoOrientation: options.photoOrientation ?? null,
    fitMode: options.fitMode ?? null,
    cropMode: options.cropMode ?? null,
    renderPrimitive: options.renderPrimitive ?? null,
    copyText: options.textContent ?? null,
    clusterZone: options.clusterZone ?? null,
    topologyId: options.topologyId ?? null,
    topologyCapabilityId: options.topologyCapabilityId ?? null,
    topologyRole: options.topologyRole ?? null,
    textBearing: options.textBearing ?? null,
    actionBearing: options.actionBearing ?? null,
    mediaBearing: options.mediaBearing ?? null,
  };

  if (options.fontRole && options.typography) {
    metadata.fontRole = options.fontRole;
    metadata.displayFontFamily = options.typography.displayFontFamily;
    metadata.displayFontWeight = options.typography.displayFontWeight;
    metadata.bodyFontFamily = options.typography.bodyFontFamily;
    metadata.bodyFontWeight = options.typography.bodyFontWeight;
  }
  if (typeof options.customFontSize === "number") {
    metadata.customFontSize = options.customFontSize;
  }
  if (options.customTextAlign) {
    metadata.customTextAlign = options.customTextAlign;
  }

  return {
    commandId: createRequestId(),
    op: "createLayer",
    slotKey: options.slotKey,
    executionSlotKey: options.executionSlotKey,
    clientLayerKey: options.clientLayerKey,
    targetRef: {
      layerId: null,
      clientLayerKey: options.clientLayerKey,
      ...(options.slotKey ? { slotKey: options.slotKey } : {}),
    },
    targetLayerVersion: null,
    parentRef: {
      position: "append",
    },
    expectedLayerType: null,
    allowNoop: false,
    metadataTags: {
      source: "agent-worker-spring-template",
      stage,
    },
    layerBlueprint: {
      layerType: options.layerType,
      bounds: options.bounds,
      ...(options.styleTokens ? { styleTokens: options.styleTokens } : {}),
      metadata,
    },
    editable: true,
  } satisfies CanvasMutationCommand;
}

export function buildSaveTemplateCommand(
  stage: string,
  reason: "milestone_first_editable" | "run_completed",
): Extract<CanvasMutationCommand, { op: "saveTemplate" }> {
  return {
    commandId: createRequestId(),
    op: "saveTemplate",
    slotKey: null,
    targetRef: {},
    targetLayerVersion: null,
    allowNoop: false,
    metadataTags: {
      source: "agent-worker-spring-template",
      stage,
    },
    reason,
  } satisfies CanvasMutationCommand;
}
