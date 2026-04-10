import type {
  NormalizedIntent,
} from "../types.js";

type DomainFamily = Exclude<NormalizedIntent["domain"], "general_marketing">;

interface DomainTokenSpec {
  strong: string[];
  weak: string[];
}

export interface DomainSignalMatch {
  domain: DomainFamily;
  token: string;
  source: string;
  weight: number;
}

export interface DomainSignalInference {
  domain: DomainFamily | null;
  score: number;
  matches: DomainSignalMatch[];
}

const DOMAIN_TOKEN_SPECS: Record<DomainFamily, DomainTokenSpec> = {
  restaurant: {
    strong: [
      "레스토랑",
      "브런치",
      "요리",
      "식사",
      "런치",
      "다이닝",
      "푸드",
      "음식",
      "restaurant",
      "brunch",
      "dining",
      "food",
    ],
    weak: ["메뉴", "menu"],
  },
  cafe: {
    strong: [
      "카페",
      "커피",
      "콜드브루",
      "라떼",
      "에이드",
      "티",
      "음료",
      "cafe",
      "coffee",
      "drink",
      "beverage",
      "latte",
      "tea",
      "cold brew",
    ],
    weak: ["디저트", "dessert"],
  },
  fashion_retail: {
    strong: [
      "패션",
      "리테일",
      "의류",
      "쇼핑",
      "스타일",
      "룩북",
      "브랜드",
      "어패럴",
      "fashion",
      "retail",
      "apparel",
      "shopping",
      "style",
    ],
    weak: ["세일", "sale"],
  },
};

export const RETAIL_MENU_CONTRADICTION_FLAG_CODES = new Set([
  "fashion_menu_photo_contradiction",
  "menu_type_domain_conflict",
  "promotion_style_domain_conflict",
  "search_keyword_subject_drift",
]);

export const DOMAIN_CONTEXT_REFS = [
  "CURRENT_RULE_JUDGE",
  "TOBE_JUDGE_RULES",
  "TOBE_DOMAIN_WEIGHTING",
  "PICTURE_QUERY_SURFACE",
  "SHAPE_QUERY_SURFACE",
] as const;

export const POLICY_CONTEXT_REFS = [
  "CURRENT_RULE_JUDGE",
  "TOBE_JUDGE_RULES",
  "TOBE_ASSET_POLICY_V2",
  "PICTURE_QUERY_SURFACE",
  "SHAPE_QUERY_SURFACE",
] as const;

export const PRIOR_CONTEXT_REFS = [
  "CURRENT_RULE_JUDGE",
  "TOBE_JUDGE_RULES",
  "TOBE_TEMPLATE_PRIOR_RULES",
  "PICTURE_QUERY_SURFACE",
  "SHAPE_QUERY_SURFACE",
] as const;

export function inferDomainFromTexts(
  inputs: Array<{ source: string; text: string }>,
): DomainSignalInference {
  const matches: DomainSignalMatch[] = [];

  for (const input of inputs) {
    const normalized = normalizeSignalText(input.text);
    if (!normalized) {
      continue;
    }

    for (const [domain, spec] of Object.entries(DOMAIN_TOKEN_SPECS) as Array<
      [DomainFamily, DomainTokenSpec]
    >) {
      for (const token of spec.strong) {
        if (normalized.includes(token.toLowerCase())) {
          matches.push({
            domain,
            token,
            source: input.source,
            weight: 2,
          });
        }
      }
      for (const token of spec.weak) {
        if (normalized.includes(token.toLowerCase())) {
          matches.push({
            domain,
            token,
            source: input.source,
            weight: 1,
          });
        }
      }
    }
  }

  let winner: DomainFamily | null = null;
  let winnerScore = 0;
  let runnerUpScore = 0;

  for (const domain of Object.keys(DOMAIN_TOKEN_SPECS) as DomainFamily[]) {
    const score = matches
      .filter((match) => match.domain === domain)
      .reduce((total, match) => total + match.weight, 0);
    if (score > winnerScore) {
      runnerUpScore = winnerScore;
      winner = domain;
      winnerScore = score;
      continue;
    }
    if (score > runnerUpScore) {
      runnerUpScore = score;
    }
  }

  if (winner === null || winnerScore === 0 || winnerScore <= runnerUpScore) {
    return {
      domain: null,
      score: winnerScore,
      matches: [],
    };
  }

  return {
    domain: winner,
    score: winnerScore,
    matches: matches.filter((match) => match.domain === winner),
  };
}

export function deriveEvidenceRefs(matches: DomainSignalMatch[]): string[] {
  const refs = new Set<string>();

  for (const match of matches) {
    if (match.source.startsWith("searchProfile.")) {
      refs.add("search-profile.json");
      continue;
    }
    if (match.source.startsWith("sourceSearchSummary.")) {
      refs.add("source-search-summary.json");
      continue;
    }
    if (match.source.startsWith("selectionDecision.")) {
      refs.add("selection-decision.json");
      continue;
    }
    if (match.source.startsWith("templatePriorSummary.")) {
      refs.add("template-prior-summary.json");
    }
  }

  return [...refs];
}

export function describeSignal(match: DomainSignalMatch | undefined): string {
  if (!match) {
    return "n/a";
  }
  return `${match.token} @ ${match.source}`;
}

export function pushSignalText(
  target: Array<{ source: string; text: string }>,
  source: string,
  value: string | null,
) {
  const text = normalizeSignalText(value);
  if (!text) {
    return;
  }
  target.push({ source, text });
}

export function queryFieldToString(value: string | number | boolean | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
}

export function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function sameJsonValue(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function normalizeSignalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}
