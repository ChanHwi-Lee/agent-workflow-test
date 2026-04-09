import assert from "node:assert/strict";
import test from "node:test";

import type { TemplatePriorSummary } from "@tooldi/agent-contracts";

import {
  createFashionRetailNormalizedIntent,
  fashionRetailGraphicFirstAssetPolicy,
} from "../testFixtures/tooldiTaxonomyFixtures.js";
import { buildTemplatePriorSummary } from "./buildTemplatePriorSummary.js";

function assertTemplatePriorSummaryPayloadShape(
  summary: TemplatePriorSummary,
): void {
  assert.deepEqual(Object.keys(summary), [
    "summaryId",
    "runId",
    "traceId",
    "plannerMode",
    "templatePriorCandidates",
    "selectedTemplatePrior",
    "selectedContentsThemePrior",
    "dominantThemePrior",
    "contentsThemePriorMatches",
    "keywordThemeMatches",
    "familyCoverage",
    "rankingBiases",
    "rankingRationaleEntries",
    "summary",
  ]);
  assert.equal(typeof summary.summaryId, "string");
  assert.equal(typeof summary.runId, "string");
  assert.equal(typeof summary.traceId, "string");
  assert.equal(typeof summary.selectedTemplatePrior.querySurface, "string");
  assert.equal(summary.templatePriorCandidates.length > 0, true);
  assert.equal(summary.rankingRationaleEntries.length > 0, true);
  assert.equal(summary.selectedContentsThemePrior.template.family, "template");
  assert.equal(summary.selectedContentsThemePrior.shape.family, "shape");
  assert.equal(summary.selectedContentsThemePrior.picture.family, "picture");
  assert.equal(summary.templatePriorCandidates.every((candidate) => candidate.evidenceRefs.length > 0), true);
  assert.equal(summary.templatePriorCandidates.every((candidate) => candidate.contextRefs.length > 0), true);
  assert.equal(
    summary.rankingRationaleEntries.every(
      (entry) => entry.evidenceRefs.length > 0 && entry.contextRefs.length > 0,
    ),
    true,
  );
}

test("buildTemplatePriorSummary derives a grounded lightweight template prior for fashion retail spring sale banners", async () => {
  const summary = await buildTemplatePriorSummary(
    createFashionRetailNormalizedIntent(),
  );

  assertTemplatePriorSummaryPayloadShape(summary);
  assert.equal(summary.selectedTemplatePrior.status, "competitive_only");
  assert.equal(summary.selectedTemplatePrior.competitiveness, "competitive_only");
  assert.equal(summary.selectedTemplatePrior.keyword, "봄");
  assert.equal(summary.selectedTemplatePrior.categorySerial, "0006");
  assert.deepEqual(
    summary.templatePriorCandidates.map((candidate) => ({
      rank: candidate.rank,
      sourceSignal: candidate.sourceSignal,
      keyword: candidate.keyword,
      selected: candidate.selected,
    })),
    [
      {
        rank: 1,
        sourceSignal: "seasonality:spring",
        keyword: "봄",
        selected: true,
      },
      {
        rank: 2,
        sourceSignal: "promotion_style:sale_campaign",
        keyword: "세일",
        selected: false,
      },
      {
        rank: 3,
        sourceSignal: "domain:fashion_retail",
        keyword: "패션",
        selected: false,
      },
    ],
  );
  assert.equal(
    summary.selectedTemplatePrior.querySurface,
    "POST /editor/get_templates (keyword, canvas, categorySerial, price, follow, page)",
  );
  assert.equal(summary.dominantThemePrior, "template_prior");
  assert.deepEqual(summary.familyCoverage, {
    template: true,
    shape: true,
    picture: true,
  });
  assert.deepEqual(summary.selectedContentsThemePrior.shape, {
    family: "shape",
    status: "supportive_only",
    serial: null,
    summary:
      "Spring theme evidence remains available for shape (locked active families=6), but this slice does not resolve a concrete contents_theme serial yet.",
    evidenceRefs: [
      "tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md:153",
      "tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md:276",
      "/home/ubuntu/github/tooldi/TOOLDi_API_PHP/application/controllers/Picture.php:41",
      "/home/ubuntu/github/tooldi/TOOLDi_API_PHP/application/controllers/Shape.php:40",
    ],
    contextRefs: [
      "tooldi-agent-workflow-v1-create-template-current-state-as-is.md:89",
      "tooldi-agent-workflow-v1-tooldi-content-discovery.md:534",
    ],
  });
  assert.ok(
    summary.contentsThemePriorMatches.some(
      (match) =>
        match.family === "shape" &&
        match.signal === "seasonality:spring" &&
        match.summary.includes("44291 active spring shape assets"),
    ),
  );
  assert.ok(
    summary.keywordThemeMatches.some(
      (match) =>
        match.family === "template" &&
        match.signal === "template_keyword:봄" &&
        match.summary.includes("category 0006"),
    ),
  );
  assert.ok(
    summary.rankingBiases.some(
      (bias) =>
        bias.bias === "shape_lane_stable_weight" &&
        bias.effect === "promote",
    ),
  );
  assert.deepEqual(
    summary.rankingRationaleEntries.map((entry) => entry.signal),
    [
      "template_prior_candidate_order",
      "contents_theme_family_coverage",
      "asset_policy_graphic_weight",
      "domain_weighting_fashion_sale",
    ],
  );
  assert.ok(
    summary.rankingRationaleEntries[0]?.outcome.includes("keyword '봄'"),
  );
  assert.ok(
    summary.rankingRationaleEntries[0]?.rationale.includes(
      "#1 봄 via seasonality:spring -> #2 세일 via promotion_style:sale_campaign -> #3 패션 via domain:fashion_retail",
    ),
  );
  assert.ok(summary.summary.includes("template keyword '봄'"));
});

test("buildTemplatePriorSummary keeps the Tooldi taxonomy ranking rationale deterministic across repeated fixture runs", async () => {
  const intent = createFashionRetailNormalizedIntent();
  const first = await buildTemplatePriorSummary(intent);
  const second = await buildTemplatePriorSummary(intent);

  assertTemplatePriorSummaryPayloadShape(first);
  assertTemplatePriorSummaryPayloadShape(second);
  assert.deepEqual(
    first.templatePriorCandidates.map((candidate) => ({
      rank: candidate.rank,
      sourceSignal: candidate.sourceSignal,
      keyword: candidate.keyword,
      status: candidate.status,
      competitiveness: candidate.competitiveness,
      selected: candidate.selected,
      rationale: candidate.rationale,
      evidenceRefs: candidate.evidenceRefs,
      contextRefs: candidate.contextRefs,
    })),
    second.templatePriorCandidates.map((candidate) => ({
      rank: candidate.rank,
      sourceSignal: candidate.sourceSignal,
      keyword: candidate.keyword,
      status: candidate.status,
      competitiveness: candidate.competitiveness,
      selected: candidate.selected,
      rationale: candidate.rationale,
      evidenceRefs: candidate.evidenceRefs,
      contextRefs: candidate.contextRefs,
    })),
  );
  assert.deepEqual(
    first.rankingRationaleEntries.map((entry) => ({
      order: entry.order,
      signal: entry.signal,
      outcome: entry.outcome,
      rationale: entry.rationale,
      evidenceRefs: entry.evidenceRefs,
      contextRefs: entry.contextRefs,
    })),
    second.rankingRationaleEntries.map((entry) => ({
      order: entry.order,
      signal: entry.signal,
      outcome: entry.outcome,
      rationale: entry.rationale,
      evidenceRefs: entry.evidenceRefs,
      contextRefs: entry.contextRefs,
    })),
  );
  assert.deepEqual(
    first.rankingRationaleEntries.map((entry) => entry.order),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    first.rankingRationaleEntries.map((entry) => entry.signal),
    [
      "template_prior_candidate_order",
      "contents_theme_family_coverage",
      "asset_policy_graphic_weight",
      "domain_weighting_fashion_sale",
    ],
  );
  assert.ok(
    first.rankingRationaleEntries[0]?.outcome.includes("keyword '봄'"),
  );
  assert.ok(
    first.rankingRationaleEntries[0]?.rationale.includes(
      "#1 봄 via seasonality:spring -> #2 세일 via promotion_style:sale_campaign -> #3 패션 via domain:fashion_retail",
    ),
  );
  assert.ok(
    first.rankingRationaleEntries[2]?.rationale.includes(
      "shape/vector-heavy success paths",
    ),
  );
});

test("buildTemplatePriorSummary keeps theme priors explicit but non-controlling when no grounded spring theme exists", async () => {
  const summary = await buildTemplatePriorSummary(
    createFashionRetailNormalizedIntent({
      goalSummary: "일반 프로모션 배너",
      templateKind: "promo_banner",
      domain: "general_marketing",
      audience: "general_consumers",
      campaignGoal: "promotion_awareness",
      canvasPreset: "square_1080",
      assetPolicy: {
        allowedFamilies: ["graphic"],
        preferredFamilies: ["graphic"],
        primaryVisualPolicy: "graphic_preferred",
        avoidFamilies: ["photo"],
      },
      searchKeywords: ["프로모션", "배너"],
      facets: {
        seasonality: null,
        menuType: null,
        promotionStyle: "general_campaign",
        offerSpecificity: "multi_item",
      },
      brandConstraints: {
        palette: ["#f4f4f4"],
        typographyHint: null,
        forbiddenStyles: [],
      },
    }),
  );

  assert.deepEqual(summary.familyCoverage, {
    template: true,
    shape: false,
    picture: false,
  });
  assert.equal(summary.selectedTemplatePrior.status, "supportive_only");
  assert.equal(summary.selectedTemplatePrior.keyword, "프로모션");
  assert.equal(summary.selectedTemplatePrior.categorySerial, "0002");
  assert.equal(summary.selectedContentsThemePrior.template.status, "unavailable");
  assert.equal(summary.selectedContentsThemePrior.shape.status, "unavailable");
  assert.equal(summary.selectedContentsThemePrior.picture.status, "unavailable");
  assert.deepEqual(summary.contentsThemePriorMatches, []);
  assert.ok(
    summary.keywordThemeMatches.some(
      (match) =>
        match.family === "template" &&
        match.signal === "template_keyword:프로모션",
    ),
  );
  assert.ok(
    summary.rankingBiases.some(
      (bias) =>
        bias.bias === "photo_lane_not_executed" &&
        bias.effect === "supportive_only",
    ),
  );
  assert.deepEqual(
    summary.rankingBiases.some((bias) => bias.bias === "shape_lane_stable_weight"),
    true,
  );
  assert.deepEqual(
    summary.rankingRationaleEntries.map((entry) => entry.signal),
    [
      "template_prior_candidate_order",
      "contents_theme_family_coverage",
      "asset_policy_graphic_weight",
    ],
  );
  assert.ok(
    summary.rankingRationaleEntries[1]?.outcome.includes(
      "No grounded contents_theme prior was available",
    ),
  );
  assert.equal(summary.dominantThemePrior, "template_prior");
});

test("buildTemplatePriorSummary suppresses leaked subject priors for generic promo intents", async () => {
  const summary = await buildTemplatePriorSummary(
    createFashionRetailNormalizedIntent({
      goalSummary: "봄 세일 배너를 만들어줘",
      templateKind: "seasonal_sale_banner",
      domain: "general_marketing",
      audience: "general_consumers",
      campaignGoal: "sale_conversion",
      assetPolicy: {
        allowedFamilies: ["background", "graphic", "photo"],
        preferredFamilies: ["graphic"],
        primaryVisualPolicy: "graphic_preferred",
        avoidFamilies: [],
      },
      searchKeywords: ["봄", "세일", "이벤트", "할인"],
      facets: {
        seasonality: "spring",
        menuType: null,
        promotionStyle: "sale_campaign",
        offerSpecificity: "broad_offer",
      },
    }),
  );

  assert.equal(
    summary.templatePriorCandidates.some((candidate) =>
      candidate.sourceSignal.startsWith("menu_type:"),
    ),
    false,
  );
  assert.equal(
    summary.templatePriorCandidates.some((candidate) =>
      candidate.sourceSignal.startsWith("domain:"),
    ),
    false,
  );
  assert.equal(summary.selectedTemplatePrior.keyword, "봄");
});

test("buildTemplatePriorSummary preserves the fixture's graphic-first bias without fabricating photo dominance", async () => {
  const summary = await buildTemplatePriorSummary(
    createFashionRetailNormalizedIntent({
      assetPolicy: fashionRetailGraphicFirstAssetPolicy,
    }),
  );

  assert.equal(summary.selectedContentsThemePrior.picture.status, "supportive_only");
  assert.ok(
    summary.rankingBiases.some(
      (bias) =>
        bias.bias === "shape_lane_stable_weight" &&
        bias.rationale.includes("shape/vector-heavy outcomes"),
    ),
  );
  assert.equal(
    summary.rankingBiases.some(
      (bias) => bias.bias === "photo_lane_optional_weight",
    ),
    false,
  );
  assert.equal(
    summary.rankingRationaleEntries[2]?.signal,
    "asset_policy_graphic_weight",
  );
  assert.ok(
    summary.rankingRationaleEntries[2]?.rationale.includes(
      "shape/vector-heavy success paths",
    ),
  );
});
