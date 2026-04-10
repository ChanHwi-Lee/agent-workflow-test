import assert from "node:assert/strict";
import test from "node:test";

import { createTestRun } from "@tooldi/agent-testkit";
import {
  createTemplateCatalogClient,
  createPlaceholderTooldiCatalogSourceClient,
  type TooldiCatalogSourceClient,
} from "@tooldi/tool-adapters";

import { createFashionRetailNormalizedIntent } from "../testFixtures/tooldiTaxonomyFixtures.js";
import { assembleTemplateCandidates, SpringCatalogActivationError } from "./assembleTemplateCandidates.js";
import { buildSearchProfile } from "./buildSearchProfile.js";
import { buildTemplatePriorSummary } from "./buildTemplatePriorSummary.js";

test("플레이스홀더 모드에서 후보 세트와 소스 요약을 함께 조립한다", async () => {
  const testRun = createTestRun({
    userInput: {
      prompt: "패션 리테일 봄 세일 배너를 만들어줘",
      locale: "ko-KR",
      timezone: "Asia/Seoul",
    },
  });
  const input = {
    job: testRun.job,
    request: testRun.request,
    snapshot: testRun.snapshot,
    requestRef: testRun.requestRef,
    snapshotRef: testRun.snapshotRef,
    repairContext: null,
  };
  const intent = createFashionRetailNormalizedIntent({
    runId: testRun.job.runId,
    traceId: testRun.job.traceId,
  });
  const templatePriorSummary = await buildTemplatePriorSummary(intent);
  const searchProfile = await buildSearchProfile(intent, templatePriorSummary);

  const result = await assembleTemplateCandidates(
    input,
    intent,
    searchProfile,
    templatePriorSummary,
    {
      templateCatalogClient: createTemplateCatalogClient(),
      tooldiCatalogSourceClient: createPlaceholderTooldiCatalogSourceClient(),
      sourceMode: "placeholder",
      allowPhotoCandidates: true,
    },
  );

  assert.ok(result.candidates.background.candidates.length > 0);
  assert.ok(result.candidates.layout.candidates.length > 0);
  assert.ok(result.candidates.decoration.candidates.length > 0);
  assert.equal(result.sourceSearch.background.returnedCount, result.candidates.background.candidates.length);
  assert.equal(result.sourceSearch.graphic.returnedCount, result.candidates.decoration.candidates.length);
});

test("실소스 모드에서 배경 후보가 비면 Spring 활성화 오류를 던진다", async () => {
  const testRun = createTestRun({
    userInput: {
      prompt: "패션 리테일 봄 세일 배너를 만들어줘",
      locale: "ko-KR",
      timezone: "Asia/Seoul",
    },
  });
  const input = {
    job: testRun.job,
    request: testRun.request,
    snapshot: testRun.snapshot,
    requestRef: testRun.requestRef,
    snapshotRef: testRun.snapshotRef,
    repairContext: null,
  };
  const intent = createFashionRetailNormalizedIntent({
    runId: testRun.job.runId,
    traceId: testRun.job.traceId,
  });
  const templatePriorSummary = await buildTemplatePriorSummary(intent);
  const searchProfile = await buildSearchProfile(intent, templatePriorSummary);

  const emptySourceClient = {
    async searchBackgroundAssets() {
      return { assets: [] };
    },
    async searchGraphicAssets() {
      return { assets: [] };
    },
    async searchPhotoAssets() {
      return { assets: [] };
    },
  } as unknown as TooldiCatalogSourceClient;

  await assert.rejects(
    () =>
      assembleTemplateCandidates(
        input,
        intent,
        searchProfile,
        templatePriorSummary,
        {
          templateCatalogClient: createTemplateCatalogClient(),
          tooldiCatalogSourceClient: emptySourceClient,
          sourceMode: "tooldi_api",
          allowPhotoCandidates: true,
        },
      ),
    (error: unknown) =>
      error instanceof SpringCatalogActivationError &&
      error.code === "background_candidates_empty",
  );
});
