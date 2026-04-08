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
  WaitMutationAckResponse,
} from "@tooldi/agent-contracts";
import type { AgentWorkerEnv } from "@tooldi/agent-config";
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
import { buildExecutablePlan } from "../phases/buildExecutablePlan.js";
import { buildNormalizedIntent } from "../phases/buildNormalizedIntent.js";
import { emitRefinementMutations } from "../phases/emitRefinementMutations.js";
import { emitSkeletonMutations } from "../phases/emitSkeletonMutations.js";
import { finalizeRun } from "../phases/finalizeRun.js";
import { hydratePlanningInput } from "../phases/hydratePlanningInput.js";
import { runRetrievalStage } from "../phases/runRetrievalStage.js";
import { selectTypography } from "../phases/selectTypography.js";
import { selectTemplateComposition } from "../phases/selectTemplateComposition.js";
import type {
  FinalizeRunDraft,
  HydratedPlanningInput,
  NormalizedIntent,
  ProcessRunJobResult,
  RetrievalStageResult,
  SelectionDecision,
  SourceSearchSummary,
  TemplateCandidateBundle,
  TypographyDecision,
} from "../types.js";

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
  intent: replaceValue<NormalizedIntent | null>(() => null),
  candidateSets: replaceValue<TemplateCandidateBundle | null>(() => null),
  sourceSearchSummary: replaceValue<SourceSearchSummary | null>(() => null),
  retrievalStage: replaceValue<RetrievalStageResult | null>(() => null),
  selectionDecision: replaceValue<SelectionDecision | null>(() => null),
  typographyDecision: replaceValue<TypographyDecision | null>(() => null),
  plan: replaceValue<ProcessRunJobResult["plan"] | null>(() => null),
  emittedMutationIds: replaceValue<string[]>(() => []),
  assignedSeqs: replaceValue<number[]>(() => []),
  lastMutationAck: replaceValue<WaitMutationAckResponse | null>(() => null),
  finalizeDraft: replaceValue<FinalizeRunDraft | null>(() => null),
  normalizedIntentRef: replaceValue<string | null>(() => null),
  executablePlanRef: replaceValue<string | null>(() => null),
  candidateSetRef: replaceValue<string | null>(() => null),
  sourceSearchSummaryRef: replaceValue<string | null>(() => null),
  retrievalStageRef: replaceValue<string | null>(() => null),
  selectionDecisionRef: replaceValue<string | null>(() => null),
  typographyDecisionRef: replaceValue<string | null>(() => null),
  result: replaceValue<ProcessRunJobResult | null>(() => null),
});

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
    .addNode("hydrate", async (state) => {
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
    .addNode("planning", async (state) => {
      if (!state.hydrated) {
        throw new Error("Run graph planning started without hydrated input");
      }

      const heartbeatBase = buildHeartbeatBase(state.job);
      let cooperativeStopRequested = state.cooperativeStopRequested;
      const intent = await buildNormalizedIntent(state.hydrated);

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

      if (intent.operationFamily !== "create_template" || !intent.supportedInV1) {
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

        return {
          intent,
          normalizedIntentRef,
          cooperativeStopRequested,
          finalizeDraft: await finalizeRun(state.hydrated, [], null, {
            cooperativeStopRequested,
            normalizedIntentRef,
            overrideResult: {
              finalStatus: "failed",
              errorSummary: {
                code: "unsupported_v1_vertical_slice",
                message:
                  "Spring vertical slice only supports empty-canvas create_template runs",
              },
            },
          }),
        };
      }

      try {
        const retrievalDecision = await runRetrievalStage(state.hydrated, intent, {
          toolRegistry: dependencies.toolRegistry,
        });
        const retrievalStage = retrievalDecision.retrievalStage;
        const selectionPolicy = retrievalDecision.selectionPolicy;
        const retrievalStageRef = await persistArtifactTask(
          `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/retrieval-stage.json`,
          retrievalStage,
          {
            artifactKind: "retrieval-stage",
            runId: state.job.runId,
            traceId: state.job.traceId,
            attemptSeq: String(state.job.attemptSeq),
          },
        );

        const candidateAssembly = await assembleTemplateCandidates(
          state.hydrated,
          intent,
          {
            templateCatalogClient: dependencies.templateCatalogClient,
            tooldiCatalogSourceClient,
            sourceMode: dependencies.env.tooldiCatalogSourceMode,
            allowPhotoCandidates: selectionPolicy.allowPhotoCandidates,
          },
        );
        const candidateSets = candidateAssembly.candidates;
        const candidateSetRef = await persistArtifactTask(
          `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/template-candidate-set.json`,
          candidateSets,
          {
            artifactKind: "template-candidate-set",
            runId: state.job.runId,
            traceId: state.job.traceId,
            attemptSeq: String(state.job.attemptSeq),
          },
        );

        const selectionDecision = await selectTemplateComposition(intent, candidateSets, {
          retrievalStage,
          selectionPolicy,
        });
        const typographySelection = await selectTypography(state.hydrated, {
          sourceClient: tooldiCatalogSourceClient,
          sourceMode: dependencies.env.tooldiCatalogSourceMode,
        });
        const typographyDecision = typographySelection.decision;
        const typographySearchSummary = typographySelection.summary;
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
        const typographyDecisionRef = await persistArtifactTask(
          `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/typography-decision.json`,
          typographyDecision,
          {
            artifactKind: "typography-decision",
            runId: state.job.runId,
            traceId: state.job.traceId,
            attemptSeq: String(state.job.attemptSeq),
          },
        );

        const sourceSearchSummary = buildSourceSearchSummary(
          state.job.runId,
          state.job.traceId,
          dependencies.env.tooldiCatalogSourceMode,
          candidateAssembly.sourceSearch.background,
          candidateAssembly.sourceSearch.graphic,
          candidateAssembly.sourceSearch.photo,
          typographySearchSummary,
          selectionDecision,
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
          typographyDecision,
          selectionDecision,
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
              `[source/selection] background=${selectionDecision.selectedBackgroundSerial ?? "n/a"} ` +
              `(${selectionDecision.selectedBackgroundCategory ?? "n/a"}) ` +
              `layout=${selectionDecision.layoutMode} ` +
              `decoration=${selectionDecision.selectedDecorationSerial ?? "n/a"} ` +
              `(${selectionDecision.selectedDecorationCategory ?? "n/a"}) ` +
              `photoBranch=${selectionDecision.photoBranchMode} ` +
              `photo=${selectionDecision.topPhotoSerial ?? "n/a"} ` +
              `(${selectionDecision.topPhotoCategory ?? "n/a"})`,
          },
        });
        cooperativeStopRequested ||= selectionEvent.cancelRequested;

        const plan = await buildExecutablePlan(
          state.hydrated,
          intent,
          selectionDecision,
          typographyDecision,
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
          intent,
          candidateSets,
          retrievalStage,
          selectionDecision,
          typographyDecision,
          sourceSearchSummary,
          plan,
          cooperativeStopRequested,
          normalizedIntentRef,
          executablePlanRef,
          candidateSetRef,
          sourceSearchSummaryRef,
          retrievalStageRef,
          selectionDecisionRef,
          typographyDecisionRef,
        };
      } catch (error) {
        if (!isSpringActivationFailure(error)) {
          throw error;
        }

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

        return {
          intent,
          normalizedIntentRef,
          cooperativeStopRequested,
          finalizeDraft: await finalizeRun(state.hydrated, [], null, {
            cooperativeStopRequested,
            normalizedIntentRef,
            overrideResult: {
              finalStatus: "failed",
              errorSummary: {
                code: getSpringActivationErrorCode(error),
                message: error.message,
              },
            },
          }),
        };
      }
    })
    .addNode("execute", async (state) => {
      if (!state.hydrated || !state.intent || !state.plan) {
        throw new Error("Run graph execution started without a resolved plan");
      }

      const hydrated = state.hydrated;
      const intent = state.intent;
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
        : await emitSkeletonMutations(hydrated, intent, state.plan, {
            textLayoutHelper: dependencies.textLayoutHelper,
          });

      const emittedMutationIds: string[] = [];
      const assignedSeqs: number[] = [];
      let lastMutationAck: WaitMutationAckResponse | null = cooperativeStopRequested
        ? {
            found: true,
            status: "cancelled",
          }
        : null;

      for (const proposal of skeletonBatch.proposals) {
        const totalStages = skeletonBatch.proposals.length;
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
          cooperativeStopRequested = true;
          lastMutationAck = {
            found: true,
            status: "cancelled",
          };
          break;
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
            cooperativeStopRequested = true;
            lastMutationAck = {
              found: true,
              status: "cancelled",
            };
            break;
          }
        }

        emittedMutationIds.push(proposal.mutationId);
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
          cooperativeStopRequested = true;
          lastMutationAck = {
            found: true,
            status: "cancelled",
          };
          break;
        }

        assignedSeqs.push(mutationResponse.assignedSeq ?? proposal.mutation.seq);

        lastMutationAck = await waitMutationAckTask(
          state.job.runId,
          proposal.mutationId,
          { waitMs: 15000 },
        );
        if (lastMutationAck.status === "cancelled") {
          cooperativeStopRequested = true;
          break;
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
          };
          break;
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
          if (failFastLog.cancelRequested) {
            cooperativeStopRequested = true;
            lastMutationAck = {
              found: true,
              status: "cancelled",
            };
          }
          break;
        }
      }

      const shouldAttemptRefinement =
        !cooperativeStopRequested &&
        (lastMutationAck === null || lastMutationAck.status === "acked");
      const refinement = shouldAttemptRefinement
        ? await (async () => {
            const applyingHeartbeat = await heartbeatTask(state.job.runId, {
              ...heartbeatBase,
              attemptState: "awaiting_ack",
              phase: "applying",
              heartbeatAt: new Date().toISOString(),
            });
            cooperativeStopRequested ||= shouldStopAfterCurrentAction(applyingHeartbeat);

            const nextRefinement = await emitRefinementMutations(
              hydrated,
              intent,
              lastMutationAck,
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
            return nextRefinement;
          })()
        : {
            proposedMutationIds: [],
            lastMutationAck,
          };

      const savingHeartbeat = await heartbeatTask(state.job.runId, {
        ...heartbeatBase,
        attemptState: "finalizing",
        phase: "saving",
        heartbeatAt: new Date().toISOString(),
      });
      cooperativeStopRequested ||= shouldStopAfterCurrentAction(savingHeartbeat);

      const finalizeDraft = await finalizeRun(
        hydrated,
        emittedMutationIds,
        refinement.lastMutationAck,
        buildFinalizeOptions(state, cooperativeStopRequested, assignedSeqs),
      );

      return {
        cooperativeStopRequested,
        emittedMutationIds,
        assignedSeqs,
        lastMutationAck: refinement.lastMutationAck,
        finalizeDraft,
      };
    })
    .addNode("finalize", async (state) => {
      if (!state.intent || !state.finalizeDraft) {
        throw new Error("Run graph finalize started without finalization draft");
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
          ...(state.plan ? { plan: state.plan } : {}),
          emittedMutationIds: state.emittedMutationIds,
          finalizeDraft: state.finalizeDraft,
          artifactRefs: buildArtifactRefs(state),
        } satisfies ProcessRunJobResult,
      };
    })
    .addEdge(START, "hydrate")
    .addEdge("hydrate", "planning")
    .addConditionalEdges("planning", (state) =>
      state.finalizeDraft ? "finalize" : "execute",
    )
    .addEdge("execute", "finalize")
    .addEdge("finalize", END);

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
  state: typeof RunJobGraphState.State,
  cooperativeStopRequested: boolean,
  assignedSeqs: number[],
) {
  return {
    cooperativeStopRequested,
    ...(state.normalizedIntentRef
      ? { normalizedIntentRef: state.normalizedIntentRef }
      : {}),
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
    assignedSeqs,
  };
}

function buildArtifactRefs(
  state: typeof RunJobGraphState.State,
): ProcessRunJobResult["artifactRefs"] {
  if (!state.normalizedIntentRef) {
    throw new Error("LangGraph run completed without normalized intent artifact");
  }

  return {
    normalizedIntentRef: state.normalizedIntentRef,
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
