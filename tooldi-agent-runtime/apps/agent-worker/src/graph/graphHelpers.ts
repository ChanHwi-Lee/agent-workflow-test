import type {
  RunJobEnvelope,
  WaitMutationAckResponse,
} from "@tooldi/agent-contracts";
import type { AgentWorkerEnv } from "@tooldi/agent-config";

import type {
  FinalizeRunDraft,
  JudgePlan,
  ProcessRunJobResult,
  RuleJudgeVerdict,
  SelectionDecision,
  SourceSearchSummary,
  StageAckRecord,
  MutationProposalDraft as WorkerMutationProposalDraft,
  TypographyDecision,
} from "../types.js";

type SourceSearchBackground = SourceSearchSummary["background"];
type SourceSearchGraphic = SourceSearchSummary["graphic"];
type SourceSearchPhoto = SourceSearchSummary["photo"];
type SourceSearchFont = SourceSearchSummary["font"];

const OPTIONAL_ARTIFACT_REF_KEYS = [
  "normalizedIntentDraftRef",
  "intentNormalizationReportRef",
  "copyPlanRef",
  "copyPlanNormalizationReportRef",
  "abstractLayoutPlanRef",
  "abstractLayoutPlanNormalizationReportRef",
  "assetPlanRef",
  "concreteLayoutPlanRef",
  "templatePriorSummaryRef",
  "searchProfileRef",
  "executablePlanRef",
  "candidateSetRef",
  "sourceSearchSummaryRef",
  "retrievalStageRef",
  "selectionDecisionRef",
  "typographyDecisionRef",
  "ruleJudgeVerdictRef",
  "executionSceneSummaryRef",
  "judgePlanRef",
  "refineDecisionRef",
] as const;

type ArtifactRefKey = (typeof OPTIONAL_ARTIFACT_REF_KEYS)[number];

type ArtifactRefState = {
  normalizedIntentRef: string | null;
  ruleJudgeVerdict: RuleJudgeVerdict | null;
  judgePlan: JudgePlan | null;
} & Record<ArtifactRefKey, string | null>;

export function buildHeartbeatBase(job: RunJobEnvelope) {
  return {
    traceId: job.traceId,
    attempt: job.attemptSeq,
    queueJobId: job.queueJobId,
    workerId: "agent-worker-langgraph",
  } as const;
}

export function buildSourceSearchSummary(
  runId: string,
  traceId: string,
  sourceMode: AgentWorkerEnv["tooldiCatalogSourceMode"],
  background: SourceSearchBackground,
  graphic: SourceSearchGraphic,
  photo: SourceSearchPhoto,
  font: SourceSearchFont | undefined,
  selectionDecision: SelectionDecision,
): SourceSearchSummary {
  return {
    summaryId: `source_search_${runId}`,
    runId,
    traceId,
    sourceMode,
    background: {
      ...background,
      selectedAssetId: selectionDecision.selectedBackgroundAssetId,
      selectedSerial: selectionDecision.selectedBackgroundSerial,
      selectedCategory: selectionDecision.selectedBackgroundCategory,
    },
    graphic: {
      ...graphic,
      selectedAssetId: selectionDecision.selectedDecorationAssetId,
      selectedSerial: selectionDecision.selectedDecorationSerial,
      selectedCategory: selectionDecision.selectedDecorationCategory,
    },
    photo: {
      ...photo,
      selectedAssetId: selectionDecision.topPhotoAssetId,
      selectedSerial: selectionDecision.topPhotoSerial,
      selectedCategory: selectionDecision.topPhotoCategory,
    },
    font: font ?? {
      family: "font",
      queryAttempts: [],
      returnedCount: 0,
      filteredCount: 0,
      fallbackUsed: true,
      selectedAssetId: null,
      selectedSerial: null,
      selectedCategory: null,
    },
  };
}

export function buildSelectionLogMessages(
  sourceSearchSummary: SourceSearchSummary,
  typographyDecision: TypographyDecision,
  selectionDecision: SelectionDecision,
): Array<{ level: "info" | "warn"; message: string }> {
  if (sourceSearchSummary.sourceMode === "placeholder") {
    return [];
  }

  return [
    {
      level: "info",
      message:
        `[source/background] returned=${sourceSearchSummary.background.returnedCount} ` +
        `selectedSerial=${sourceSearchSummary.background.selectedSerial ?? "n/a"} ` +
        `kind=${sourceSearchSummary.background.selectedCategory ?? "n/a"}`,
    },
    {
      level: "info",
      message:
        `[source/graphic] returned=${sourceSearchSummary.graphic.returnedCount} ` +
        `selectedSerial=${sourceSearchSummary.graphic.selectedSerial ?? "n/a"} ` +
        `category=${sourceSearchSummary.graphic.selectedCategory ?? "n/a"}`,
    },
    {
      level:
        sourceSearchSummary.photo.selectedSerial && sourceSearchSummary.photo.selectedCategory
          ? "info"
          : "warn",
      message:
        `[source/photo] returned=${sourceSearchSummary.photo.returnedCount} ` +
        `selectedSerial=${sourceSearchSummary.photo.selectedSerial ?? "n/a"} ` +
        `orientation=${sourceSearchSummary.photo.selectedCategory ?? "n/a"}`,
    },
    {
      level: typographyDecision.fallbackUsed ? "warn" : "info",
      message:
        `[source/font] inventory=${typographyDecision.inventoryCount} ` +
        `display=${typographyDecision.display?.fontToken ?? "fallback"} ` +
        `body=${typographyDecision.body?.fontToken ?? "fallback"}`,
    },
    {
      level:
        selectionDecision.photoBranchMode === "photo_selected" ? "info" : "warn",
      message:
        `[source/photo-branch] mode=${selectionDecision.photoBranchMode} ` +
        `reason=${selectionDecision.photoBranchReason}`,
    },
    ...(selectionDecision.photoBranchMode === "photo_selected"
      ? [
          {
            level: "info" as const,
            message:
              `[source/photo-execution] serial=${selectionDecision.topPhotoSerial ?? "n/a"} ` +
              `url=${selectionDecision.topPhotoUrl ?? "n/a"} fit=cover crop=centered_cover`,
          },
        ]
      : []),
  ];
}

export function buildFinalizeOptions(
  state: ArtifactRefState,
  cooperativeStopRequested: boolean,
  assignedSeqs: number[],
  overrideResult?: {
    finalStatus: FinalizeRunDraft["request"]["finalStatus"];
    errorSummary?: FinalizeRunDraft["request"]["errorSummary"];
  },
) {
  const base = {
    cooperativeStopRequested,
    ...(state.normalizedIntentRef
      ? { normalizedIntentRef: state.normalizedIntentRef }
      : {}),
    ...pickDefinedStringRefs(state, OPTIONAL_ARTIFACT_REF_KEYS),
    ...(state.judgePlan && state.judgePlan.recommendation !== "keep"
      ? {
          warningSummary: state.judgePlan.issues.map((issue) => ({
            code: issue.code,
            message: issue.message,
          })),
        }
      : state.ruleJudgeVerdict?.recommendation === "refine"
        ? {
            warningSummary: state.ruleJudgeVerdict.issues.map((issue) => ({
              code: issue.code,
              message: issue.message,
            })),
          }
        : {}),
    assignedSeqs,
    ...(overrideResult ? { overrideResult } : {}),
  };

  return base;
}

export function buildArtifactRefs(
  state: ArtifactRefState,
): ProcessRunJobResult["artifactRefs"] {
  if (!state.normalizedIntentRef) {
    throw new Error("LangGraph run completed without normalized intent artifact");
  }

  return {
    normalizedIntentRef: state.normalizedIntentRef,
    ...pickDefinedStringRefs(state, OPTIONAL_ARTIFACT_REF_KEYS),
  };
}

export function buildStageAckRecord(
  proposal: WorkerMutationProposalDraft,
  ack: WaitMutationAckResponse,
): StageAckRecord {
  return {
    stageLabel: proposal.stageLabel,
    mutationId: proposal.mutationId,
    seq: ack.seq ?? null,
    status: ack.status,
    resultingRevision: ack.resultingRevision ?? null,
    resolvedLayerIds: ack.resolvedLayerIds ?? null,
    commands: proposal.mutation.commands.map((command) => ({
      op: command.op,
      slotKey: command.slotKey ?? null,
      executionSlotKey:
        "executionSlotKey" in command ? command.executionSlotKey ?? null : null,
      clientLayerKey:
        "clientLayerKey" in command && typeof command.clientLayerKey === "string"
          ? command.clientLayerKey
          : null,
      role:
        command.op === "createLayer" &&
        typeof command.layerBlueprint.metadata.role === "string"
          ? command.layerBlueprint.metadata.role
          : command.op === "updateLayer" &&
              typeof command.metadataTags.role === "string"
            ? command.metadataTags.role
            : null,
      targetLayerId:
        "targetRef" in command && command.targetRef.layerId
          ? command.targetRef.layerId
          : null,
      proposedBounds:
        command.op === "createLayer"
          ? command.layerBlueprint.bounds
          : command.op === "updateLayer" &&
              command.patch &&
              typeof command.patch === "object" &&
              "bounds" in command.patch &&
              command.patch.bounds &&
              typeof command.patch.bounds === "object"
            ? {
                x: Number((command.patch.bounds as { x?: number }).x ?? 0),
                y: Number((command.patch.bounds as { y?: number }).y ?? 0),
                width: Number((command.patch.bounds as { width?: number }).width ?? 0),
                height: Number((command.patch.bounds as { height?: number }).height ?? 0),
              }
            : null,
    })),
  };
}

function pickDefinedStringRefs<
  TState extends Record<string, string | null | RuleJudgeVerdict | JudgePlan>,
  TKey extends readonly (keyof TState)[],
>(
  state: TState,
  keys: TKey,
): Partial<Record<TKey[number], string>> {
  const result: Partial<Record<TKey[number], string>> = {};
  for (const key of keys) {
    const value = state[key];
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}
