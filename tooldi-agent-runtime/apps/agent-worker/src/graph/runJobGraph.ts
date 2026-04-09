import {
  Annotation,
  END,
  MemorySaver,
  START,
  StateGraph,
  task,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";
import type {
  RunJobEnvelope,
  TemplatePriorSummary,
  WaitMutationAckResponse,
} from "@tooldi/agent-contracts";
import type { AgentWorkerEnv } from "@tooldi/agent-config";
import { parseTemplateIntentDraft } from "@tooldi/agent-llm";
import type {
  TemplateIntentDraft,
  TemplatePlanner,
  TemplatePlannerMode,
} from "@tooldi/agent-llm";
import type { Logger } from "@tooldi/agent-observability";
import type { ObjectStoreClient } from "@tooldi/agent-persistence";
import type {
  AssetStorageClient,
  ImagePrimitiveClient,
  TemplateCatalogClient,
  TextLayoutHelper,
  TooldiCatalogSourceClient,
} from "@tooldi/tool-adapters";
import {
  createPlaceholderTooldiCatalogSourceClient,
  TooldiCatalogSourceError,
} from "@tooldi/tool-adapters";
import type { ToolRegistry } from "@tooldi/tool-registry";

import type { BackendCallbackClient } from "../clients/backendCallbackClient.js";
import {
  assembleTemplateCandidates,
  SpringCatalogActivationError,
} from "../phases/assembleTemplateCandidates.js";
import { buildPlannerDraft } from "../phases/buildPlannerDraft.js";
import { buildSearchProfile } from "../phases/buildSearchProfile.js";
import { buildTemplatePriorSummary } from "../phases/buildTemplatePriorSummary.js";
import { buildExecutablePlan } from "../phases/buildExecutablePlan.js";
import { buildNormalizedIntent } from "../phases/buildNormalizedIntent.js";
import { emitRefinementMutations } from "../phases/emitRefinementMutations.js";
import { emitSkeletonMutations } from "../phases/emitSkeletonMutations.js";
import { finalizeRun } from "../phases/finalizeRun.js";
import { hydratePlanningInput } from "../phases/hydratePlanningInput.js";
import { runRetrievalStage } from "../phases/runRetrievalStage.js";
import { ruleJudgeCreateTemplate } from "../phases/ruleJudge.js";
import { selectTypography } from "../phases/selectTypography.js";
import { selectTemplateComposition } from "../phases/selectTemplateComposition.js";
import type {
  FinalizeRunDraft,
  HydratedPlanningInput,
  IntentNormalizationReport,
  MutationProposalDraft as WorkerMutationProposalDraft,
  NormalizedIntent,
  NormalizedIntentDraftArtifact,
  ProcessRunJobResult,
  RetrievalStageResult,
  RuleJudgeVerdict,
  SearchProfileArtifact,
  SelectionDecision,
  SkeletonMutationBatch,
  SourceSearchSummary,
  TemplateCandidateBundle,
  TemplateSelectionPolicy,
  TypographyDecision,
} from "../types.js";

type SourceSearchBackground = SourceSearchSummary["background"];
type SourceSearchGraphic = SourceSearchSummary["graphic"];
type SourceSearchPhoto = SourceSearchSummary["photo"];
type SourceSearchFont = SourceSearchSummary["font"];

export interface RunJobGraphDependencies {
  env: AgentWorkerEnv;
  logger: Logger;
  objectStore: ObjectStoreClient;
  callbackClient: BackendCallbackClient;
  toolRegistry: ToolRegistry;
  imagePrimitiveClient: ImagePrimitiveClient;
  assetStorageClient: AssetStorageClient;
  textLayoutHelper: TextLayoutHelper;
  templateCatalogClient: TemplateCatalogClient;
  tooldiCatalogSourceClient?: TooldiCatalogSourceClient;
  langGraphCheckpointer?: BaseCheckpointSaver;
  templatePlanner?: TemplatePlanner;
}

const replaceValue = <T>(defaultFactory: () => T) =>
  Annotation<T>({
    reducer: (_left, right) => right,
    default: defaultFactory,
  });

const RunJobGraphState = Annotation.Root({
  job: Annotation<RunJobEnvelope>(),
  cooperativeStopRequested: replaceValue(() => false),
  hydrated: replaceValue<HydratedPlanningInput | null>(() => null),
  resolvedPlannerMode: replaceValue<TemplatePlannerMode>(() => "heuristic"),
  normalizedIntentDraft: replaceValue<NormalizedIntentDraftArtifact | null>(() => null),
  normalizedIntentDraftRef: replaceValue<string | null>(() => null),
  intentNormalizationReport: replaceValue<IntentNormalizationReport | null>(() => null),
  intentNormalizationReportRef: replaceValue<string | null>(() => null),
  intent: replaceValue<NormalizedIntent | null>(() => null),
  normalizedIntentRef: replaceValue<string | null>(() => null),
  templatePriorSummary: replaceValue<TemplatePriorSummary | null>(() => null),
  templatePriorSummaryRef: replaceValue<string | null>(() => null),
  searchProfile: replaceValue<SearchProfileArtifact | null>(() => null),
  searchProfileRef: replaceValue<string | null>(() => null),
  retrievalStage: replaceValue<RetrievalStageResult | null>(() => null),
  retrievalStageRef: replaceValue<string | null>(() => null),
  selectionPolicy: replaceValue<TemplateSelectionPolicy | null>(() => null),
  candidateSets: replaceValue<TemplateCandidateBundle | null>(() => null),
  candidateSetRef: replaceValue<string | null>(() => null),
  sourceSearchBackground: replaceValue<SourceSearchBackground | null>(() => null),
  sourceSearchGraphic: replaceValue<SourceSearchGraphic | null>(() => null),
  sourceSearchPhoto: replaceValue<SourceSearchPhoto | null>(() => null),
  selectionDecision: replaceValue<SelectionDecision | null>(() => null),
  selectionDecisionRef: replaceValue<string | null>(() => null),
  typographyDecision: replaceValue<TypographyDecision | null>(() => null),
  typographyDecisionRef: replaceValue<string | null>(() => null),
  typographySearchSummary: replaceValue<SourceSearchFont | null>(() => null),
  sourceSearchSummary: replaceValue<SourceSearchSummary | null>(() => null),
  sourceSearchSummaryRef: replaceValue<string | null>(() => null),
  plan: replaceValue<ProcessRunJobResult["plan"] | null>(() => null),
  executablePlanRef: replaceValue<string | null>(() => null),
  ruleJudgeVerdict: replaceValue<RuleJudgeVerdict | null>(() => null),
  ruleJudgeVerdictRef: replaceValue<string | null>(() => null),
  skeletonBatch: replaceValue<SkeletonMutationBatch | null>(() => null),
  currentStageIndex: replaceValue(() => 0),
  currentProposal: replaceValue<WorkerMutationProposalDraft | null>(() => null),
  currentMutationId: replaceValue<string | null>(() => null),
  emittedMutationIds: replaceValue<string[]>(() => []),
  assignedSeqs: replaceValue<number[]>(() => []),
  lastMutationAck: replaceValue<WaitMutationAckResponse | null>(() => null),
  finalizeDraft: replaceValue<FinalizeRunDraft | null>(() => null),
  result: replaceValue<ProcessRunJobResult | null>(() => null),
});

type RunJobGraphStateType = typeof RunJobGraphState.State;

export function buildRunJobGraph(dependencies: RunJobGraphDependencies) {
  const tooldiCatalogSourceClient =
    dependencies.tooldiCatalogSourceClient ??
    createPlaceholderTooldiCatalogSourceClient();

  const heartbeatTask = task(
    "worker_heartbeat",
    async (
      runId: string,
      payload: Parameters<BackendCallbackClient["heartbeat"]>[1],
    ) => dependencies.callbackClient.heartbeat(runId, payload),
  );
  const appendEventTask = task(
    "worker_append_event",
    async (
      runId: string,
      payload: Parameters<BackendCallbackClient["appendEvent"]>[1],
    ) => dependencies.callbackClient.appendEvent(runId, payload),
  );
  const waitMutationAckTask = task(
    "worker_wait_mutation_ack",
    async (
      runId: string,
      mutationId: string,
      payload: Parameters<BackendCallbackClient["waitMutationAck"]>[2],
    ) => dependencies.callbackClient.waitMutationAck(runId, mutationId, payload),
  );
  const finalizeTask = task(
    "worker_finalize",
    async (
      runId: string,
      payload: Parameters<BackendCallbackClient["finalize"]>[1],
    ) => dependencies.callbackClient.finalize(runId, payload),
  );
  const persistArtifactTask = task(
    "worker_persist_json_artifact",
    async (
      key: string,
      payload: unknown,
      metadata: Record<string, string>,
    ) => persistWorkerJsonArtifact(dependencies.objectStore, key, payload, metadata),
  );

  const graph = new StateGraph(RunJobGraphState)
    .addNode("hydrate_input", async (state) => {
      const heartbeatBase = buildHeartbeatBase(state.job);
      let cooperativeStopRequested = state.cooperativeStopRequested;

      const planningHeartbeat = await heartbeatTask(state.job.runId, {
        ...heartbeatBase,
        attemptState: "hydrating",
        phase: "planning",
        heartbeatAt: new Date().toISOString(),
      });
      cooperativeStopRequested = shouldStopAfterCurrentAction(planningHeartbeat);

      const planningEvent = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "phase",
          phase: "planning",
          message: "Worker started planning input hydration",
        },
      });
      cooperativeStopRequested ||= planningEvent.cancelRequested;

      const hydrated = await hydratePlanningInput(state.job, {
        objectStore: dependencies.objectStore,
        objectStoreBucket: dependencies.env.objectStoreBucket,
      });

      if (hydrated.repairContext) {
        const recoveryLog = await appendEventTask(state.job.runId, {
          traceId: state.job.traceId,
          attempt: state.job.attemptSeq,
          queueJobId: state.job.queueJobId,
          event: {
            type: "log",
            level: "warn",
            message: `Recovery handoff received: state=${hydrated.repairContext.recovery.state} reason=${hydrated.repairContext.reasonCode}`,
          },
        });
        cooperativeStopRequested ||= recoveryLog.cancelRequested;
      }

      return {
        hydrated,
        cooperativeStopRequested,
      };
    })
    .addNode("plan_intent_draft", async (state) => {
      if (!state.hydrated) {
        throw new Error("plan_intent_draft requires hydrated input");
      }

      let cooperativeStopRequested = state.cooperativeStopRequested;
      const plannerResolution = await buildPlannerDraft(
        state.hydrated,
        dependencies.templatePlanner
          ? { templatePlanner: dependencies.templatePlanner }
          : undefined,
      );
      const { plannerDraft } = plannerResolution;

      if (plannerResolution.fallbackReason) {
        const fallbackEvent = await appendEventTask(state.job.runId, {
          traceId: state.job.traceId,
          attempt: state.job.attemptSeq,
          queueJobId: state.job.queueJobId,
          event: {
            type: "log",
            level: "warn",
            message: plannerResolution.fallbackReason,
          },
        });
        cooperativeStopRequested ||= fallbackEvent.cancelRequested;
      }

      if (!plannerDraft) {
        return {
          resolvedPlannerMode: plannerResolution.plannerMode,
          normalizedIntentDraftRef: null,
          cooperativeStopRequested,
        };
      }

      const normalizedIntentDraftRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/normalized-intent-draft.json`,
        plannerDraft,
        {
          artifactKind: "normalized-intent-draft",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );

      const draftEvent = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "log",
          level: "info",
          message: "Planner draft prepared before intent normalization",
        },
      });
      cooperativeStopRequested ||= draftEvent.cancelRequested;

      return {
        resolvedPlannerMode: plannerResolution.plannerMode,
        normalizedIntentDraftRef,
        cooperativeStopRequested,
      };
    })
    .addNode("normalize_intent", async (state) => {
      if (!state.hydrated) {
        throw new Error("normalize_intent requires hydrated input");
      }

      let cooperativeStopRequested = state.cooperativeStopRequested;
      const persistedPlannerDraft = state.normalizedIntentDraftRef
        ? await readWorkerJsonArtifact<TemplateIntentDraft>(
            dependencies.objectStore,
            dependencies.env.objectStoreBucket,
            state.normalizedIntentDraftRef,
            parseTemplateIntentDraft,
          )
        : null;
      const normalizedIntent = await buildNormalizedIntent(
        state.hydrated,
        {
          ...(dependencies.templatePlanner
            ? { templatePlanner: dependencies.templatePlanner }
            : {}),
          plannerDraft: persistedPlannerDraft,
          plannerMode: state.resolvedPlannerMode,
        },
      );
      const {
        intent,
        normalizedIntentDraft,
        intentNormalizationReport,
      } = normalizedIntent;

      const intentEvent = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "log",
          level: "info",
          message: `Normalized intent prepared for ${intent.operationFamily}`,
        },
      });
      cooperativeStopRequested ||= intentEvent.cancelRequested;

      const intentNormalizationReportRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/intent-normalization-report.json`,
        intentNormalizationReport,
        {
          artifactKind: "intent-normalization-report",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );

      const normalizedIntentRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/normalized-intent.json`,
        intent,
        {
          artifactKind: "normalized-intent",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );
      const canonicalIntent = await readWorkerJsonArtifact<NormalizedIntent>(
        dependencies.objectStore,
        dependencies.env.objectStoreBucket,
        normalizedIntentRef,
      );

      return {
        normalizedIntentDraft,
        intentNormalizationReport,
        intentNormalizationReportRef,
        intent: canonicalIntent,
        normalizedIntentRef,
        cooperativeStopRequested,
      };
    })
    .addNode("gate_scope", async (state) => {
      if (!state.hydrated || !state.intent || !state.normalizedIntentRef) {
        throw new Error("gate_scope requires normalized intent state");
      }

      if (
        state.intent.operationFamily === "create_template" &&
        state.intent.supportedInV1
      ) {
        return {};
      }

      let cooperativeStopRequested = state.cooperativeStopRequested;
      const heartbeatBase = buildHeartbeatBase(state.job);

      const unsupportedLog = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "log",
          level: "warn",
          message:
            "Spring vertical slice currently supports empty canvas create_template only",
        },
      });
      cooperativeStopRequested ||= unsupportedLog.cancelRequested;

      const savingHeartbeat = await heartbeatTask(state.job.runId, {
        ...heartbeatBase,
        attemptState: "finalizing",
        phase: "saving",
        heartbeatAt: new Date().toISOString(),
      });
      cooperativeStopRequested ||= shouldStopAfterCurrentAction(savingHeartbeat);

      const finalizeDraft = await finalizeRun(state.hydrated, [], null, {
        cooperativeStopRequested,
        normalizedIntentRef: state.normalizedIntentRef,
        overrideResult: {
          finalStatus: "failed",
          errorSummary: {
            code: "unsupported_v1_vertical_slice",
            message:
              "Spring vertical slice only supports empty-canvas create_template runs",
          },
        },
      });

      return {
        cooperativeStopRequested,
        finalizeDraft,
      };
    })
    .addNode("build_search_profile", async (state) => {
      if (!state.intent || !state.templatePriorSummary) {
        throw new Error("build_search_profile requires normalized intent state");
      }

      let cooperativeStopRequested = state.cooperativeStopRequested;
      const searchProfile = await buildSearchProfile(
        state.intent,
        state.templatePriorSummary,
      );
      const searchProfileRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/search-profile.json`,
        searchProfile,
        {
          artifactKind: "search-profile",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );

      const searchProfileLog = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "log",
          level: "info",
          message:
            `[planner/search-profile] domain=${searchProfile.domain} ` +
            `goal=${searchProfile.campaignGoal} ` +
            `background=${searchProfile.background.queries[0]?.keyword ?? "n/a"} ` +
            `graphic=${searchProfile.graphic.queries[0]?.keyword ?? "n/a"} ` +
            `photo=${searchProfile.photo.queries[0]?.keyword ?? "n/a"}`,
        },
      });
      cooperativeStopRequested ||= searchProfileLog.cancelRequested;

      return {
        searchProfile,
        searchProfileRef,
        cooperativeStopRequested,
      };
    })
    .addNode("build_template_prior_summary", async (state) => {
      if (!state.intent) {
        throw new Error(
          "build_template_prior_summary requires normalized intent state",
        );
      }

      let cooperativeStopRequested = state.cooperativeStopRequested;
      const templatePriorSummary = await buildTemplatePriorSummary(state.intent);
      const templatePriorSummaryRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/template-prior-summary.json`,
        templatePriorSummary,
        {
          artifactKind: "template-prior-summary",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );

      const priorLog = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "log",
          level: "info",
          message:
            `[planner/prior-summary] dominant=${templatePriorSummary.dominantThemePrior} ` +
            `templateStatus=${templatePriorSummary.selectedTemplatePrior.status} ` +
            `templateKeyword=${templatePriorSummary.selectedTemplatePrior.keyword ?? "n/a"}`,
        },
      });
      cooperativeStopRequested ||= priorLog.cancelRequested;

      return {
        templatePriorSummary,
        templatePriorSummaryRef,
        cooperativeStopRequested,
      };
    })
    .addNode("compute_retrieval_policy", async (state) => {
      if (!state.hydrated || !state.intent) {
        throw new Error("compute_retrieval_policy requires hydrated intent state");
      }

      const retrievalDecision = await runRetrievalStage(state.hydrated, state.intent, {
        toolRegistry: dependencies.toolRegistry,
      });
      const retrievalStageRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/retrieval-stage.json`,
        retrievalDecision.retrievalStage,
        {
          artifactKind: "retrieval-stage",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );

      return {
        retrievalStage: retrievalDecision.retrievalStage,
        selectionPolicy: retrievalDecision.selectionPolicy,
        retrievalStageRef,
      };
    })
    .addNode("assemble_candidates", async (state) => {
      if (
        !state.hydrated ||
        !state.intent ||
        !state.selectionPolicy ||
        !state.searchProfile ||
        !state.templatePriorSummary
      ) {
        throw new Error("assemble_candidates requires retrieval policy state");
      }

      try {
        const candidateAssembly = await assembleTemplateCandidates(
          state.hydrated,
          state.intent,
          state.searchProfile,
          state.templatePriorSummary,
          {
            templateCatalogClient: dependencies.templateCatalogClient,
            tooldiCatalogSourceClient,
            sourceMode: dependencies.env.tooldiCatalogSourceMode,
            allowPhotoCandidates: state.selectionPolicy.allowPhotoCandidates,
          },
        );

        const candidateSetRef = await persistArtifactTask(
          `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/template-candidate-set.json`,
          candidateAssembly.candidates,
          {
            artifactKind: "template-candidate-set",
            runId: state.job.runId,
            traceId: state.job.traceId,
            attemptSeq: String(state.job.attemptSeq),
          },
        );

        return {
          candidateSets: candidateAssembly.candidates,
          candidateSetRef,
          sourceSearchBackground: candidateAssembly.sourceSearch.background,
          sourceSearchGraphic: candidateAssembly.sourceSearch.graphic,
          sourceSearchPhoto: candidateAssembly.sourceSearch.photo,
        };
      } catch (error) {
        if (!isSpringActivationFailure(error) || !state.hydrated || !state.normalizedIntentRef) {
          throw error;
        }

        let cooperativeStopRequested = state.cooperativeStopRequested;
        const heartbeatBase = buildHeartbeatBase(state.job);

        const failureLog = await appendEventTask(state.job.runId, {
          traceId: state.job.traceId,
          attempt: state.job.attemptSeq,
          queueJobId: state.job.queueJobId,
          event: {
            type: "log",
            level: "error",
            message: `Real Tooldi source activation failed: ${error.message}`,
          },
        });
        cooperativeStopRequested ||= failureLog.cancelRequested;

        const savingHeartbeat = await heartbeatTask(state.job.runId, {
          ...heartbeatBase,
          attemptState: "finalizing",
          phase: "saving",
          heartbeatAt: new Date().toISOString(),
        });
        cooperativeStopRequested ||= shouldStopAfterCurrentAction(savingHeartbeat);

        const finalizeDraft = await finalizeRun(state.hydrated, [], null, {
          cooperativeStopRequested,
          normalizedIntentRef: state.normalizedIntentRef,
          overrideResult: {
            finalStatus: "failed",
            errorSummary: {
              code: getSpringActivationErrorCode(error),
              message: error.message,
            },
          },
        });

        return {
          cooperativeStopRequested,
          finalizeDraft,
        };
      }
    })
    .addNode("select_composition", async (state) => {
      if (!state.intent || !state.candidateSets || !state.retrievalStage || !state.selectionPolicy) {
        throw new Error("select_composition requires candidate and retrieval state");
      }

      const selectionDecision = await selectTemplateComposition(
        state.intent,
        state.candidateSets,
        {
          retrievalStage: state.retrievalStage,
          selectionPolicy: state.selectionPolicy,
        },
      );
      const selectionDecisionRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/selection-decision.json`,
        selectionDecision,
        {
          artifactKind: "selection-decision",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );

      return {
        selectionDecision,
        selectionDecisionRef,
      };
    })
    .addNode("select_typography", async (state) => {
      if (!state.hydrated) {
        throw new Error("select_typography requires hydrated state");
      }

      const typographySelection = await selectTypography(state.hydrated, {
        sourceClient: tooldiCatalogSourceClient,
        sourceMode: dependencies.env.tooldiCatalogSourceMode,
      });
      const typographyDecisionRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/typography-decision.json`,
        typographySelection.decision,
        {
          artifactKind: "typography-decision",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );

      return {
        typographyDecision: typographySelection.decision,
        typographyDecisionRef,
        typographySearchSummary: typographySelection.summary,
      };
    })
    .addNode("persist_selection_artifacts", async (state) => {
      if (
        !state.selectionDecision ||
        !state.typographyDecision ||
        !state.sourceSearchBackground ||
        !state.sourceSearchGraphic ||
        !state.sourceSearchPhoto
      ) {
        throw new Error("persist_selection_artifacts requires selection and search state");
      }

      let cooperativeStopRequested = state.cooperativeStopRequested;
      const sourceSearchSummary = buildSourceSearchSummary(
        state.job.runId,
        state.job.traceId,
        dependencies.env.tooldiCatalogSourceMode,
        state.sourceSearchBackground,
        state.sourceSearchGraphic,
        state.sourceSearchPhoto,
        state.typographySearchSummary ?? undefined,
        state.selectionDecision,
      );
      const sourceSearchSummaryRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/source-search-summary.json`,
        sourceSearchSummary,
        {
          artifactKind: "source-search-summary",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );

      for (const message of buildSelectionLogMessages(
        sourceSearchSummary,
        state.typographyDecision,
        state.selectionDecision,
      )) {
        const sourceLog = await appendEventTask(state.job.runId, {
          traceId: state.job.traceId,
          attempt: state.job.attemptSeq,
          queueJobId: state.job.queueJobId,
          event: {
            type: "log",
            level: message.level,
            message: message.message,
          },
        });
        cooperativeStopRequested ||= sourceLog.cancelRequested;
      }

      const selectionEvent = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "log",
          level: "info",
          message:
            `[source/selection] background=${state.selectionDecision.selectedBackgroundSerial ?? "n/a"} ` +
            `(${state.selectionDecision.selectedBackgroundCategory ?? "n/a"}) ` +
            `layout=${state.selectionDecision.layoutMode} ` +
            `decoration=${state.selectionDecision.selectedDecorationSerial ?? "n/a"} ` +
            `(${state.selectionDecision.selectedDecorationCategory ?? "n/a"}) ` +
            `photoBranch=${state.selectionDecision.photoBranchMode} ` +
            `photo=${state.selectionDecision.topPhotoSerial ?? "n/a"} ` +
            `(${state.selectionDecision.topPhotoCategory ?? "n/a"})`,
        },
      });
      cooperativeStopRequested ||= selectionEvent.cancelRequested;

      return {
        sourceSearchSummary,
        sourceSearchSummaryRef,
        cooperativeStopRequested,
      };
    })
    .addNode("build_plan", async (state) => {
      if (!state.hydrated || !state.intent || !state.selectionDecision || !state.typographyDecision) {
        throw new Error("build_plan requires intent/selection/typography state");
      }

      const plan = await buildExecutablePlan(
        state.hydrated,
        state.intent,
        state.selectionDecision,
        state.typographyDecision,
        {
          toolRegistry: dependencies.toolRegistry,
        },
      );
      const executablePlanRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/executable-plan.json`,
        plan,
        {
          artifactKind: "executable-plan",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );

      return {
        plan,
        executablePlanRef,
      };
    })
    .addNode("rule_judge", async (state) => {
      if (
        !state.intent ||
        !state.searchProfile ||
        !state.selectionDecision ||
        !state.typographyDecision ||
        !state.sourceSearchSummary ||
        !state.plan
      ) {
        throw new Error("rule_judge requires intent/search/selection/typography/source/plan state");
      }

      let cooperativeStopRequested = state.cooperativeStopRequested;
      const ruleJudgeVerdict = await ruleJudgeCreateTemplate(
        state.intent,
        state.searchProfile,
        state.selectionDecision,
        state.typographyDecision,
        state.sourceSearchSummary,
        state.plan,
        state.templatePriorSummary,
      );
      const ruleJudgeVerdictRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/rule-judge-verdict.json`,
        ruleJudgeVerdict,
        {
          artifactKind: "rule-judge-verdict",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );

      const judgeLog = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "log",
          level: ruleJudgeVerdict.recommendation === "refuse" ? "error" : "info",
          message:
            `[judge/verdict] recommendation=${ruleJudgeVerdict.recommendation} ` +
            `confidence=${ruleJudgeVerdict.confidence} issues=${ruleJudgeVerdict.issues.length}`,
        },
      });
      cooperativeStopRequested ||= judgeLog.cancelRequested;

      return {
        cooperativeStopRequested,
        ruleJudgeVerdict,
        ruleJudgeVerdictRef,
      };
    })
    .addNode("prepare_execution", async (state) => {
      if (!state.hydrated || !state.intent || !state.plan) {
        throw new Error("prepare_execution requires resolved plan state");
      }

      let cooperativeStopRequested = state.cooperativeStopRequested;
      const heartbeatBase = buildHeartbeatBase(state.job);

      const executingHeartbeat = await heartbeatTask(state.job.runId, {
        ...heartbeatBase,
        attemptState: "running",
        phase: "executing",
        heartbeatAt: new Date().toISOString(),
      });
      cooperativeStopRequested ||= shouldStopAfterCurrentAction(executingHeartbeat);

      const executingEvent = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "phase",
          phase: "executing",
          message: "Worker is emitting staged canvas mutations",
        },
      });
      cooperativeStopRequested ||= executingEvent.cancelRequested;

      const skeletonBatch = cooperativeStopRequested
        ? {
            commitGroup:
              state.plan.actions[0]?.commitGroup ?? "cancelled_before_mutation",
            proposals: [],
          }
        : await emitSkeletonMutations(state.hydrated, state.intent, state.plan, {
            textLayoutHelper: dependencies.textLayoutHelper,
          });

      return {
        cooperativeStopRequested,
        skeletonBatch,
        currentStageIndex: 0,
        currentProposal: skeletonBatch.proposals[0] ?? null,
        currentMutationId: null,
        lastMutationAck: cooperativeStopRequested
          ? ({
              found: true,
              status: "cancelled",
            } satisfies WaitMutationAckResponse)
          : null,
        emittedMutationIds: [],
        assignedSeqs: [],
      };
    })
    .addNode("emit_stage", async (state) => {
      if (!state.currentProposal || !state.skeletonBatch) {
        throw new Error("emit_stage requires an active mutation proposal");
      }

      let cooperativeStopRequested = state.cooperativeStopRequested;
      const proposal = state.currentProposal;
      const totalStages = state.skeletonBatch.proposals.length;

      const stageLog = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "log",
          level: "info",
          message: `Stage ${proposal.mutation.seq}/${totalStages} (${proposal.stageLabel}) - ${proposal.stageDescription}`,
        },
      });
      if (stageLog.cancelRequested) {
        return {
          cooperativeStopRequested: true,
          currentMutationId: null,
          lastMutationAck: {
            found: true,
            status: "cancelled",
          } satisfies WaitMutationAckResponse,
        };
      }

      if (proposal.stageLabel === "photo") {
        const heroCommand = proposal.mutation.commands.find(
          (command) =>
            command.op === "createLayer" && command.slotKey === "hero_image",
        );
        const bounds =
          heroCommand && "layerBlueprint" in heroCommand
            ? heroCommand.layerBlueprint.bounds
            : null;
        const photoStageLog = await appendEventTask(state.job.runId, {
          traceId: state.job.traceId,
          attempt: state.job.attemptSeq,
          queueJobId: state.job.queueJobId,
          event: {
            type: "log",
            level: "info",
            message:
              `[source/photo-stage] seq=${proposal.mutation.seq} ` +
              `heroBounds=${bounds ? `${bounds.x},${bounds.y},${bounds.width},${bounds.height}` : "n/a"}`,
          },
        });
        if (photoStageLog.cancelRequested) {
          return {
            cooperativeStopRequested: true,
            currentMutationId: null,
            lastMutationAck: {
              found: true,
              status: "cancelled",
            } satisfies WaitMutationAckResponse,
          };
        }
      }

      const emittedMutationIds = [...state.emittedMutationIds, proposal.mutationId];
      const mutationResponse = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "mutation.proposed",
          mutationId: proposal.mutationId,
          rollbackGroupId: proposal.rollbackGroupId,
          mutation: proposal.mutation,
        },
      });

      if (mutationResponse.cancelRequested) {
        return {
          emittedMutationIds,
          cooperativeStopRequested: true,
          currentMutationId: null,
          lastMutationAck: {
            found: true,
            status: "cancelled",
          } satisfies WaitMutationAckResponse,
        };
      }

      return {
        emittedMutationIds,
        assignedSeqs: [
          ...state.assignedSeqs,
          mutationResponse.assignedSeq ?? proposal.mutation.seq,
        ],
        currentMutationId: proposal.mutationId,
      };
    })
    .addNode("await_stage_ack", async (state) => {
      if (!state.currentProposal || !state.currentMutationId || !state.skeletonBatch) {
        throw new Error("await_stage_ack requires an emitted mutation");
      }

      let cooperativeStopRequested = state.cooperativeStopRequested;
      const proposal = state.currentProposal;
      const totalStages = state.skeletonBatch.proposals.length;
      let lastMutationAck = await waitMutationAckTask(
        state.job.runId,
        state.currentMutationId,
        { waitMs: 15000 },
      );

      if (lastMutationAck.status === "cancelled") {
        cooperativeStopRequested = true;
      }

      const ackLog = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "log",
          level: lastMutationAck.status === "acked" ? "info" : "warn",
          message:
            lastMutationAck.status === "rejected" && lastMutationAck.error
              ? `Stage ${proposal.mutation.seq}/${totalStages} result: rejected code=${lastMutationAck.error.code} message=${lastMutationAck.error.message}`
              : `Stage ${proposal.mutation.seq}/${totalStages} result: ${lastMutationAck.status}`,
        },
      });
      if (ackLog.cancelRequested) {
        cooperativeStopRequested = true;
        lastMutationAck = {
          found: true,
          status: "cancelled",
        } satisfies WaitMutationAckResponse;
      }

      if (lastMutationAck.status !== "acked") {
        const failFastLog = await appendEventTask(state.job.runId, {
          traceId: state.job.traceId,
          attempt: state.job.attemptSeq,
          queueJobId: state.job.queueJobId,
          event: {
            type: "log",
            level: "warn",
            message:
              proposal.stageLabel === "photo"
                ? "Fail-fast policy stopped remaining stages after the photo stage was not acknowledged"
                : `Stopped remaining stages after ${proposal.stageLabel} stage returned ${lastMutationAck.status}`,
          },
        });
        cooperativeStopRequested ||= failFastLog.cancelRequested;
      }

      return {
        cooperativeStopRequested,
        lastMutationAck,
      };
    })
    .addNode("advance_after_ack", async (state) => {
      if (!state.skeletonBatch) {
        throw new Error("advance_after_ack requires skeleton batch state");
      }

      if (state.lastMutationAck?.status !== "acked") {
        return {
          currentMutationId: null,
          currentProposal: null,
        };
      }

      const nextStageIndex = state.currentStageIndex + 1;
      return {
        currentStageIndex: nextStageIndex,
        currentMutationId: null,
        currentProposal: state.skeletonBatch.proposals[nextStageIndex] ?? null,
      };
    })
    .addNode("run_refinement", async (state) => {
      if (!state.hydrated || !state.intent) {
        throw new Error("run_refinement requires hydrated intent state");
      }

      let cooperativeStopRequested = state.cooperativeStopRequested;
      const shouldAttemptRefinement =
        !cooperativeStopRequested &&
        (state.lastMutationAck === null || state.lastMutationAck.status === "acked");

      if (!shouldAttemptRefinement) {
        return {
          cooperativeStopRequested,
        };
      }

      const heartbeatBase = buildHeartbeatBase(state.job);
      const applyingHeartbeat = await heartbeatTask(state.job.runId, {
        ...heartbeatBase,
        attemptState: "awaiting_ack",
        phase: "applying",
        heartbeatAt: new Date().toISOString(),
      });
      cooperativeStopRequested ||= shouldStopAfterCurrentAction(applyingHeartbeat);

      const nextRefinement = await emitRefinementMutations(
        state.hydrated,
        state.intent,
        state.lastMutationAck,
        {
          imagePrimitiveClient: dependencies.imagePrimitiveClient,
          assetStorageClient: dependencies.assetStorageClient,
        },
      );

      const refinementLog = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "log",
          level: "info",
          message: `Refinement placeholder completed after ${nextRefinement.proposedMutationIds.length} additional mutations`,
        },
      });
      cooperativeStopRequested ||= refinementLog.cancelRequested;

      return {
        cooperativeStopRequested,
        lastMutationAck: nextRefinement.lastMutationAck,
      };
    })
    .addNode("prepare_finalize", async (state) => {
      if (!state.hydrated) {
        throw new Error("prepare_finalize requires hydrated state");
      }

      const heartbeatBase = buildHeartbeatBase(state.job);
      let cooperativeStopRequested = state.cooperativeStopRequested;
      const savingHeartbeat = await heartbeatTask(state.job.runId, {
        ...heartbeatBase,
        attemptState: "finalizing",
        phase: "saving",
        heartbeatAt: new Date().toISOString(),
      });
      cooperativeStopRequested ||= shouldStopAfterCurrentAction(savingHeartbeat);

      const finalizeDraft = await finalizeRun(
        state.hydrated,
        state.emittedMutationIds,
        state.lastMutationAck,
        buildFinalizeOptions(
          state,
          cooperativeStopRequested,
          state.assignedSeqs,
          state.ruleJudgeVerdict?.recommendation === "refuse"
            ? {
                finalStatus: "failed",
                errorSummary: {
                  code: "rule_judge_refused",
                  message: state.ruleJudgeVerdict.summary,
                },
              }
            : undefined,
        ),
      );

      return {
        cooperativeStopRequested,
        finalizeDraft,
      };
    })
    .addNode("send_finalize", async (state) => {
      if (!state.intent || !state.finalizeDraft) {
        throw new Error("send_finalize requires finalization draft state");
      }

      await finalizeTask(state.job.runId, state.finalizeDraft.request);
      dependencies.logger.info("Processed run job via LangGraph", {
        runId: state.job.runId,
        traceId: state.job.traceId,
        attemptSeq: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        emittedMutationIds: state.emittedMutationIds,
        finalStatus: state.finalizeDraft.summary.finalStatus,
      });

      return {
        result: {
          intent: state.intent,
          ...(state.normalizedIntentDraft
            ? { normalizedIntentDraft: state.normalizedIntentDraft }
            : {}),
          ...(state.intentNormalizationReport
            ? { intentNormalizationReport: state.intentNormalizationReport }
            : {}),
          ...(state.templatePriorSummary
            ? { templatePriorSummary: state.templatePriorSummary }
            : {}),
          ...(state.searchProfile ? { searchProfile: state.searchProfile } : {}),
          ...(state.candidateSets ? { candidateSets: state.candidateSets } : {}),
          ...(state.sourceSearchSummary
            ? { sourceSearchSummary: state.sourceSearchSummary }
            : {}),
          ...(state.retrievalStage ? { retrievalStage: state.retrievalStage } : {}),
          ...(state.selectionDecision
            ? { selectionDecision: state.selectionDecision }
            : {}),
          ...(state.typographyDecision
            ? { typographyDecision: state.typographyDecision }
            : {}),
          ...(state.ruleJudgeVerdict
            ? { ruleJudgeVerdict: state.ruleJudgeVerdict }
            : {}),
          ...(state.plan ? { plan: state.plan } : {}),
          emittedMutationIds: state.emittedMutationIds,
          finalizeDraft: state.finalizeDraft,
          artifactRefs: buildArtifactRefs(state),
        } satisfies ProcessRunJobResult,
      };
    })
    .addEdge(START, "hydrate_input")
    .addEdge("hydrate_input", "plan_intent_draft")
    .addEdge("plan_intent_draft", "normalize_intent")
    .addEdge("normalize_intent", "gate_scope")
    .addConditionalEdges("gate_scope", (state) =>
      state.finalizeDraft ? "send_finalize" : "build_template_prior_summary",
    )
    .addEdge("build_template_prior_summary", "build_search_profile")
    .addEdge("build_search_profile", "compute_retrieval_policy")
    .addEdge("compute_retrieval_policy", "assemble_candidates")
    .addConditionalEdges("assemble_candidates", (state) =>
      state.finalizeDraft ? "send_finalize" : "select_composition",
    )
    .addEdge("select_composition", "select_typography")
    .addEdge("select_typography", "persist_selection_artifacts")
    .addEdge("persist_selection_artifacts", "build_plan")
    .addEdge("build_plan", "rule_judge")
    .addConditionalEdges("rule_judge", (state) =>
      state.ruleJudgeVerdict?.recommendation === "refuse"
        ? "prepare_finalize"
        : "prepare_execution",
    )
    .addConditionalEdges("prepare_execution", (state) =>
      state.currentProposal ? "emit_stage" : "run_refinement",
    )
    .addConditionalEdges("emit_stage", (state) =>
      state.currentMutationId ? "await_stage_ack" : "run_refinement",
    )
    .addEdge("await_stage_ack", "advance_after_ack")
    .addConditionalEdges("advance_after_ack", (state) => {
      if (state.lastMutationAck?.status !== "acked" || state.cooperativeStopRequested) {
        return "run_refinement";
      }
      return state.currentProposal ? "emit_stage" : "run_refinement";
    })
    .addEdge("run_refinement", "prepare_finalize")
    .addEdge("prepare_finalize", "send_finalize")
    .addEdge("send_finalize", END);

  return graph.compile({
    checkpointer: dependencies.langGraphCheckpointer ?? new MemorySaver(),
  });
}

function buildHeartbeatBase(job: RunJobEnvelope) {
  return {
    traceId: job.traceId,
    attempt: job.attemptSeq,
    queueJobId: job.queueJobId,
    workerId: "agent-worker-langgraph",
  } as const;
}

function buildSourceSearchSummary(
  runId: string,
  traceId: string,
  sourceMode: AgentWorkerEnv["tooldiCatalogSourceMode"],
  background: SourceSearchSummary["background"],
  graphic: SourceSearchSummary["graphic"],
  photo: SourceSearchSummary["photo"],
  font: SourceSearchSummary["font"] | undefined,
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

function buildSelectionLogMessages(
  sourceSearchSummary: SourceSearchSummary,
  typographyDecision: TypographyDecision,
  selectionDecision: SelectionDecision,
): Array<{ level: "info" | "warn"; message: string }> {
  if (sourceSearchSummary.sourceMode !== "tooldi_api") {
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

function isSpringActivationFailure(
  error: unknown,
): error is TooldiCatalogSourceError | SpringCatalogActivationError {
  return (
    error instanceof TooldiCatalogSourceError ||
    error instanceof SpringCatalogActivationError
  );
}

function getSpringActivationErrorCode(
  error: TooldiCatalogSourceError | SpringCatalogActivationError,
): string {
  if (error instanceof TooldiCatalogSourceError) {
    return `catalog_source_${error.code}`;
  }
  return error.code;
}

function shouldStopAfterCurrentAction(response: {
  cancelRequested: boolean;
  stopAfterCurrentAction: boolean;
}): boolean {
  return response.cancelRequested || response.stopAfterCurrentAction;
}

function buildFinalizeOptions(
  state: RunJobGraphStateType,
  cooperativeStopRequested: boolean,
  assignedSeqs: number[],
  overrideResult?: {
    finalStatus: FinalizeRunDraft["request"]["finalStatus"];
    errorSummary?: FinalizeRunDraft["request"]["errorSummary"];
  },
) {
  return {
    cooperativeStopRequested,
    ...(state.normalizedIntentRef
      ? { normalizedIntentRef: state.normalizedIntentRef }
      : {}),
    ...(state.normalizedIntentDraftRef
      ? { normalizedIntentDraftRef: state.normalizedIntentDraftRef }
      : {}),
    ...(state.intentNormalizationReportRef
      ? { intentNormalizationReportRef: state.intentNormalizationReportRef }
      : {}),
    ...(state.templatePriorSummaryRef
      ? { templatePriorSummaryRef: state.templatePriorSummaryRef }
      : {}),
    ...(state.searchProfileRef ? { searchProfileRef: state.searchProfileRef } : {}),
    ...(state.executablePlanRef ? { executablePlanRef: state.executablePlanRef } : {}),
    ...(state.candidateSetRef ? { candidateSetRef: state.candidateSetRef } : {}),
    ...(state.sourceSearchSummaryRef
      ? { sourceSearchSummaryRef: state.sourceSearchSummaryRef }
      : {}),
    ...(state.retrievalStageRef ? { retrievalStageRef: state.retrievalStageRef } : {}),
    ...(state.selectionDecisionRef
      ? { selectionDecisionRef: state.selectionDecisionRef }
      : {}),
    ...(state.typographyDecisionRef
      ? { typographyDecisionRef: state.typographyDecisionRef }
      : {}),
    ...(state.ruleJudgeVerdictRef
      ? { ruleJudgeVerdictRef: state.ruleJudgeVerdictRef }
      : {}),
    ...(state.ruleJudgeVerdict?.recommendation === "refine"
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
}

function buildArtifactRefs(
  state: RunJobGraphStateType,
): ProcessRunJobResult["artifactRefs"] {
  if (!state.normalizedIntentRef) {
    throw new Error("LangGraph run completed without normalized intent artifact");
  }

  return {
    normalizedIntentRef: state.normalizedIntentRef,
    ...(state.normalizedIntentDraftRef
      ? { normalizedIntentDraftRef: state.normalizedIntentDraftRef }
      : {}),
    ...(state.intentNormalizationReportRef
      ? { intentNormalizationReportRef: state.intentNormalizationReportRef }
      : {}),
    ...(state.templatePriorSummaryRef
      ? { templatePriorSummaryRef: state.templatePriorSummaryRef }
      : {}),
    ...(state.searchProfileRef ? { searchProfileRef: state.searchProfileRef } : {}),
    ...(state.executablePlanRef ? { executablePlanRef: state.executablePlanRef } : {}),
    ...(state.candidateSetRef ? { candidateSetRef: state.candidateSetRef } : {}),
    ...(state.sourceSearchSummaryRef
      ? { sourceSearchSummaryRef: state.sourceSearchSummaryRef }
      : {}),
    ...(state.retrievalStageRef ? { retrievalStageRef: state.retrievalStageRef } : {}),
    ...(state.selectionDecisionRef
      ? { selectionDecisionRef: state.selectionDecisionRef }
      : {}),
    ...(state.typographyDecisionRef
      ? { typographyDecisionRef: state.typographyDecisionRef }
      : {}),
    ...(state.ruleJudgeVerdictRef
      ? { ruleJudgeVerdictRef: state.ruleJudgeVerdictRef }
      : {}),
  };
}

async function persistWorkerJsonArtifact(
  objectStore: ObjectStoreClient,
  key: string,
  payload: unknown,
  metadata: Record<string, string>,
): Promise<string> {
  await objectStore.putObject({
    key,
    body: JSON.stringify(payload),
    contentType: "application/json",
    metadata,
  });
  return key;
}

async function readWorkerJsonArtifact<T>(
  objectStore: ObjectStoreClient,
  bucket: string,
  key: string,
  parser?: (value: unknown) => T,
): Promise<T> {
  const stored = await objectStore.getObject({
    bucket,
    key,
  });
  const json = new TextDecoder().decode(stored.body);
  const parsed = JSON.parse(json) as unknown;
  return parser ? parser(parsed) : (parsed as T);
}
