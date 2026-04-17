import assert from "node:assert/strict";
import test from "node:test";

import {
  TemplateAbstractLayoutDraftSchema,
  TemplateCopyPlanDraftSchema,
} from "./templatePlannerSchemas.js";

function buildCopyPlanSlot(): Record<string, unknown> {
  return {
    text: "샘플 텍스트",
    priority: "primary",
    required: true,
    maxLength: 20,
    toneHint: null,
  };
}

function buildValidCopyPlanDraft(summary: string): Record<string, unknown> {
  return {
    headline: buildCopyPlanSlot(),
    subheadline: null,
    offerLine: null,
    cta: buildCopyPlanSlot(),
    footerNote: null,
    badgeText: null,
    summary,
  };
}

function buildValidAbstractLayoutDraft(summary: string): Record<string, unknown> {
  return {
    layoutFamily: "subject_hero",
    copyAnchor: "center",
    visualAnchor: "background",
    ctaAnchor: "below_copy",
    density: "airy",
    slotTopology: "hero_headline_supporting_cta_footer",
    summary,
  };
}

test("TemplateCopyPlanDraftSchema accepts a 400-character English summary", () => {
  const englishSummary = "a".repeat(400);
  const result = TemplateCopyPlanDraftSchema.safeParse(
    buildValidCopyPlanDraft(englishSummary),
  );
  assert.equal(result.success, true, result.success ? "" : JSON.stringify(result.error));
});

test("TemplateCopyPlanDraftSchema rejects a 401-character summary", () => {
  const tooLong = "a".repeat(401);
  const result = TemplateCopyPlanDraftSchema.safeParse(
    buildValidCopyPlanDraft(tooLong),
  );
  assert.equal(result.success, false);
});

test("TemplateAbstractLayoutDraftSchema accepts a 400-character English summary", () => {
  // Real-world failing case: English-language summary for restaurant spring menu
  const englishSummary =
    "A bright and playful hero-focused layout for a spring seasonal menu launch, featuring a central headline and supporting text over a full-bleed food photography background that highlights the season's fresh ingredients and a prominent call-to-action below the copy block.";
  assert.ok(
    englishSummary.length > 160,
    "fixture must exceed the previous 160-char bound",
  );
  assert.ok(
    englishSummary.length <= 400,
    "fixture must fit within the new 400-char bound",
  );
  const result = TemplateAbstractLayoutDraftSchema.safeParse(
    buildValidAbstractLayoutDraft(englishSummary),
  );
  assert.equal(result.success, true, result.success ? "" : JSON.stringify(result.error));
});

test("TemplateAbstractLayoutDraftSchema rejects a 401-character summary", () => {
  const tooLong = "a".repeat(401);
  const result = TemplateAbstractLayoutDraftSchema.safeParse(
    buildValidAbstractLayoutDraft(tooLong),
  );
  assert.equal(result.success, false);
});

test("TemplateCopyPlanDraftSchema still accepts a short Korean summary", () => {
  const result = TemplateCopyPlanDraftSchema.safeParse(
    buildValidCopyPlanDraft("봄 시즌 신메뉴 프로모션 배너 구성"),
  );
  assert.equal(result.success, true, result.success ? "" : JSON.stringify(result.error));
});
