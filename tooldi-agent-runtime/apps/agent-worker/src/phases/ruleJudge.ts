import { createRequestId } from "@tooldi/agent-domain";
import type { ExecutablePlan, TemplatePriorSummary } from "@tooldi/agent-contracts";

import type {
  AbstractLayoutPlan,
  ConcreteLayoutPlan,
  CopyPlan,
  NormalizedIntent,
  RuleJudgeVerdict,
  SearchProfileArtifact,
  SelectionDecision,
  SourceSearchSummary,
  TypographyDecision,
} from "../types.js";
import {
  collectRuleJudgeIssues,
  summarizeRuleJudgeRecommendation,
} from "./ruleJudgeIssueCollector.js";
import {
  surfaceRuleJudgeIssue,
} from "./ruleJudgeIssueDefinitions.js";

export { RULE_JUDGE_ISSUE_DEFINITIONS, surfaceRuleJudgeIssue } from "./ruleJudgeIssueDefinitions.js";

export async function ruleJudgeCreateTemplate(
  intent: NormalizedIntent,
  searchProfile: SearchProfileArtifact,
  selectionDecision: SelectionDecision,
  typographyDecision: TypographyDecision,
  sourceSearchSummary: SourceSearchSummary,
  plan: ExecutablePlan,
  templatePriorSummary: TemplatePriorSummary | null = null,
  copyPlan: CopyPlan | null = null,
  abstractLayoutPlan: AbstractLayoutPlan | null = null,
  concreteLayoutPlan: ConcreteLayoutPlan | null = null,
): Promise<RuleJudgeVerdict> {
  const issues = collectRuleJudgeIssues(
    intent,
    searchProfile,
    selectionDecision,
    typographyDecision,
    sourceSearchSummary,
    plan,
    templatePriorSummary,
    copyPlan,
    abstractLayoutPlan,
    concreteLayoutPlan,
  );
  const { recommendation, confidence, errorCount, warnCount } =
    summarizeRuleJudgeRecommendation(issues);

  return {
    verdictId: createRequestId(),
    runId: intent.runId,
    traceId: intent.traceId,
    recommendation,
    confidence,
    issues,
    summary:
      recommendation === "keep"
        ? "Rule judge found no blocking issues for the current create-template plan"
        : recommendation === "refine"
          ? `Rule judge found ${warnCount} refinement issue(s) before execution`
          : `Rule judge refused execution due to ${errorCount} blocking issue(s)`,
  };
}
