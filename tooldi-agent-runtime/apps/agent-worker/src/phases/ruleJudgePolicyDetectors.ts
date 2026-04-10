import {
  normalizeTemplateAssetPolicy,
  templateAssetPolicyAllowsFamily,
} from "@tooldi/agent-llm";

import type {
  NormalizedIntent,
  RuleJudgeIssue,
  SearchProfileArtifact,
  SelectionDecision,
  SourceSearchSummary,
} from "../types.js";
import {
  describeSignal,
  DOMAIN_CONTEXT_REFS,
  inferDomainFromTexts,
  POLICY_CONTEXT_REFS,
} from "./ruleJudgeDomainAnalysis.js";
import { surfaceRuleJudgeIssue } from "./ruleJudgeIssueDefinitions.js";
import {
  collectFashionRetailMenuContradictionReasons,
  collectSearchProfileContractMismatches,
  collectSearchProfileLaneTexts,
  describeSelectionLane,
  deriveSelectedFamily,
} from "./ruleJudgeSelectionContext.js";

export function detectSearchProfileIntentMismatch(
  intent: NormalizedIntent,
  searchProfile: SearchProfileArtifact,
  selectionDecision: SelectionDecision,
): RuleJudgeIssue | null {
  const selectedFamily = deriveSelectedFamily(selectionDecision);
  const contractMismatches = collectSearchProfileContractMismatches(
    intent,
    searchProfile,
  );
  const retailMenuContradictionReasons =
    collectFashionRetailMenuContradictionReasons(intent, searchProfile);
  const directionMismatch =
    selectedFamily === "photo" &&
    (!searchProfile.photo.enabled || searchProfile.photo.queries.length === 0);
  const inference =
    intent.domain === "general_marketing"
      ? { domain: null, score: 0, matches: [] }
      : inferDomainFromTexts(
          collectSearchProfileLaneTexts(searchProfile, selectionDecision),
        );
  const semanticMismatch =
    intent.domain !== "general_marketing" &&
    inference.domain !== null &&
    inference.domain !== intent.domain &&
    inference.score >= 2;

  if (
    contractMismatches.length === 0 &&
    retailMenuContradictionReasons.length === 0 &&
    !directionMismatch &&
    !semanticMismatch
  ) {
    return null;
  }

  const reasons: string[] = [];
  if (contractMismatches.length > 0) {
    reasons.push(`drifted fields=${contractMismatches.join(", ")}`);
  }
  if (retailMenuContradictionReasons.length > 0) {
    reasons.push(
      `fashion_retail/menu contradiction survived repair: ${retailMenuContradictionReasons.join("; ")}`,
    );
  }
  if (directionMismatch) {
    reasons.push(
      "selected photo direction has no enabled canonical picture query lane",
    );
  }
  if (semanticMismatch) {
    reasons.push(
      `selected ${selectedFamily} search lane leans toward ${inference.domain}; strongest signal=${describeSignal(
        inference.matches[0],
      )}`,
    );
  }

  return surfaceRuleJudgeIssue("search_profile_intent_mismatch", {
    message:
      `Search profile no longer aligns with repaired ${intent.domain} intent ` +
      `for the selected ${selectedFamily} direction: ${reasons.join("; ")}.`,
    metadata: {
      repairAttempted: true,
      repairOutcome: "warning_only",
      evidenceRefs: [
        "normalized-intent.json",
        "search-profile.json",
        "selection-decision.json",
      ],
      contextRefs: [...DOMAIN_CONTEXT_REFS],
    },
  });
}

export function detectAssetPolicyConflict(
  intent: NormalizedIntent,
  searchProfile: SearchProfileArtifact,
  selectionDecision: SelectionDecision,
  sourceSearchSummary: SourceSearchSummary,
): RuleJudgeIssue | null {
  const assetPolicy = normalizeTemplateAssetPolicy(intent.assetPolicy);
  const selectedFamily = deriveSelectedFamily(selectionDecision);
  const selectedLane = describeSelectionLane(selectedFamily);
  const reasons: string[] = [];
  const evidenceRefs = new Set<string>([
    "normalized-intent.json",
    "selection-decision.json",
  ]);

  if (!templateAssetPolicyAllowsFamily(assetPolicy, selectedFamily)) {
    evidenceRefs.add("search-profile.json");
    reasons.push(
      `selected ${selectedLane} lane is outside allowedFamilies=${assetPolicy.allowedFamilies.join("/")}`,
    );
  }

  if (!templateAssetPolicyAllowsFamily(assetPolicy, "photo")) {
    if (searchProfile.photo.enabled) {
      reasons.push(
        "picture lane stayed enabled on search-profile despite repaired policy removing picture eligibility",
      );
      evidenceRefs.add("search-profile.json");
    }
    if (
      selectionDecision.photoBranchMode === "photo_selected" ||
      selectionDecision.topPhotoCandidateId !== null
    ) {
      evidenceRefs.add("search-profile.json");
      reasons.push(
        "picture candidate context remained active during selection despite repaired policy removing picture eligibility",
      );
    }
    if (sourceSearchSummary.photo.queryAttempts.length > 0) {
      reasons.push(
        "picture query attempts still executed on the real Picture::index surface after repair removed picture eligibility",
      );
      evidenceRefs.add("source-search-summary.json");
    }
  }

  if (!templateAssetPolicyAllowsFamily(assetPolicy, "graphic")) {
    if (searchProfile.graphic.queries.length > 0) {
      reasons.push(
        "shape lane stayed enabled on search-profile despite repaired policy removing shape eligibility",
      );
      evidenceRefs.add("search-profile.json");
    }
    if (
      selectedFamily === "graphic" ||
      selectionDecision.selectedDecorationAssetId !== null ||
      selectionDecision.selectedDecorationCandidateId.length > 0
    ) {
      evidenceRefs.add("search-profile.json");
      reasons.push(
        "shape candidate context remained active during selection despite repaired policy removing shape eligibility",
      );
    }
    if (sourceSearchSummary.graphic.queryAttempts.length > 0) {
      reasons.push(
        "shape query attempts still executed on the real Shape::index surface after repair removed shape eligibility",
      );
      evidenceRefs.add("source-search-summary.json");
    }
  }

  if (reasons.length === 0) {
    return null;
  }

  return surfaceRuleJudgeIssue("asset_policy_conflict", {
    message:
      `Selected ${selectedLane} result conflicts with repaired asset policy ` +
      `(allowed=${assetPolicy.allowedFamilies.join("/")}, preferred=${assetPolicy.preferredFamilies.join("/")}, primary=${assetPolicy.primaryVisualPolicy}): ` +
      `${reasons.join("; ")}.`,
    metadata: {
      repairAttempted: true,
      repairOutcome: "warning_only",
      evidenceRefs: [...evidenceRefs],
      contextRefs: [...POLICY_CONTEXT_REFS],
    },
  });
}
