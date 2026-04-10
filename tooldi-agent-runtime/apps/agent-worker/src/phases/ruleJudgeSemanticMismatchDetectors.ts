import type { TemplatePriorSummary } from "@tooldi/agent-contracts";

import type {
  NormalizedIntent,
  RuleJudgeIssue,
  SearchProfileArtifact,
  SelectionDecision,
  SourceSearchSummary,
} from "../types.js";
import {
  deriveEvidenceRefs,
  describeSignal,
  DOMAIN_CONTEXT_REFS,
  inferDomainFromTexts,
  PRIOR_CONTEXT_REFS,
} from "./ruleJudgeDomainAnalysis.js";
import { surfaceRuleJudgeIssue } from "./ruleJudgeIssueDefinitions.js";
import {
  collectPrimaryVisualTexts,
  collectPriorSubjectTexts,
  collectPriorThemeTexts,
  collectSelectedSubjectTexts,
  collectSelectedThemeTexts,
  describeDominantPrior,
  describeSelectionLane,
  deriveSelectedFamily,
  mapSelectedFamilyToPriorFamily,
} from "./ruleJudgeSelectionContext.js";

export function detectDomainSubjectMismatch(
  intent: NormalizedIntent,
  searchProfile: SearchProfileArtifact,
  selectionDecision: SelectionDecision,
  sourceSearchSummary: SourceSearchSummary,
  templatePriorSummary: TemplatePriorSummary | null,
): RuleJudgeIssue | null {
  if (intent.domain === "general_marketing") {
    return null;
  }

  const selectedFamily = deriveSelectedFamily(selectionDecision);
  const subjectTexts = [
    ...collectSelectedSubjectTexts(searchProfile, selectionDecision, sourceSearchSummary),
    ...collectPriorSubjectTexts(templatePriorSummary),
  ];
  const inference = inferDomainFromTexts(subjectTexts);
  if (
    inference.domain === null ||
    inference.domain === intent.domain ||
    inference.score < 2
  ) {
    return null;
  }

  const evidenceRefs = [
    "normalized-intent.json",
    ...deriveEvidenceRefs(inference.matches),
  ];
  const selectedSignal = describeSignal(inference.matches[0]);

  return surfaceRuleJudgeIssue("domain_subject_mismatch", {
    message:
      `Selected ${selectedFamily} subject signals lean toward ${inference.domain} ` +
      `while repaired intent remains ${intent.domain}; strongest signal=${selectedSignal}.`,
    metadata: {
      repairAttempted: true,
      repairOutcome: "warning_only",
      evidenceRefs,
      contextRefs: [...DOMAIN_CONTEXT_REFS],
    },
  });
}

export function detectThemeDomainMismatch(
  intent: NormalizedIntent,
  searchProfile: SearchProfileArtifact,
  selectionDecision: SelectionDecision,
  sourceSearchSummary: SourceSearchSummary,
  templatePriorSummary: TemplatePriorSummary | null,
): RuleJudgeIssue | null {
  if (intent.domain === "general_marketing") {
    return null;
  }

  const selectedFamily = deriveSelectedFamily(selectionDecision);
  const themeTexts = [
    ...collectSelectedThemeTexts(searchProfile, selectionDecision, sourceSearchSummary),
    ...collectPriorThemeTexts(templatePriorSummary),
  ];
  const inference = inferDomainFromTexts(themeTexts);
  if (
    inference.domain === null ||
    inference.domain === intent.domain ||
    inference.score < 2
  ) {
    return null;
  }

  const evidenceRefs = [
    "normalized-intent.json",
    ...deriveEvidenceRefs(inference.matches),
  ];
  const selectedSignal = describeSignal(inference.matches[0]);

  return surfaceRuleJudgeIssue("theme_domain_mismatch", {
    message:
      `Selected ${selectedFamily} theme signals lean toward ${inference.domain} ` +
      `while repaired intent remains ${intent.domain}; strongest signal=${selectedSignal}.`,
    metadata: {
      repairAttempted: true,
      repairOutcome: "warning_only",
      evidenceRefs,
      contextRefs: [...DOMAIN_CONTEXT_REFS],
    },
  });
}

export function detectTemplatePriorConflict(
  intent: NormalizedIntent,
  selectionDecision: SelectionDecision,
  templatePriorSummary: TemplatePriorSummary | null,
): RuleJudgeIssue | null {
  if (
    intent.domain === "general_marketing" ||
    !templatePriorSummary ||
    templatePriorSummary.dominantThemePrior === "none"
  ) {
    return null;
  }

  const selectedFamily = deriveSelectedFamily(selectionDecision);
  const selectedPriorFamily = mapSelectedFamilyToPriorFamily(selectedFamily);
  const selectedLanePrior =
    templatePriorSummary.selectedContentsThemePrior[selectedPriorFamily];
  const selectedTemplatePrior = templatePriorSummary.selectedTemplatePrior;
  const priorOwnsSelectionContext =
    (templatePriorSummary.dominantThemePrior === "template_prior" &&
      selectedTemplatePrior.status !== "unavailable") ||
    (templatePriorSummary.dominantThemePrior === "contents_theme_prior" &&
      selectedLanePrior.status !== "unavailable") ||
    (templatePriorSummary.dominantThemePrior === "mixed" &&
      (selectedTemplatePrior.status !== "unavailable" ||
        selectedLanePrior.status !== "unavailable"));

  if (!priorOwnsSelectionContext) {
    return null;
  }

  const inference = inferDomainFromTexts([
    ...collectPriorSubjectTexts(templatePriorSummary),
    ...collectPriorThemeTexts(templatePriorSummary),
  ]);
  if (
    inference.domain === null ||
    inference.domain === intent.domain ||
    inference.score < 2
  ) {
    return null;
  }

  return surfaceRuleJudgeIssue("template_prior_conflict", {
    message:
      `Dominant ${describeDominantPrior(templatePriorSummary, selectedPriorFamily)} leans toward ${inference.domain} ` +
      `while repaired intent remains ${intent.domain}, and the selected ${describeSelectionLane(selectedFamily)} lane kept that prior bias active; ` +
      `strongest signal=${describeSignal(inference.matches[0])}.`,
    metadata: {
      repairAttempted: true,
      repairOutcome: "warning_only",
      evidenceRefs: [
        "normalized-intent.json",
        "template-prior-summary.json",
        "selection-decision.json",
      ],
      contextRefs: [...PRIOR_CONTEXT_REFS],
    },
  });
}

export function detectPrimaryVisualDrift(
  intent: NormalizedIntent,
  selectionDecision: SelectionDecision,
  sourceSearchSummary: SourceSearchSummary,
): RuleJudgeIssue | null {
  if (intent.domain === "general_marketing") {
    return null;
  }

  const selectedFamily = deriveSelectedFamily(selectionDecision);
  const inference = inferDomainFromTexts(
    collectPrimaryVisualTexts(selectionDecision, sourceSearchSummary),
  );
  if (
    inference.domain === null ||
    inference.domain === intent.domain ||
    inference.score < 2
  ) {
    return null;
  }

  const evidenceRefs = new Set<string>([
    "normalized-intent.json",
    "selection-decision.json",
  ]);
  const selectedFamilySummary =
    selectedFamily === "photo"
      ? sourceSearchSummary.photo
      : sourceSearchSummary.graphic;
  if (selectedFamilySummary.queryAttempts.length > 0) {
    evidenceRefs.add("source-search-summary.json");
  }

  return surfaceRuleJudgeIssue("primary_visual_drift", {
    message:
      `Chosen ${selectedFamily}-led primary visual reads as ${inference.domain} ` +
      `while repaired intent remains ${intent.domain}; strongest signal=${describeSignal(
        inference.matches[0],
      )}.`,
    metadata: {
      repairAttempted: true,
      repairOutcome: "warning_only",
      evidenceRefs: [...evidenceRefs],
      contextRefs: [...DOMAIN_CONTEXT_REFS],
    },
  });
}
