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
  sourceAssetId?: string | null;
  sourceSerial?: string | null;
  sourceCategory?: string | null;
  sourceUid?: string | null;
  sourceOriginUrl?: string | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  photoOrientation?: "portrait" | "landscape" | "square" | null;
  fitMode?: "cover";
  cropMode?: "centered_cover";
  styleTokens?: Record<string, string | number | boolean | null>;
  fontRole?: "display" | "body";
  typography?: TypographyMetadata;
  textContent?: string | null;
  clusterZone?: ConcreteLayoutClusterZone | null;
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
    copyText: options.textContent ?? null,
    clusterZone: options.clusterZone ?? null,
  };

  if (options.fontRole && options.typography) {
    metadata.fontRole = options.fontRole;
    metadata.displayFontFamily = options.typography.displayFontFamily;
    metadata.displayFontWeight = options.typography.displayFontWeight;
    metadata.bodyFontFamily = options.typography.bodyFontFamily;
    metadata.bodyFontWeight = options.typography.bodyFontWeight;
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
