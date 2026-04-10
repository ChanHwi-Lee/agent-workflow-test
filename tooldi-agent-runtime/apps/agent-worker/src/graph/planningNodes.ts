import type { StateGraph } from "@langchain/langgraph";
import { parseTemplateIntentDraft } from "@tooldi/agent-llm";
import type { TemplateIntentDraft } from "@tooldi/agent-llm";

import { buildPlannerDraft } from "../phases/buildPlannerDraft.js";
import { buildNormalizedIntent } from "../phases/buildNormalizedIntent.js";
import { finalizeRun } from "../phases/finalizeRun.js";
import { hydratePlanningInput } from "../phases/hydratePlanningInput.js";
import { buildHeartbeatBase } from "./graphHelpers.js";
import { readWorkerJsonArtifact } from "./graphTasks.js";
import { shouldStopAfterCurrentAction } from "./nodeUtils.js";
import { RunJobGraphState } from "./runJobGraphState.js";
import type { RunJobGraphDependencies } from "./runJobGraphTypes.js";
import type { createRunJobGraphTasks } from "./graphTasks.js";

export function registerPlanningNodes(
  graph: StateGraph<typeof RunJobGraphState>,
  dependencies: RunJobGraphDependencies,
  tasks: ReturnType<typeof createRunJobGraphTasks>,
) {
  const {
    heartbeatTask,
    appendEventTask,
    persistArtifactTask,
  } = tasks;

  return graph
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
      const canonicalIntent = await readWorkerJsonArtifact(
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
    });
}
