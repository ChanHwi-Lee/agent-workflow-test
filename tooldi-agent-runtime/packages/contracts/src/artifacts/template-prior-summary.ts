import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { IdentifierSchema } from "../common.js";

const PlannerModeSchema = Type.Union(
  ["heuristic", "langchain"].map((value) => Type.Literal(value)),
);

const PriorStatusSchema = Type.Union(
  ["selected", "competitive_only", "supportive_only", "unavailable"].map((value) =>
    Type.Literal(value),
  ),
);

const PriorCompetitivenessSchema = Type.Union(
  ["mandatory", "competitive_only", "supportive_only", "not_applicable"].map(
    (value) => Type.Literal(value),
  ),
);

const PriorFamilySchema = Type.Union(
  ["template", "shape", "picture"].map((value) => Type.Literal(value)),
);

const DominantThemePriorSchema = Type.Union(
  ["template_prior", "contents_theme_prior", "mixed", "none"].map((value) =>
    Type.Literal(value),
  ),
);

const RankingBiasEffectSchema = Type.Union(
  ["promote", "demote", "tie_break", "supportive_only"].map((value) =>
    Type.Literal(value),
  ),
);

const MatchStrengthSchema = Type.Union(
  ["primary", "supporting"].map((value) => Type.Literal(value)),
);

const RefListSchema = Type.Array(Type.String({ minLength: 1 }), { minItems: 1 });

const PriorEvidenceMatchSchema = Type.Object(
  {
    family: PriorFamilySchema,
    signal: Type.String({ minLength: 1 }),
    strength: MatchStrengthSchema,
    summary: Type.String({ minLength: 1 }),
    evidenceRefs: RefListSchema,
  },
  { additionalProperties: false },
);

const RankingBiasSchema = Type.Object(
  {
    bias: Type.String({ minLength: 1 }),
    effect: RankingBiasEffectSchema,
    rationale: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

const TemplatePriorCandidateSchema = Type.Object(
  {
    rank: Type.Integer({ minimum: 1 }),
    sourceSignal: Type.String({ minLength: 1 }),
    keyword: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    categorySerial: Type.Union([IdentifierSchema, Type.Null()]),
    status: PriorStatusSchema,
    competitiveness: PriorCompetitivenessSchema,
    selected: Type.Boolean(),
    rationale: Type.String({ minLength: 1 }),
    evidenceRefs: RefListSchema,
    contextRefs: RefListSchema,
  },
  { additionalProperties: false },
);

const PriorRankingRationaleEntrySchema = Type.Object(
  {
    order: Type.Integer({ minimum: 1 }),
    signal: Type.String({ minLength: 1 }),
    outcome: Type.String({ minLength: 1 }),
    rationale: Type.String({ minLength: 1 }),
    evidenceRefs: RefListSchema,
    contextRefs: RefListSchema,
  },
  { additionalProperties: false },
);

const TemplatePriorSelectionSchema = Type.Object(
  {
    status: PriorStatusSchema,
    competitiveness: PriorCompetitivenessSchema,
    summary: Type.String({ minLength: 1 }),
    keyword: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    categorySerial: Type.Union([IdentifierSchema, Type.Null()]),
    querySurface: Type.String({ minLength: 1 }),
    evidenceRefs: RefListSchema,
    contextRefs: RefListSchema,
  },
  { additionalProperties: false },
);

const ContentsThemePriorSelectionSchema = Type.Object(
  {
    family: PriorFamilySchema,
    status: PriorStatusSchema,
    serial: Type.Union([IdentifierSchema, Type.Null()]),
    summary: Type.String({ minLength: 1 }),
    evidenceRefs: RefListSchema,
    contextRefs: RefListSchema,
  },
  { additionalProperties: false },
);

const PriorFamilyCoverageSchema = Type.Object(
  {
    template: Type.Boolean(),
    shape: Type.Boolean(),
    picture: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const TemplatePriorSummarySchema = Type.Object(
  {
    summaryId: IdentifierSchema,
    runId: IdentifierSchema,
    traceId: IdentifierSchema,
    plannerMode: PlannerModeSchema,
    templatePriorCandidates: Type.Array(TemplatePriorCandidateSchema, {
      minItems: 1,
    }),
    selectedTemplatePrior: TemplatePriorSelectionSchema,
    selectedContentsThemePrior: Type.Object(
      {
        template: ContentsThemePriorSelectionSchema,
        shape: ContentsThemePriorSelectionSchema,
        picture: ContentsThemePriorSelectionSchema,
      },
      { additionalProperties: false },
    ),
    dominantThemePrior: DominantThemePriorSchema,
    contentsThemePriorMatches: Type.Array(PriorEvidenceMatchSchema),
    keywordThemeMatches: Type.Array(PriorEvidenceMatchSchema),
    familyCoverage: PriorFamilyCoverageSchema,
    rankingBiases: Type.Array(RankingBiasSchema),
    rankingRationaleEntries: Type.Array(PriorRankingRationaleEntrySchema, {
      minItems: 1,
    }),
    summary: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export type TemplatePriorSummary = Static<typeof TemplatePriorSummarySchema>;
