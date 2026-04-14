import type { StateGraph } from "@langchain/langgraph";
import type { TooldiCatalogSourceClient } from "@tooldi/tool-adapters";
import {
  createTemplateAbstractLayoutGenerator,
  createTemplateCopyPlanGenerator,
} from "@tooldi/agent-llm";

import {
  assembleTemplateCandidates,
} from "../phases/assembleTemplateCandidates.js";
import { buildAssetPlan } from "../phases/buildAssetPlan.js";
import { buildConcreteLayoutPlan } from "../phases/buildConcreteLayoutPlan.js";
import { buildCopyAndAbstractLayoutPlan } from "../phases/buildCopyAndAbstractLayoutPlan.js";
import { buildReferenceCompositionV2 } from "../phases/buildReferenceCompositionV2.js";
import { buildSearchProfile } from "../phases/buildSearchProfile.js";
import { buildScenePlans } from "../phases/buildScenePlans.js";
import { buildSceneStylePlans } from "../phases/buildSceneStylePlans.js";
import {
  buildTemplatePriorBundle,
  createGeminiTemplatePriorReranker,
} from "../phases/buildTemplatePriorBundle.js";
import { buildTemplatePriorSummary } from "../phases/buildTemplatePriorSummary.js";
import { buildExecutablePlan } from "../phases/buildExecutablePlan.js";
import { buildCompositionSelection } from "../phases/compositionEngine.js";
import { runRetrievalStage } from "../phases/runRetrievalStage.js";
import { ruleJudgeCreateTemplate } from "../phases/ruleJudge.js";
import { selectTypography } from "../phases/selectTypography.js";
import { deriveWorkflowVariant } from "../phases/planningContext.js";
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
  const templateCopyPlanGenerator =
    dependencies.templateCopyPlanGenerator ??
    createTemplateCopyPlanGenerator(dependencies.env, dependencies.logger);
  const templateAbstractLayoutGenerator =
    dependencies.templateAbstractLayoutGenerator ??
    createTemplateAbstractLayoutGenerator(dependencies.env, dependencies.logger);
  const templatePriorReranker = createGeminiTemplatePriorReranker(
    dependencies.env,
    dependencies.logger,
  );

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
        {
          templateCopyPlanGenerator,
          templateAbstractLayoutGenerator,
          templatePriorBundle: state.templatePriorBundle,
          sceneRolePlan: state.sceneRolePlan,
          sceneLayoutPlan: state.sceneLayoutPlan,
          sceneStylePlan: state.sceneStylePlan,
          sceneBindingPlan: state.sceneBindingPlan,
        },
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
    .addNode("build_reference_composition_v2", async (state) => {
      if (!state.hydrated) {
        throw new Error("build_reference_composition_v2 requires hydrated state");
      }

      const v2Plans = buildReferenceCompositionV2(
        state.hydrated,
        state.templatePriorBundle,
        state.copyPlan,
        state.sceneStylePlan,
        state.sceneBindingPlan,
      );

      const referenceCompositionGraphRef = v2Plans.referenceCompositionGraph
        ? await persistArtifactTask(
            `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/reference-composition-graph.json`,
            v2Plans.referenceCompositionGraph,
            {
              artifactKind: "reference-composition-graph",
              runId: state.job.runId,
              traceId: state.job.traceId,
              attemptSeq: String(state.job.attemptSeq),
            },
          )
        : null;
      const referenceSupportEvidenceRef = v2Plans.referenceSupportEvidence
        ? await persistArtifactTask(
            `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/reference-support-evidence.json`,
            v2Plans.referenceSupportEvidence,
            {
              artifactKind: "reference-support-evidence",
              runId: state.job.runId,
              traceId: state.job.traceId,
              attemptSeq: String(state.job.attemptSeq),
            },
          )
        : null;
      const copyAtomPlanRef = v2Plans.copyAtomPlan
        ? await persistArtifactTask(
            `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/copy-atom-plan.json`,
            v2Plans.copyAtomPlan,
            {
              artifactKind: "copy-atom-plan",
              runId: state.job.runId,
              traceId: state.job.traceId,
              attemptSeq: String(state.job.attemptSeq),
            },
          )
        : null;
      const copyBindingPlanRef = v2Plans.copyBindingPlan
        ? await persistArtifactTask(
            `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/copy-binding-plan.json`,
            v2Plans.copyBindingPlan,
            {
              artifactKind: "copy-binding-plan",
              runId: state.job.runId,
              traceId: state.job.traceId,
              attemptSeq: String(state.job.attemptSeq),
            },
          )
        : null;
      const templateRemixPlanRef = v2Plans.templateRemixPlan
        ? await persistArtifactTask(
            `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/template-remix-plan.json`,
            v2Plans.templateRemixPlan,
            {
              artifactKind: "template-remix-plan",
              runId: state.job.runId,
              traceId: state.job.traceId,
              attemptSeq: String(state.job.attemptSeq),
            },
          )
        : null;
      const freeformLayoutPlanRef = v2Plans.freeformLayoutPlan
        ? await persistArtifactTask(
            `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/freeform-layout-plan.json`,
            v2Plans.freeformLayoutPlan,
            {
              artifactKind: "freeform-layout-plan",
              runId: state.job.runId,
              traceId: state.job.traceId,
              attemptSeq: String(state.job.attemptSeq),
            },
          )
        : null;
      const styleDowngradeVerdictRef = v2Plans.styleDowngradeVerdict
        ? await persistArtifactTask(
            `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/style-downgrade-verdict.json`,
            v2Plans.styleDowngradeVerdict,
            {
              artifactKind: "style-downgrade-verdict",
              runId: state.job.runId,
              traceId: state.job.traceId,
              attemptSeq: String(state.job.attemptSeq),
            },
          )
        : null;

      return {
        referenceCompositionGraph: v2Plans.referenceCompositionGraph,
        referenceCompositionGraphRef,
        referenceSupportEvidence: v2Plans.referenceSupportEvidence,
        referenceSupportEvidenceRef,
        copyAtomPlan: v2Plans.copyAtomPlan,
        copyAtomPlanRef,
        copyBindingPlan: v2Plans.copyBindingPlan,
        copyBindingPlanRef,
        templateRemixPlan: v2Plans.templateRemixPlan,
        templateRemixPlanRef,
        freeformLayoutPlan: v2Plans.freeformLayoutPlan,
        freeformLayoutPlanRef,
        styleDowngradeVerdict: v2Plans.styleDowngradeVerdict,
        styleDowngradeVerdictRef,
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
    .addNode("build_template_prior_bundle", async (state) => {
      if (!state.hydrated || !state.intent) {
        throw new Error(
          "build_template_prior_bundle requires hydrated normalized intent state",
        );
      }

      const workflowVariant = deriveWorkflowVariant(state.hydrated);
      if (
        workflowVariant !== "retrieval_prior_v1" &&
        workflowVariant !== "retrieval_prior_v2"
      ) {
        return {
          templatePriorBundle: null,
          templatePriorBundleRef: null,
        };
      }

      let cooperativeStopRequested = state.cooperativeStopRequested;
      const templatePriorBundle = await buildTemplatePriorBundle(
        state.hydrated,
        state.intent,
        tooldiCatalogSourceClient,
        templatePriorReranker,
      );

      if (!templatePriorBundle) {
        return {
          templatePriorBundle: null,
          templatePriorBundleRef: null,
          cooperativeStopRequested,
        };
      }

      const templatePriorBundleRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/template-prior-bundle.json`,
        templatePriorBundle,
        {
          artifactKind: "template-prior-bundle",
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
          level: templatePriorBundle.usedFallbackToLegacy ? "warn" : "info",
          message:
            `[source/template-prior] retrieved=${templatePriorBundle.candidates.length} ` +
            `selected=${templatePriorBundle.selectedTemplateCode ?? "n/a"} ` +
            `layoutHint=${templatePriorBundle.selectedScaffold?.layoutModeHint ?? "n/a"} ` +
            `fallback=${templatePriorBundle.usedFallbackToLegacy ? "legacy" : "none"}`,
        },
      });
      cooperativeStopRequested ||= priorLog.cancelRequested;

      return {
        templatePriorBundle,
        templatePriorBundleRef,
        cooperativeStopRequested,
      };
    })
    .addNode("build_scene_plans", async (state) => {
      if (!state.intent) {
        throw new Error("build_scene_plans requires normalized intent state");
      }

      const { sceneRolePlan, sceneLayoutPlan } = buildScenePlans(
        state.intent,
        state.templatePriorBundle,
      );
      const { sceneStylePlan, sceneBindingPlan } = buildSceneStylePlans(
        state.intent,
        state.templatePriorBundle,
        sceneLayoutPlan,
      );

      const sceneRolePlanRef = sceneRolePlan
        ? await persistArtifactTask(
            `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/scene-role-plan.json`,
            sceneRolePlan,
            {
              artifactKind: "scene-role-plan",
              runId: state.job.runId,
              traceId: state.job.traceId,
              attemptSeq: String(state.job.attemptSeq),
            },
          )
        : null;
      const sceneLayoutPlanRef = sceneLayoutPlan
        ? await persistArtifactTask(
            `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/scene-layout-plan.json`,
            sceneLayoutPlan,
            {
              artifactKind: "scene-layout-plan",
              runId: state.job.runId,
              traceId: state.job.traceId,
              attemptSeq: String(state.job.attemptSeq),
            },
          )
        : null;
      const sceneStylePlanRef = sceneStylePlan
        ? await persistArtifactTask(
            `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/scene-style-plan.json`,
            sceneStylePlan,
            {
              artifactKind: "scene-style-plan",
              runId: state.job.runId,
              traceId: state.job.traceId,
              attemptSeq: String(state.job.attemptSeq),
            },
          )
        : null;
      const sceneBindingPlanRef = sceneBindingPlan
        ? await persistArtifactTask(
            `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/scene-binding-plan.json`,
            sceneBindingPlan,
            {
              artifactKind: "scene-binding-plan",
              runId: state.job.runId,
              traceId: state.job.traceId,
              attemptSeq: String(state.job.attemptSeq),
            },
          )
        : null;

      return {
        sceneRolePlan,
        sceneRolePlanRef,
        sceneLayoutPlan,
        sceneLayoutPlanRef,
        sceneStylePlan,
        sceneStylePlanRef,
        sceneBindingPlan,
        sceneBindingPlanRef,
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
            sceneLayoutPlan: state.sceneLayoutPlan,
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
        if (
          !isSpringActivationFailure(error) ||
          !state.hydrated ||
          !state.canonicalDesignBriefRef
        ) {
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

      const compositionSelection = await buildCompositionSelection(
        state.intent,
        state.candidateSets,
        {
          retrievalStage: state.retrievalStage,
          selectionPolicy: state.selectionPolicy,
          templatePriorBundle: state.templatePriorBundle,
          sceneBindingPlan: state.sceneBindingPlan,
        },
      );
      const compositionBriefRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/composition-brief.json`,
        compositionSelection.compositionBrief,
        {
          artifactKind: "composition-brief",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );
      const compositionVariantSetRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/composition-variants.json`,
        compositionSelection.compositionVariantSet,
        {
          artifactKind: "composition-variants",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );
      const compositionRankingRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/composition-ranking.json`,
        compositionSelection.compositionRanking,
        {
          artifactKind: "composition-ranking",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );
      const selectionDecision = compositionSelection.selectionDecision;
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
        compositionBrief: compositionSelection.compositionBrief,
        compositionBriefRef,
        compositionVariantSet: compositionSelection.compositionVariantSet,
        compositionVariantSetRef,
        compositionRanking: compositionSelection.compositionRanking,
        compositionRankingRef,
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
        state.sceneBindingPlan,
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
        state.sceneBindingPlan,
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
        sceneStylePlan: state.sceneStylePlan,
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
        state.typographyDecision,
        state.selectionDecision,
        dependencies.env.tooldiCatalogSourceMode !== "placeholder" &&
          state.intent!.domain === "general_marketing" &&
          state.intent!.facets.menuType === null,
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
        state.freeformLayoutPlan,
        state.sceneBindingPlan,
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
