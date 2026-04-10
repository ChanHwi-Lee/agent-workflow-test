import type { StateGraph } from "@langchain/langgraph";
import type { TooldiCatalogSourceClient } from "@tooldi/tool-adapters";

import {
  assembleTemplateCandidates,
} from "../phases/assembleTemplateCandidates.js";
import { buildAssetPlan } from "../phases/buildAssetPlan.js";
import { buildConcreteLayoutPlan } from "../phases/buildConcreteLayoutPlan.js";
import { buildCopyAndAbstractLayoutPlan } from "../phases/buildCopyAndAbstractLayoutPlan.js";
import { buildSearchProfile } from "../phases/buildSearchProfile.js";
import { buildTemplatePriorSummary } from "../phases/buildTemplatePriorSummary.js";
import { buildExecutablePlan } from "../phases/buildExecutablePlan.js";
import { runRetrievalStage } from "../phases/runRetrievalStage.js";
import { ruleJudgeCreateTemplate } from "../phases/ruleJudge.js";
import { selectTypography } from "../phases/selectTypography.js";
import { selectTemplateComposition } from "../phases/selectTemplateComposition.js";
import {
  buildSelectionLogMessages,
  buildSourceSearchSummary,
} from "./graphHelpers.js";
import { isSpringActivationFailure } from "./nodeUtils.js";
import { RunJobGraphState } from "./runJobGraphState.js";
import type { RunJobGraphDependencies } from "./runJobGraphTypes.js";
import type { createRunJobGraphTasks } from "./graphTasks.js";
import { buildSpringActivationFailureFinalizeDraft } from "./buildFailureDrafts.js";

export function registerBuildNodes(
  graph: StateGraph<typeof RunJobGraphState>,
  dependencies: RunJobGraphDependencies,
  tasks: ReturnType<typeof createRunJobGraphTasks>,
  tooldiCatalogSourceClient: TooldiCatalogSourceClient,
) {
  const {
    heartbeatTask,
    appendEventTask,
    persistArtifactTask,
  } = tasks;

  return graph
    .addNode("build_copy_and_abstract_layout_plan", async (state) => {
      if (!state.hydrated || !state.intent) {
        throw new Error(
          "build_copy_and_abstract_layout_plan requires hydrated normalized intent state",
        );
      }

      const planArtifacts = await buildCopyAndAbstractLayoutPlan(
        state.hydrated,
        state.intent,
        state.normalizedIntentDraft?.draft ?? null,
      );

      const copyPlanRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/copy-plan.json`,
        planArtifacts.copyPlan,
        {
          artifactKind: "copy-plan",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );
      const copyPlanNormalizationReportRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/copy-plan-normalization-report.json`,
        planArtifacts.copyPlanNormalizationReport,
        {
          artifactKind: "copy-plan-normalization-report",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );
      const abstractLayoutPlanRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/layout-plan-abstract.json`,
        planArtifacts.abstractLayoutPlan,
        {
          artifactKind: "layout-plan-abstract",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );
      const abstractLayoutPlanNormalizationReportRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/layout-plan-normalization-report.json`,
        planArtifacts.abstractLayoutPlanNormalizationReport,
        {
          artifactKind: "layout-plan-normalization-report",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );

      return {
        copyPlan: planArtifacts.copyPlan,
        copyPlanRef,
        copyPlanNormalizationReport: planArtifacts.copyPlanNormalizationReport,
        copyPlanNormalizationReportRef,
        abstractLayoutPlan: planArtifacts.abstractLayoutPlan,
        abstractLayoutPlanRef,
        abstractLayoutPlanNormalizationReport:
          planArtifacts.abstractLayoutPlanNormalizationReport,
        abstractLayoutPlanNormalizationReportRef,
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
        return buildSpringActivationFailureFinalizeDraft(state, error, {
          appendEventTask,
          heartbeatTask,
        });
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
    .addNode("build_asset_plan", async (state) => {
      if (
        !state.intent ||
        !state.templatePriorSummary ||
        !state.searchProfile ||
        !state.selectionDecision
      ) {
        throw new Error(
          "build_asset_plan requires intent/prior/search/selection state",
        );
      }

      const assetPlan = await buildAssetPlan(
        state.intent,
        state.templatePriorSummary,
        state.searchProfile,
        state.selectionDecision,
      );
      const assetPlanRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/asset-plan.json`,
        assetPlan,
        {
          artifactKind: "asset-plan",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );

      return {
        assetPlan,
        assetPlanRef,
      };
    })
    .addNode("build_concrete_layout_plan", async (state) => {
      if (
        !state.hydrated ||
        !state.copyPlan ||
        !state.abstractLayoutPlan ||
        !state.assetPlan ||
        !state.selectionDecision
      ) {
        throw new Error(
          "build_concrete_layout_plan requires copy/abstract-layout/asset/selection state",
        );
      }

      const concreteLayoutPlan = await buildConcreteLayoutPlan(
        state.hydrated,
        state.copyPlan,
        state.abstractLayoutPlan,
        state.assetPlan,
        state.selectionDecision,
        {
          textLayoutHelper: dependencies.textLayoutHelper,
        },
      );
      const concreteLayoutPlanRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/layout-plan-concrete.json`,
        concreteLayoutPlan,
        {
          artifactKind: "layout-plan-concrete",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );

      return {
        concreteLayoutPlan,
        concreteLayoutPlanRef,
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
      if (
        !state.hydrated ||
        !state.intent ||
        !state.assetPlan ||
        !state.selectionDecision ||
        !state.typographyDecision ||
        !state.copyPlan ||
        !state.concreteLayoutPlan
      ) {
        throw new Error("build_plan requires intent/selection/typography state");
      }

      const plan = await buildExecutablePlan(
        state.hydrated,
        state.intent,
        state.copyPlan,
        state.assetPlan,
        state.selectionDecision,
        state.concreteLayoutPlan,
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
        !state.copyPlan ||
        !state.abstractLayoutPlan ||
        !state.concreteLayoutPlan ||
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
        state.copyPlan,
        state.abstractLayoutPlan,
        state.concreteLayoutPlan,
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
    });
}
